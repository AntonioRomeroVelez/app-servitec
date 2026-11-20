-- ServiTec SaaS: la clave temporal de un usuario nuevo es su número de cédula.
-- Ya no se escribe una clave al crear la cuenta: la persona entra con su usuario y su cédula y debe cambiarla en el primer ingreso
-- (cambiar_clave). La política de claves (10+ caracteres con letras y números) se exige a la clave NUEVA, no a la temporal.

drop function if exists public.restablecer_clave(uuid, text);

-- El superadmin restablece la clave de un usuario de su empresa (queda obligado a cambiarla).
-- Sin p_clave se usa la cédula del usuario como clave temporal.
create or replace function public.restablecer_clave(p_id uuid, p_clave text default null)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare clave_ text; ced text;
begin
  if not app.es_superadmin() then raise exception 'Sin permisos'; end if;
  select cedula into ced from perfiles where id = p_id and empresa_id = app.empresa_actual();
  if not found then raise exception 'No encontrado'; end if;
  clave_ := coalesce(nullif(p_clave, ''), ced);
  if clave_ is null or clave_ = '' then raise exception 'El usuario no tiene cédula: escribe una clave temporal'; end if;
  update auth.users set encrypted_password = crypt(clave_, gen_salt('bf', 10)), updated_at = now() where id = p_id;
  update perfiles set cambiar_clave = true where id = p_id;
end $$;

-- Alta de usuario: la clave temporal es la cédula (p.clave, si llega, se ignora)
create or replace function public.crear_usuario(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid; emp uuid := app.empresa_actual(); usuario_ text;
begin
  if not app.es_superadmin() then raise exception 'Sin permisos'; end if;
  if coalesce(p ->> 'rol', '') not in ('superadmin', 'admin', 'tecnico') then raise exception 'Rol inválido'; end if;
  perform app.validar_persona(p, emp);
  usuario_ := app.usuario_para_alta(p);
  uid := app.crear_cuenta(app.email_usuario(usuario_), trim(p ->> 'cedula'));
  insert into perfiles (id, empresa_id, usuario, nombre, rol, correo, cedula, telefono, ciudad, direccion, cargo, cambiar_clave)
  values (uid, emp, usuario_, trim(p ->> 'nombre'), p ->> 'rol', lower(trim(p ->> 'correo')), trim(p ->> 'cedula'),
          trim(p ->> 'telefono'), trim(p ->> 'ciudad'), trim(coalesce(p ->> 'direccion', '')), trim(coalesce(p ->> 'cargo', '')), true);
  return jsonb_build_object('id', uid, 'usuario', usuario_);
end $$;

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
  usuario_ := app.usuario_para_alta(a);
  uid := app.crear_cuenta(app.email_usuario(usuario_), trim(a ->> 'cedula'));
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

revoke all on function public.restablecer_clave(uuid, text), public.crear_usuario(jsonb), public.crear_empresa(jsonb) from public, anon;
grant execute on function public.restablecer_clave(uuid, text), public.crear_usuario(jsonb), public.crear_empresa(jsonb) to authenticated;
