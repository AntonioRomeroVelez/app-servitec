-- El rol `admin` (encargado) puede crear y administrar TÉCNICOS de su empresa; nunca admins ni superadmins.
-- También puede ser responsable de una visita (como el superadmin), por si la empresa aún no tiene técnicos.
-- El superadmin conserva todo. Las reglas las impone la base: la app solo las refleja.

-- Alta de usuario: el superadmin crea cualquier rol; el admin solo técnicos
create or replace function public.crear_usuario(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid; emp uuid := app.empresa_actual(); usuario_ text;
begin
  if not app.es_gestor() then raise exception 'Sin permisos'; end if;
  if coalesce(p ->> 'rol', '') not in ('superadmin', 'admin', 'tecnico') then raise exception 'Rol inválido'; end if;
  if not app.es_superadmin() and p ->> 'rol' <> 'tecnico' then raise exception 'Solo puedes crear técnicos'; end if;
  perform app.validar_persona(p, emp);
  usuario_ := app.usuario_para_alta(p);
  uid := app.crear_cuenta(app.email_usuario(usuario_), trim(p ->> 'cedula'));
  insert into perfiles (id, empresa_id, usuario, nombre, rol, correo, cedula, telefono, ciudad, direccion, cargo, cambiar_clave)
  values (uid, emp, usuario_, trim(p ->> 'nombre'), p ->> 'rol', lower(trim(p ->> 'correo')), trim(p ->> 'cedula'),
          trim(p ->> 'telefono'), trim(p ->> 'ciudad'), trim(coalesce(p ->> 'direccion', '')), trim(coalesce(p ->> 'cargo', '')), true);
  return jsonb_build_object('id', uid, 'usuario', usuario_);
end $$;

-- Editar perfiles: el superadmin a cualquiera; el admin solo a técnicos y sin poder cambiarles el rol
drop policy if exists perfiles_editar on public.perfiles;
create policy perfiles_editar on public.perfiles for update
  using (empresa_id = app.empresa_actual() and (app.es_superadmin() or (app.rol_actual() = 'admin' and rol = 'tecnico')))
  with check (empresa_id = app.empresa_actual() and (app.es_superadmin() or rol = 'tecnico'));

-- Restablecer clave: el superadmin a cualquiera de su empresa; el admin solo a técnicos
create or replace function public.restablecer_clave(p_id uuid, p_clave text default null)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare clave_ text; ced text; rol_ text;
begin
  if not app.es_gestor() then raise exception 'Sin permisos'; end if;
  select cedula, rol into ced, rol_ from perfiles where id = p_id and empresa_id = app.empresa_actual();
  if not found then raise exception 'No encontrado'; end if;
  if not app.es_superadmin() and rol_ <> 'tecnico' then raise exception 'Sin permisos'; end if;
  clave_ := coalesce(nullif(p_clave, ''), ced);
  if clave_ is null or clave_ = '' then raise exception 'El usuario no tiene cédula: escribe una clave temporal'; end if;
  update auth.users set encrypted_password = crypt(clave_, gen_salt('bf', 10)), updated_at = now() where id = p_id;
  update perfiles set cambiar_clave = true where id = p_id;
  delete from auth.refresh_tokens where user_id = p_id::text;
  delete from auth.sessions where user_id = p_id;
end $$;

-- Responsable de una visita: técnico, o el superadmin / admin de la empresa (atienden visitas cuando no hay técnicos)
create or replace function app.validar_visita_datos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.responsable is distinct from old.responsable then
    if not exists (select 1 from perfiles where id = new.responsable and empresa_id = new.empresa_id and rol in ('tecnico', 'admin', 'superadmin') and activo) then
      raise exception 'Técnico inválido';
    end if;
  end if;
  if new.estado = 'Cancelada' and length(trim(new.motivo)) = 0 then
    raise exception 'Indica el motivo de la cancelación';
  end if;
  return new;
end $$;

revoke all on function public.crear_usuario(jsonb), public.restablecer_clave(uuid, text) from public, anon;
grant execute on function public.crear_usuario(jsonb), public.restablecer_clave(uuid, text) to authenticated;
