-- El superadmin de la plataforma puede ver y configurar los Ajustes de cualquier empresa (datos, colores, logo,
-- informes y tipos de visita), igual que el superadmin de esa empresa. Las políticas RLS de `configuracion` no cambian:
-- estas funciones corren con permisos de la base y solo las acepta quien está en `plataforma_admins`.

create or replace function public.config_de_empresa(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.es_plataforma() then raise exception 'Sin permisos'; end if;
  if not exists (select 1 from empresas where id = p_id) then raise exception 'No encontrado'; end if;
  return coalesce((select jsonb_object_agg(clave, valor) from configuracion where empresa_id = p_id), '{}'::jsonb);
end $$;

create or replace function public.guardar_config_empresa(p_id uuid, p_seccion text, p_valor jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.es_plataforma() then raise exception 'Sin permisos'; end if;
  if not exists (select 1 from empresas where id = p_id) then raise exception 'No encontrado'; end if;
  if p_seccion not in ('empresa', 'tema', 'logo', 'informes', 'tipos') then raise exception 'Sección inválida'; end if;
  insert into configuracion (empresa_id, clave, valor) values (p_id, p_seccion, p_valor)
  on conflict (empresa_id, clave) do update set valor = excluded.valor, actualizado = now();
end $$;

-- Vuelve a los valores de fábrica de una sección (se borra la fila y la app usa los valores por defecto)
create or replace function public.restablecer_config_empresa(p_id uuid, p_seccion text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.es_plataforma() then raise exception 'Sin permisos'; end if;
  if p_seccion not in ('empresa', 'tema', 'logo', 'informes', 'tipos') then raise exception 'Sección inválida'; end if;
  delete from configuracion where empresa_id = p_id and clave = p_seccion;
end $$;

revoke all on function public.config_de_empresa(uuid), public.guardar_config_empresa(uuid, text, jsonb), public.restablecer_config_empresa(uuid, text) from public, anon;
grant execute on function public.config_de_empresa(uuid), public.guardar_config_empresa(uuid, text, jsonb), public.restablecer_config_empresa(uuid, text) to authenticated;
