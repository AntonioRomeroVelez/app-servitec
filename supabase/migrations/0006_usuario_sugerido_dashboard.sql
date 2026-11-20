-- ServiTec SaaS: usuario sugerido (editable) y datos del Dashboard.
--  - Usuario sugerido = primer nombre + últimos 4 dígitos de la cédula (ej. carlos4065). Si ya está ocupado se agrega la primera letra
--    del apellido (carlos4065r), luego la segunda (carlos4065ro) y así; agotadas las letras, un número. La persona puede cambiarlo al crear.
--  - Dashboard: resúmenes que respetan los permisos de cada rol (el técnico solo cuenta lo suyo).

-- ---------------------------------------------------------------- usuario sugerido

drop function if exists app.generar_usuario(text);

create or replace function app.sugerir_usuario(p_nombre text, p_cedula text) returns text
language plpgsql stable security definer set search_path = public as $$
declare limpio text; t text; prefijo text := ''; palabras text[] := '{}'; digitos text; apellido text; base text; cand text; k int; n int := 1;
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
  digitos := regexp_replace(coalesce(p_cedula, ''), '\D', '', 'g');
  if cardinality(palabras) = 0 then raise exception 'Escribe los nombres completos'; end if;
  if length(digitos) < 4 then raise exception 'Escribe la cédula'; end if;
  apellido := case when cardinality(palabras) >= 4 then palabras[3]
                   when cardinality(palabras) >= 2 then palabras[cardinality(palabras)] end;
  base := left(palabras[1], 20) || right(digitos, 4);
  cand := base;
  if not exists (select 1 from perfiles where lower(usuario) = cand) then return cand; end if;
  for k in 1..coalesce(length(apellido), 0) loop
    cand := left(base || left(apellido, k), 30);
    if not exists (select 1 from perfiles where lower(usuario) = cand) then return cand; end if;
  end loop;
  cand := left(base || coalesce(apellido, ''), 26);
  loop
    n := n + 1;
    if not exists (select 1 from perfiles where lower(usuario) = cand || n) then return cand || n; end if;
  end loop;
end $$;

-- Para la pantalla: sugerir y comprobar si un usuario está libre (solo quien da de alta usuarios)
create or replace function public.sugerir_usuario(p_nombre text, p_cedula text) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if not (app.es_superadmin() or app.es_plataforma()) then raise exception 'Sin permisos'; end if;
  return app.sugerir_usuario(p_nombre, p_cedula);
end $$;

create or replace function public.usuario_disponible(p_usuario text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if not (app.es_superadmin() or app.es_plataforma()) then raise exception 'Sin permisos'; end if;
  return lower(trim(coalesce(p_usuario, ''))) ~ '^[a-z0-9._-]{3,30}$'
     and not exists (select 1 from perfiles where lower(usuario) = lower(trim(p_usuario)));
end $$;

-- El usuario de una cuenta nueva: el indicado (si es válido y está libre) o el sugerido
create or replace function app.usuario_para_alta(p jsonb) returns text
language plpgsql stable security definer set search_path = public as $$
declare u text := lower(trim(coalesce(p ->> 'usuario', '')));
begin
  if u = '' then return app.sugerir_usuario(p ->> 'nombre', p ->> 'cedula'); end if;
  if u !~ '^[a-z0-9._-]{3,30}$' then
    raise exception 'Usuario inválido: de 3 a 30 caracteres (letras minúsculas, números, punto, guion o guion bajo)';
  end if;
  if exists (select 1 from perfiles where lower(usuario) = u) then raise exception 'Ese usuario ya está en uso'; end if;
  return u;
end $$;

create or replace function public.crear_usuario(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid; emp uuid := app.empresa_actual(); usuario_ text;
begin
  if not app.es_superadmin() then raise exception 'Sin permisos'; end if;
  if coalesce(p ->> 'rol', '') not in ('superadmin', 'admin', 'tecnico') then raise exception 'Rol inválido'; end if;
  perform app.validar_persona(p, emp);
  usuario_ := app.usuario_para_alta(p);
  uid := app.crear_cuenta(app.email_usuario(usuario_), p ->> 'clave');
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

revoke all on function public.sugerir_usuario(text, text), public.usuario_disponible(text) from public, anon;
grant execute on function public.sugerir_usuario(text, text), public.usuario_disponible(text) to authenticated;

-- ---------------------------------------------------------------- Dashboard

-- Hoy en la zona horaria de la empresa
create or replace function app.hoy() returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce((select zona_horaria from empresas where id = app.empresa_actual()), 'America/Guayaquil'))::date
$$;

-- Resumen de la empresa. Corre con los permisos de quien lo pide (RLS): el técnico solo cuenta sus visitas e informes.
create or replace function public.resumen_dashboard() returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare hoy date := app.hoy(); mes_ini date := date_trunc('month', app.hoy())::date; r jsonb;
begin
  select jsonb_build_object(
    'hoy', hoy,
    'visitasHoy', (select count(*) from visitas where fecha = hoy and estado <> 'Cancelada'),
    'proximas', (select count(*) from visitas where fecha > hoy and estado in ('Programada', 'Aceptada')),
    'porAceptar', (select count(*) from visitas where estado = 'Programada' and fecha >= hoy),
    'enCurso', (select count(*) from visitas where estado = 'En curso'),
    'realizadasMes', (select count(*) from visitas where estado = 'Realizada' and fecha >= mes_ini),
    'atrasadas', (select count(*) from visitas where fecha < hoy and estado in ('Programada', 'Aceptada', 'En curso')),
    'informesBorrador', (select count(*) from informes where estado = 'Borrador'),
    'informesFinalizadosMes', (select count(*) from informes where estado = 'Finalizado' and fecha >= mes_ini),
    'clientes', (select count(*) from clientes),
    'tecnicos', (select count(*) from perfiles where rol = 'tecnico' and activo),
    -- visitas por día: 7 días atrás y 7 por delante (sin las canceladas)
    'porDia', (select coalesce(jsonb_agg(jsonb_build_object('fecha', d::date, 'total', coalesce(c.n, 0)) order by d), '[]'::jsonb)
               from generate_series(hoy - 6, hoy + 7, interval '1 day') d
               left join (select fecha, count(*) n from visitas where fecha between hoy - 6 and hoy + 7 and estado <> 'Cancelada' group by fecha) c
                 on c.fecha = d::date),
    'proximasLista', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                      from (select id, fecha, hora, cliente, tipo, estado from visitas
                            where fecha >= hoy and estado in ('Programada', 'Aceptada', 'En curso') order by fecha, hora limit 5) x),
    'ultimosInformes', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                        from (select id, numero, titulo, cliente, estado, fecha from informes order by creado desc limit 5) x)
  ) into r;
  return r;
end $$;

-- Resumen de la plataforma (solo el superadmin de la plataforma)
create or replace function public.resumen_plataforma() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.es_plataforma() then raise exception 'Sin permisos'; end if;
  return jsonb_build_object(
    'empresas', (select count(*) from empresas),
    'activas', (select count(*) from empresas where activa),
    'usuarios', (select count(*) from perfiles where activo),
    'nuevasMes', (select count(*) from empresas where creado >= date_trunc('month', now())),
    'porPlan', (select coalesce(jsonb_object_agg(plan, n), '{}'::jsonb) from (select plan, count(*) n from empresas group by plan) x));
end $$;

revoke all on function public.resumen_dashboard(), public.resumen_plataforma() from public, anon;
grant execute on function public.resumen_dashboard(), public.resumen_plataforma() to authenticated;
grant execute on all functions in schema app to authenticated;
