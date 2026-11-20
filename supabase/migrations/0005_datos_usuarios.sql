-- ServiTec SaaS: datos completos de cada usuario y usuario de ingreso generado a partir de los nombres completos.
--  - El usuario con el que se ingresa (ej. carlos.romero) lo genera la base desde los nombres completos y es único en toda la plataforma.
--  - La cuenta de acceso usa el correo interno <usuario>@servitec.local; el correo real del usuario es un dato de contacto (perfiles.correo).
--  - Se piden y validan: nombres completos, cédula ecuatoriana, correo, teléfono, ciudad, rol (y opcionalmente dirección y cargo).

alter table public.perfiles
  add column cedula text,
  add column telefono text not null default '',
  add column ciudad text not null default '',
  add column direccion text not null default '',
  add column cargo text not null default '';

create unique index perfiles_usuario_global on public.perfiles (lower(usuario));
create unique index perfiles_cedula_unica on public.perfiles (empresa_id, cedula) where cedula is not null and cedula <> '';

-- ---------------------------------------------------------------- reglas de datos

-- Cédula ecuatoriana: 10 dígitos, provincia 01-24 o 30, tercer dígito < 6, dígito verificador (módulo 10)
create or replace function app.cedula_valida(c text) returns boolean
language plpgsql immutable as $$
declare suma int := 0; p int; i int; prov int;
begin
  if c is null or c !~ '^\d{10}$' then return false; end if;
  prov := substr(c, 1, 2)::int;
  if not ((prov between 1 and 24) or prov = 30) or substr(c, 3, 1)::int >= 6 then return false; end if;
  for i in 1..9 loop
    p := substr(c, i, 1)::int * case when i % 2 = 1 then 2 else 1 end;
    suma := suma + case when p > 9 then p - 9 else p end;
  end loop;
  return (10 - (suma % 10)) % 10 = substr(c, 10, 1)::int;
end $$;

-- Correo interno con el que la cuenta de acceso inicia sesión a partir del usuario
create or replace function app.email_usuario(p_usuario text) returns text
language sql immutable as $$ select lower(trim(p_usuario)) || '@servitec.local' $$;

-- Usuario de ingreso a partir de los nombres completos: primer nombre + apellido, sin tildes, único en toda la plataforma.
-- (Misma regla que generarUsuario en src/utils.js.)
create or replace function app.generar_usuario(p_nombre text) returns text
language plpgsql stable security definer set search_path = public as $$
declare limpio text; t text; prefijo text := ''; palabras text[] := '{}'; apellido text; base text; candidato text; n int := 1;
begin
  limpio := regexp_replace(translate(lower(coalesce(p_nombre, '')), 'áéíóúüñàèìòùâêîôû', 'aeiouunaeiouaeiou'), '[^a-z ]', ' ', 'g');
  foreach t in array regexp_split_to_array(trim(limpio), '\s+') loop
    continue when t = '';
    if t in ('de', 'del', 'la', 'las', 'los', 'san', 'santa', 'y') then
      prefijo := prefijo || t;
    else
      palabras := palabras || (prefijo || t);
      prefijo := '';
    end if;
  end loop;
  if cardinality(palabras) = 0 then raise exception 'Escribe los nombres completos'; end if;
  apellido := case when cardinality(palabras) >= 4 then palabras[3]
                   when cardinality(palabras) >= 2 then palabras[cardinality(palabras)] end;
  base := left(palabras[1] || coalesce('.' || apellido, ''), 26);
  candidato := base;
  while exists (select 1 from perfiles where lower(usuario) = candidato) loop
    n := n + 1;
    candidato := base || n;
  end loop;
  return candidato;
end $$;

