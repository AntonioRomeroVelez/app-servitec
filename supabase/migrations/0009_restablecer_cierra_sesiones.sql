-- ServiTec SaaS: al restablecer la clave de un usuario se cierran sus sesiones abiertas (como indica la pantalla).
-- Además de marcar que debe cambiar la clave, se borran sus sesiones y sus tokens de renovación: no puede seguir
-- usando la sesión anterior (el token de acceso vigente deja de renovarse y la app ya lo obliga a cambiar la clave).
-- Solo el superadmin de la empresa del usuario puede hacerlo.

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
  delete from auth.refresh_tokens where user_id = p_id::text;
  delete from auth.sessions where user_id = p_id;
end $$;

revoke all on function public.restablecer_clave(uuid, text) from public, anon;
grant execute on function public.restablecer_clave(uuid, text) to authenticated;
