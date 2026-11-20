-- ServiTec SaaS, fase 2: reglas de negocio que antes vivían en Code.gs, ahora en la base.
-- Así valen aunque alguien llame a la API directamente sin pasar por la app.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- clientes

-- Un cliente por nombre dentro de cada empresa (sin distinguir mayúsculas ni espacios sobrantes)
create unique index clientes_nombre_unico on public.clientes (empresa_id, lower(trim(nombre)));

-- Solo el superadmin elimina clientes, y solo si no tienen visitas
drop policy clientes_gestionar on public.clientes;
-- El técnico no consulta el catálogo de clientes (como en Code.gs)
drop policy clientes_ver on public.clientes;
create policy clientes_ver on public.clientes for select using (empresa_id = app.empresa_actual() and app.es_gestor());
create policy clientes_crear on public.clientes for insert with check (app.es_gestor());
create policy clientes_editar on public.clientes for update
  using (empresa_id = app.empresa_actual() and app.es_gestor());
create policy clientes_borrar on public.clientes for delete
  using (empresa_id = app.empresa_actual() and app.es_superadmin());

create or replace function app.validar_borrado_cliente() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from visitas where cliente_id = old.id) then
    raise exception 'El cliente tiene visitas registradas y no se puede eliminar';
  end if;
  return old;
end $$;
create trigger t0_borrado before delete on public.clientes for each row execute function app.validar_borrado_cliente();

-- Al agendar una visita el cliente queda registrado (y se completan sus datos si faltaban)
create or replace function app.asegurar_cliente() returns trigger
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if not app.es_gestor() then return new; end if;
  if tg_op = 'UPDATE' and new.cliente_id is not null and lower(trim(new.cliente)) = lower(trim(old.cliente)) then
    return new;
  end if;
  select id into cid from clientes where empresa_id = new.empresa_id and lower(trim(nombre)) = lower(trim(new.cliente));
  if cid is null then
    insert into clientes (empresa_id, nombre, direccion, telefono)
    values (new.empresa_id, trim(new.cliente), new.direccion, new.telefono) returning id into cid;
  else
    update clientes set direccion = case when direccion = '' then new.direccion else direccion end,
                        telefono = case when telefono = '' then new.telefono else telefono end
    where id = cid;
  end if;
  new.cliente_id := cid;
  return new;
end $$;
create trigger t4_cliente before insert or update on public.visitas for each row execute function app.asegurar_cliente();

-- ---------------------------------------------------------------- visitas

create or replace function app.validar_visita_datos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.responsable is distinct from old.responsable then
    if not exists (select 1 from perfiles where id = new.responsable and empresa_id = new.empresa_id and rol = 'tecnico' and activo) then
      raise exception 'Técnico inválido';
    end if;
  end if;
  if new.estado = 'Cancelada' and length(trim(new.motivo)) = 0 then
    raise exception 'Indica el motivo de la cancelación';
  end if;
  return new;
end $$;
create trigger t3_validar_datos before insert or update on public.visitas for each row execute function app.validar_visita_datos();

-- ---------------------------------------------------------------- informes

create or replace function app.validar_informe() returns trigger
language plpgsql security definer set search_path = public as $$
declare v public.visitas;
begin
  if tg_op = 'INSERT' then
    if new.visita_id is not null then
      select * into v from visitas where id = new.visita_id and empresa_id = new.empresa_id;
      if v.id is null then raise exception 'Visita no encontrada'; end if;
      if app.rol_actual() = 'tecnico' and v.estado not in ('Aceptada', 'En curso', 'Realizada') then
        raise exception 'Acepta la visita antes de crear su informe';
      end if;
    end if;
  else
    new.visita_id := old.visita_id;               -- inmutables
    new.numero := old.numero;
    if old.estado = 'Finalizado' and not app.es_superadmin() then
      raise exception 'Informe finalizado: solo el superadmin puede modificarlo';
    end if;
  end if;
  if new.estado = 'Finalizado' and exists (
    select 1 from jsonb_array_elements(new.checklist) i
    where coalesce(i ->> 'resultado', '') = ''
       or (i ->> 'resultado' = 'falla' and length(trim(coalesce(i ->> 'obs', ''))) = 0)
  ) then
    raise exception 'Completa el checklist (y observaciones de las fallas) para finalizar';
  end if;
  return new;
end $$;
create trigger t3_validar_informe before insert or update on public.informes for each row execute function app.validar_informe();

-- Borrar: el superadmin cualquiera; los demás solo los propios y no finalizados
drop policy informes_borrar on public.informes;
create policy informes_borrar on public.informes for delete
  using (empresa_id = app.empresa_actual() and (app.es_superadmin() or (autor = auth.uid() and estado <> 'Finalizado')));

-- ---------------------------------------------------------------- avisos (notificaciones)

