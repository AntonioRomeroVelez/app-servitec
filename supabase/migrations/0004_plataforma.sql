-- ServiTec SaaS: rol de plataforma. Solo el superadmin de la plataforma crea empresas y llena sus datos;
-- ya no hay registro abierto. Dentro de cada empresa, su superadmin sigue personalizando marca e informes (Ajustes).

create table public.plataforma_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.plataforma_admins enable row level security;
create policy plataforma_ver on public.plataforma_admins for select using (user_id = auth.uid());
grant select on public.plataforma_admins to authenticated;

create or replace function app.es_plataforma() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from plataforma_admins where user_id = auth.uid())
$$;

-- Una empresa desactivada deja sin acceso a todos sus usuarios
create or replace function app.empresa_actual() returns uuid
language sql stable security definer set search_path = public as $$
  select p.empresa_id from public.perfiles p join public.empresas e on e.id = p.empresa_id
  where p.id = auth.uid() and p.activo and e.activa
$$;
create or replace function app.rol_actual() returns text
language sql stable security definer set search_path = public as $$
  select p.rol from public.perfiles p join public.empresas e on e.id = p.empresa_id
  where p.id = auth.uid() and p.activo and e.activa
$$;

-- Se cierra el registro abierto: las empresas las crea la plataforma
revoke execute on function public.registrar_empresa(text, text, text) from authenticated;

-- Cuenta de acceso (auth.users + identidad) con clave bcrypt. Interna: la usan crear_usuario y crear_empresa.
create or replace function app.crear_cuenta(p_correo text, p_clave text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := gen_random_uuid(); correo text := lower(trim(p_correo));
begin
  if correo = '' or correo is null then raise exception 'Escribe el correo'; end if;
  if exists (select 1 from auth.users where lower(email) = correo) then raise exception 'Ese correo ya está registrado'; end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', correo,
          crypt(p_clave, gen_salt('bf', 10)), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid::text, uid, jsonb_build_object('sub', uid::text, 'email', correo, 'email_verified', true), 'email', now(), now(), now());
  return uid;
end $$;

