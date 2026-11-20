-- ServiTec SaaS, fase 3: fotos en Google Drive (empresa > usuario > mes).
-- El Apps Script de fotos (apps-script-fotos/Code.gs) usa el token del propio usuario: la base decide quién puede
-- subir, ver o borrar cada foto; el script nunca tiene una clave maestra.

alter table public.empresas add column zona_horaria text not null default 'America/Guayaquil';

-- Mes (AAAA-MM) en la zona horaria de la empresa: una foto de las 20:00 del último día va a su mes, no al siguiente
create or replace function app.mes_actual() returns text
language sql stable security definer set search_path = public as $$
  select to_char(now() at time zone (select zona_horaria from empresas where id = app.empresa_actual()), 'YYYY-MM')
$$;
alter table public.fotos alter column mes set default app.mes_actual();

-- Reglas para subir una foto: la visita debe ser visible para quien sube, el técnico necesita haberla aceptado, máximo 25
create or replace function app.puede_subir_foto(p_visita uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare v public.visitas;
begin
  select * into v from visitas where id = p_visita and empresa_id = app.empresa_actual();
  if v.id is null or not (app.es_gestor() or v.responsable = auth.uid()) then return 'Visita no encontrada'; end if;
  if app.rol_actual() = 'tecnico' and v.estado not in ('Aceptada', 'En curso', 'Realizada') then
    return 'Acepta la visita antes de cargar fotos';
  end if;
  if (select count(*) from fotos where visita_id = p_visita) >= 25 then return 'Máximo 25 fotos por visita'; end if;
  return null;
end $$;

create or replace function app.validar_foto() returns trigger
language plpgsql security definer set search_path = public as $$
declare msg text;
begin
  msg := app.puede_subir_foto(new.visita_id);
  if msg is not null then raise exception '%', msg; end if;
  return new;
end $$;
create trigger t2_validar before insert on public.fotos for each row execute function app.validar_foto();

-- Contexto que necesita el script antes de subir: nombres para las carpetas y los ids de Drive ya conocidos.
create or replace function public.foto_contexto(p_visita_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare msg text; emp public.empresas; per public.perfiles; v public.visitas; v_mes text;
begin
  msg := app.puede_subir_foto(p_visita_id);
  if msg is not null then raise exception '%', msg; end if;
  select * into emp from empresas where id = app.empresa_actual();
  select * into per from perfiles where id = auth.uid();
  select * into v from visitas where id = p_visita_id;
  v_mes := app.mes_actual();
  return jsonb_build_object(
    'empresaId', emp.id, 'empresaNombre', emp.nombre,
    'usuarioId', per.id, 'usuario', per.usuario,
    'mes', v_mes, 'fecha', v.fecha, 'cliente', v.cliente,
    'carpetaEmpresa', emp.drive_carpeta_id,
    'carpetaUsuario', per.drive_carpeta_id,
    'carpetaMes', (select dc.drive_id from drive_carpetas dc where dc.empresa_id = emp.id and dc.usuario_id = per.id and dc.mes = v_mes));
end $$;

-- El script guarda los ids de las carpetas que crea (solo las del propio usuario y su empresa)
create or replace function public.guardar_carpeta_drive(p_nivel text, p_drive_id text, p_mes text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or app.empresa_actual() is null then raise exception 'Sin permisos'; end if;
  if p_nivel = 'empresa' then
    update empresas set drive_carpeta_id = p_drive_id where id = app.empresa_actual();
  elsif p_nivel = 'usuario' then
    update perfiles set drive_carpeta_id = p_drive_id where id = auth.uid();
  elsif p_nivel = 'mes' then
    if p_mes !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Mes inválido'; end if;
    insert into drive_carpetas (empresa_id, usuario_id, mes, drive_id)
    values (app.empresa_actual(), auth.uid(), p_mes, p_drive_id)
    on conflict (empresa_id, usuario_id, mes) do update set drive_id = excluded.drive_id;
  else
    raise exception 'Nivel inválido';
  end if;
end $$;

-- Ids de Drive de las fotos de una visita (para enviarlas a la papelera al eliminarla). Solo quien puede borrar la visita.
create or replace function public.fotos_de_visita(p_visita_id uuid) returns setof text
language sql stable security definer set search_path = public as $$
  select drive_id from fotos
  where visita_id = p_visita_id and empresa_id = app.empresa_actual() and app.es_gestor()
$$;

revoke all on function public.foto_contexto(uuid), public.guardar_carpeta_drive(text, text, text), public.fotos_de_visita(uuid) from public, anon;
grant execute on function public.foto_contexto(uuid), public.guardar_carpeta_drive(text, text, text), public.fotos_de_visita(uuid) to authenticated;

-- Las funciones nuevas del esquema app (p. ej. el valor por defecto de fotos.mes) deben poder ejecutarse
grant execute on all functions in schema app to authenticated;
