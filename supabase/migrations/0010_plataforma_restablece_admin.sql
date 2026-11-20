-- ServiTec SaaS: el superadmin de la plataforma restablece la clave del administrador (superadmin) de cualquier empresa.
-- Sirve cuando el único superadmin de una empresa olvida su clave y nadie de su empresa puede restablecérsela.
-- Alcance acotado: solo cuentas con rol superadmin de las empresas, nunca la propia (esa se cambia desde "Mi cuenta").
-- Igual que el restablecer normal: la clave temporal es la cédula, se cierran sus sesiones y queda obligado a cambiarla.

-- Administradores (superadmin) de una empresa
create or replace function public.listar_admins_empresa(p_empresa uuid)
returns table (id uuid, usuario text, nombre text, correo text, cedula text, activo boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.es_plataforma() then raise exception 'Sin permisos'; end if;
  return query
    select p.id, p.usuario, p.nombre, p.correo, p.cedula, p.activo
    from perfiles p where p.empresa_id = p_empresa and p.rol = 'superadmin' order by p.creado;
end $$;

create or replace function public.restablecer_clave_admin(p_id uuid, p_clave text default null)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare clave_ text; ced text;
begin
  if not app.es_plataforma() then raise exception 'Sin permisos'; end if;
  if p_id = auth.uid() then raise exception 'Tu propia clave se cambia desde Mi cuenta'; end if;
  select cedula into ced from perfiles where id = p_id and rol = 'superadmin';
  if not found then raise exception 'No encontrado'; end if;
  clave_ := coalesce(nullif(p_clave, ''), ced);
  if clave_ is null or clave_ = '' then raise exception 'El usuario no tiene cédula: escribe una clave temporal'; end if;
  update auth.users set encrypted_password = crypt(clave_, gen_salt('bf', 10)), updated_at = now() where id = p_id;
  update perfiles set cambiar_clave = true where id = p_id;
  delete from auth.refresh_tokens where user_id = p_id::text;
  delete from auth.sessions where user_id = p_id;
end $$;

revoke all on function public.listar_admins_empresa(uuid), public.restablecer_clave_admin(uuid, text) from public, anon;
grant execute on function public.listar_admins_empresa(uuid), public.restablecer_clave_admin(uuid, text) to authenticated;