create or replace function public.crear_usuario(p_correo text, p_clave text, p_usuario text, p_nombre text, p_rol text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid; emp uuid := app.empresa_actual();
begin
  if not app.es_superadmin() then raise exception 'Sin permisos'; end if;
  if p_rol not in ('superadmin', 'admin', 'tecnico') then raise exception 'Rol inválido'; end if;
  if exists (select 1 from perfiles where empresa_id = emp and usuario = trim(p_usuario)) then raise exception 'Ese usuario ya existe'; end if;
  uid := app.crear_cuenta(p_correo, p_clave);
  insert into perfiles (id, empresa_id, usuario, nombre, rol, correo, cambiar_clave)
  values (uid, emp, trim(p_usuario), trim(p_nombre), p_rol, lower(trim(p_correo)), true);
  return uid;
end $$;

-- Crear una empresa (solo plataforma). p = {
--   nombre, subtitulo, ruc, direccion, telefono, correo, web, pie, plan,
--   admin: { usuario, nombre, correo, clave }   -- su superadmin, con clave temporal (debe cambiarla al entrar)
-- }
create or replace function public.crear_empresa(p jsonb) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare e uuid; a jsonb := p -> 'admin'; uid uuid; plan_ text := coalesce(nullif(p ->> 'plan', ''), 'prueba');
begin
  if not app.es_plataforma() then raise exception 'Sin permisos'; end if;
  if length(trim(coalesce(p ->> 'nombre', ''))) = 0 then raise exception 'Escribe el nombre de la empresa'; end if;
  if plan_ not in ('prueba', 'basico', 'pro') then raise exception 'Plan inválido'; end if;
  if a is null or length(trim(coalesce(a ->> 'usuario', ''))) = 0 or length(trim(coalesce(a ->> 'nombre', ''))) = 0 then
    raise exception 'Faltan los datos del administrador de la empresa';
  end if;
  uid := app.crear_cuenta(a ->> 'correo', a ->> 'clave');
  insert into empresas (nombre, plan) values (trim(p ->> 'nombre'), plan_) returning id into e;
  insert into perfiles (id, empresa_id, usuario, nombre, rol, correo, cambiar_clave)
  values (uid, e, trim(a ->> 'usuario'), trim(a ->> 'nombre'), 'superadmin', lower(trim(a ->> 'correo')), true);
  insert into configuracion (empresa_id, clave, valor) values
    (e, 'empresa', jsonb_build_object('nombre', trim(p ->> 'nombre'), 'subtitulo', coalesce(p ->> 'subtitulo', ''),
       'ruc', coalesce(p ->> 'ruc', ''), 'direccion', coalesce(p ->> 'direccion', ''), 'telefono', coalesce(p ->> 'telefono', ''),
       'correo', coalesce(p ->> 'correo', ''), 'web', coalesce(p ->> 'web', ''), 'pie', coalesce(p ->> 'pie', ''))),
    (e, 'tema', '{"primario": "#1565d8", "acento": "#f6c915"}'),
    (e, 'informes', '{"prefijo": "INF", "pdfChecklist": true, "pdfFotos": true, "pdfFirma": true, "pdfObservaciones": true}');
  return e;
end $$;

-- Listado de empresas con sus datos y número de usuarios (solo plataforma)
create or replace function public.listar_empresas()
returns table (id uuid, nombre text, plan text, activa boolean, creado timestamptz, usuarios bigint, datos jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.es_plataforma() then raise exception 'Sin permisos'; end if;
  return query
    select e.id, e.nombre, e.plan, e.activa, e.creado,
           (select count(*) from perfiles p where p.empresa_id = e.id),
           coalesce((select c.valor from configuracion c where c.empresa_id = e.id and c.clave = 'empresa'), '{}'::jsonb)
    from empresas e order by e.creado desc;
end $$;

-- Editar nombre, plan, estado y datos de una empresa (solo plataforma). p = { nombre?, plan?, activa?, datos? }
create or replace function public.editar_empresa(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare actual jsonb;
begin
  if not app.es_plataforma() then raise exception 'Sin permisos'; end if;
  if not exists (select 1 from empresas where id = p_id) then raise exception 'No encontrado'; end if;
  if p ? 'activa' and (p ->> 'activa')::boolean = false and p_id = (select empresa_id from perfiles where id = auth.uid()) then
    raise exception 'No puedes desactivar tu propia empresa';
  end if;
  if p ? 'plan' and (p ->> 'plan') not in ('prueba', 'basico', 'pro') then raise exception 'Plan inválido'; end if;
  if p ? 'nombre' and length(trim(p ->> 'nombre')) = 0 then raise exception 'Escribe el nombre de la empresa'; end if;
  update empresas set nombre = coalesce(trim(p ->> 'nombre'), nombre),
                      plan = coalesce(p ->> 'plan', plan),
                      activa = coalesce((p ->> 'activa')::boolean, activa)
  where id = p_id;
  if p ? 'datos' or p ? 'nombre' then
    select valor into actual from configuracion where empresa_id = p_id and clave = 'empresa';
    insert into configuracion (empresa_id, clave, valor)
    values (p_id, 'empresa', coalesce(actual, '{}'::jsonb) || coalesce(p -> 'datos', '{}'::jsonb)
                              || case when p ? 'nombre' then jsonb_build_object('nombre', trim(p ->> 'nombre')) else '{}'::jsonb end)
    on conflict (empresa_id, clave) do update set valor = excluded.valor, actualizado = now();
  end if;
end $$;

revoke all on function public.crear_empresa(jsonb), public.listar_empresas(), public.editar_empresa(uuid, jsonb) from public, anon;
grant execute on function public.crear_empresa(jsonb), public.listar_empresas(), public.editar_empresa(uuid, jsonb) to authenticated;
grant execute on all functions in schema app to authenticated;