-- Valida los datos de una persona (alta o edición). p = { nombre, cedula, correo, telefono, ciudad }; emp y excluir sirven
-- para comprobar que la cédula no esté repetida en la empresa (excluir = el propio usuario al editar).
create or replace function app.validar_persona(p jsonb, emp uuid, excluir uuid default null) returns void
language plpgsql stable security definer set search_path = public as $$
declare tel text := trim(coalesce(p ->> 'telefono', ''));
begin
  if array_length(regexp_split_to_array(trim(coalesce(p ->> 'nombre', '')), '\s+'), 1) < 2 then
    raise exception 'Escribe los nombres completos (nombres y apellidos)';
  end if;
  if not app.cedula_valida(trim(coalesce(p ->> 'cedula', ''))) then raise exception 'La cédula no es válida'; end if;
  if exists (select 1 from perfiles where empresa_id = emp and cedula = trim(p ->> 'cedula') and (excluir is null or id <> excluir)) then
    raise exception 'Ya existe un usuario con esa cédula';
  end if;
  if coalesce(p ->> 'correo', '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'El correo no es válido'; end if;
  if tel !~ '^[+\d][\d\s()-]*$' or length(regexp_replace(tel, '\D', '', 'g')) not between 7 and 15 then
    raise exception 'El teléfono no es válido (de 7 a 15 dígitos)';
  end if;
  if length(trim(coalesce(p ->> 'ciudad', ''))) = 0 then raise exception 'Escribe la ciudad'; end if;
end $$;

-- Al editar un usuario se vuelven a validar los datos que cambian (los usuarios antiguos sin cédula no se tocan)
create or replace function app.validar_datos_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.nombre is distinct from old.nombre or new.cedula is distinct from old.cedula or new.correo is distinct from old.correo
     or new.telefono is distinct from old.telefono or new.ciudad is distinct from old.ciudad then
    perform app.validar_persona(jsonb_build_object('nombre', new.nombre, 'cedula', new.cedula, 'correo', new.correo,
                                                   'telefono', new.telefono, 'ciudad', new.ciudad), new.empresa_id, new.id);
  end if;
  return new;
end $$;
create trigger t2_datos before update on public.perfiles for each row execute function app.validar_datos_perfil();

-- ---------------------------------------------------------------- alta de usuarios y de empresas

drop function if exists public.crear_usuario(text, text, text, text, text);

-- El superadmin da de alta un usuario de su empresa. p = { nombre, cedula, correo, telefono, ciudad, direccion, cargo, rol, clave }.
-- Devuelve { id, usuario }: el usuario se genera de los nombres completos (entra con él y la clave temporal).
create or replace function public.crear_usuario(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid; emp uuid := app.empresa_actual(); usuario_ text;
begin
  if not app.es_superadmin() then raise exception 'Sin permisos'; end if;
  if coalesce(p ->> 'rol', '') not in ('superadmin', 'admin', 'tecnico') then raise exception 'Rol inválido'; end if;
  perform app.validar_persona(p, emp);
  usuario_ := app.generar_usuario(p ->> 'nombre');
  uid := app.crear_cuenta(app.email_usuario(usuario_), p ->> 'clave');
  insert into perfiles (id, empresa_id, usuario, nombre, rol, correo, cedula, telefono, ciudad, direccion, cargo, cambiar_clave)
  values (uid, emp, usuario_, trim(p ->> 'nombre'), p ->> 'rol', lower(trim(p ->> 'correo')), trim(p ->> 'cedula'),
          trim(p ->> 'telefono'), trim(p ->> 'ciudad'), trim(coalesce(p ->> 'direccion', '')), trim(coalesce(p ->> 'cargo', '')), true);
  return jsonb_build_object('id', uid, 'usuario', usuario_);
end $$;

drop function if exists public.crear_empresa(jsonb);

-- Crear una empresa (solo plataforma). p = {
--   nombre, subtitulo, ruc, direccion, telefono, correo, web, pie, plan,
--   admin: { nombre, cedula, correo, telefono, ciudad, direccion?, cargo?, clave }   -- su superadmin, con clave temporal
-- }
-- Devuelve { empresaId, usuario }: el usuario del administrador se genera de sus nombres completos.
create or replace function public.crear_empresa(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare e uuid; a jsonb := p -> 'admin'; uid uuid; usuario_ text; plan_ text := coalesce(nullif(p ->> 'plan', ''), 'prueba');
begin
  if not app.es_plataforma() then raise exception 'Sin permisos'; end if;
  if length(trim(coalesce(p ->> 'nombre', ''))) = 0 then raise exception 'Escribe el nombre de la empresa'; end if;
  if plan_ not in ('prueba', 'basico', 'pro') then raise exception 'Plan inválido'; end if;
  if a is null then raise exception 'Faltan los datos del administrador de la empresa'; end if;
  insert into empresas (nombre, plan) values (trim(p ->> 'nombre'), plan_) returning id into e;
  perform app.validar_persona(a, e);
  usuario_ := app.generar_usuario(a ->> 'nombre');
  uid := app.crear_cuenta(app.email_usuario(usuario_), a ->> 'clave');
  insert into perfiles (id, empresa_id, usuario, nombre, rol, correo, cedula, telefono, ciudad, direccion, cargo, cambiar_clave)
  values (uid, e, usuario_, trim(a ->> 'nombre'), 'superadmin', lower(trim(a ->> 'correo')), trim(a ->> 'cedula'),
          trim(a ->> 'telefono'), trim(a ->> 'ciudad'), trim(coalesce(a ->> 'direccion', '')), trim(coalesce(a ->> 'cargo', '')), true);
  insert into configuracion (empresa_id, clave, valor) values
    (e, 'empresa', jsonb_build_object('nombre', trim(p ->> 'nombre'), 'subtitulo', coalesce(p ->> 'subtitulo', ''),
       'ruc', coalesce(p ->> 'ruc', ''), 'direccion', coalesce(p ->> 'direccion', ''), 'telefono', coalesce(p ->> 'telefono', ''),
       'correo', coalesce(p ->> 'correo', ''), 'web', coalesce(p ->> 'web', ''), 'pie', coalesce(p ->> 'pie', ''))),
    (e, 'tema', '{"primario": "#1565d8", "acento": "#f6c915"}'),
    (e, 'informes', '{"prefijo": "INF", "pdfChecklist": true, "pdfFotos": true, "pdfFirma": true, "pdfObservaciones": true}');
  return jsonb_build_object('empresaId', e, 'usuario', usuario_);
end $$;

revoke all on function public.crear_usuario(jsonb), public.crear_empresa(jsonb) from public, anon;
grant execute on function public.crear_usuario(jsonb), public.crear_empresa(jsonb) to authenticated;
grant execute on all functions in schema app to authenticated;

-- ---------------------------------------------------------------- cuentas existentes
-- Las cuentas creadas antes de este cambio pasan a iniciar sesión con <usuario>@servitec.local (el correo anterior queda como contacto)
update auth.users u set email = app.email_usuario(p.usuario), updated_at = now()
from public.perfiles p
where p.id = u.id and u.email is distinct from app.email_usuario(p.usuario);

update auth.identities i set identity_data = jsonb_set(i.identity_data, '{email}', to_jsonb(u.email)), updated_at = now()
from auth.users u
where u.id = i.user_id and i.provider = 'email' and i.identity_data ->> 'email' is distinct from u.email;