create or replace function app.avisar_visita() returns trigger
language plpgsql security definer set search_path = public as $$
declare actor public.perfiles; rechazo boolean;
begin
  select * into actor from perfiles where id = auth.uid();
  if (tg_op = 'INSERT' or new.responsable is distinct from old.responsable) and new.responsable is distinct from auth.uid() then
    insert into notificaciones (empresa_id, usuario_id, tipo, titulo, mensaje, ref)
    values (new.empresa_id, new.responsable, 'visita_asignada', 'Nueva visita asignada',
            new.cliente || E'\n' || to_char(new.fecha, 'DD-MM-YYYY') || ' ' || to_char(new.hora, 'HH24:MI'), 'visita:' || new.id);
  end if;
  if tg_op = 'UPDATE' and new.estado is distinct from old.estado and actor.rol = 'tecnico' and new.autor is not null and new.autor <> auth.uid() then
    rechazo := new.estado = 'Cancelada' and old.estado = 'Programada';
    insert into notificaciones (empresa_id, usuario_id, tipo, titulo, mensaje, ref)
    values (new.empresa_id, new.autor, 'visita_estado',
            case when rechazo then 'Visita rechazada' else 'Visita ' || lower(new.estado) end,
            actor.nombre || E'\n' || new.cliente || case when new.estado = 'Cancelada' and new.motivo <> '' then E'\nMotivo: ' || new.motivo else '' end,
            'visita:' || new.id);
  end if;
  return new;
end $$;
create trigger avisos after insert or update on public.visitas for each row execute function app.avisar_visita();

create or replace function app.avisar_informe() returns trigger
language plpgsql security definer set search_path = public as $$
declare autor_visita uuid;
begin
  if new.estado = 'Finalizado' and (tg_op = 'INSERT' or old.estado is distinct from 'Finalizado') and new.visita_id is not null then
    select autor into autor_visita from visitas where id = new.visita_id;
    if autor_visita is not null and autor_visita <> auth.uid() then
      insert into notificaciones (empresa_id, usuario_id, tipo, titulo, mensaje, ref)
      values (new.empresa_id, autor_visita, 'informe_finalizado', 'Informe finalizado', new.numero || ' · ' || new.cliente, 'informe:' || new.id);
    end if;
  end if;
  return new;
end $$;
create trigger avisos after insert or update on public.informes for each row execute function app.avisar_informe();

-- ---------------------------------------------------------------- usuarios

-- Nadie se quita a sí mismo el acceso de superadmin
create or replace function app.validar_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.id = auth.uid() and old.rol = 'superadmin' and (new.activo is false or new.rol <> 'superadmin') then
    raise exception 'No puedes quitarte tu propio acceso';
  end if;
  new.empresa_id := old.empresa_id;
  return new;
end $$;
create trigger validar before update on public.perfiles for each row execute function app.validar_perfil();

-- El superadmin da de alta usuarios de su empresa (cuenta de acceso + perfil). Entran con su correo y clave temporal.
create or replace function public.crear_usuario(p_correo text, p_clave text, p_usuario text, p_nombre text, p_rol text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := gen_random_uuid(); emp uuid := app.empresa_actual(); correo text := lower(trim(p_correo));
begin
  if not app.es_superadmin() then raise exception 'Sin permisos'; end if;
  if p_rol not in ('superadmin', 'admin', 'tecnico') then raise exception 'Rol inválido'; end if;
  if exists (select 1 from auth.users where lower(email) = correo) then raise exception 'Ese correo ya está registrado'; end if;
  if exists (select 1 from perfiles where empresa_id = emp and usuario = trim(p_usuario)) then raise exception 'Ese usuario ya existe'; end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', correo,
          crypt(p_clave, gen_salt('bf', 10)), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid::text, uid, jsonb_build_object('sub', uid::text, 'email', correo, 'email_verified', true), 'email', now(), now(), now());
  insert into perfiles (id, empresa_id, usuario, nombre, rol, correo, cambiar_clave)
  values (uid, emp, trim(p_usuario), trim(p_nombre), p_rol, correo, true);
  return uid;
end $$;

-- El superadmin restablece la clave de un usuario de su empresa (queda obligado a cambiarla)
create or replace function public.restablecer_clave(p_id uuid, p_clave text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not app.es_superadmin() then raise exception 'Sin permisos'; end if;
  if not exists (select 1 from perfiles where id = p_id and empresa_id = app.empresa_actual()) then raise exception 'No encontrado'; end if;
  update auth.users set encrypted_password = crypt(p_clave, gen_salt('bf', 10)), updated_at = now() where id = p_id;
  update perfiles set cambiar_clave = true where id = p_id;
end $$;

-- Tras cambiar su clave, el usuario quita la marca de cambio obligatorio
create or replace function public.marcar_clave_cambiada() returns void
language sql security definer set search_path = public as $$
  update perfiles set cambiar_clave = false where id = auth.uid()
$$;

revoke all on function public.crear_usuario(text, text, text, text, text) from public, anon;
revoke all on function public.restablecer_clave(uuid, text) from public, anon;
revoke all on function public.marcar_clave_cambiada() from public, anon;
grant execute on function public.crear_usuario(text, text, text, text, text) to authenticated;
grant execute on function public.restablecer_clave(uuid, text) to authenticated;
grant execute on function public.marcar_clave_cambiada() to authenticated;
