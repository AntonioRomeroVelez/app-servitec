// Crea una empresa con su superadmin directamente por SQL en el Supabase local (equivale a crearSuperadmin de Code.gs).
// Con plataforma = true, ese usuario además es superadmin de la plataforma: crea y administra las empresas del SaaS.
// El acceso es <usuario>@servitec.local (se ingresa con el usuario); `correo` es solo el dato de contacto.
// La clave se guarda con bcrypt; al crearlo por SQL no se aplica la política de claves de la app.
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))

export const sql = (consulta, vars = {}) => {
  const args = ['compose', '-f', join(aqui, 'docker-compose.yml'), '--env-file', join(aqui, '.env'), 'exec', '-T', 'db', 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt']
  for (const [k, v] of Object.entries(vars)) args.push('-v', `${k}=${v}`)
  const r = spawnSync('docker', args, { input: consulta, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(r.stderr)
  return r.stdout.trim()
}

export function crearSuperadmin({ usuario, correo, empresa, nombre = usuario, clave, plataforma = false }) {
  try {
    sql(
      `
with e as (insert into public.empresas (nombre) values (:'empresa') returning id),
u as (
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', lower(:'usuario') || '@servitec.local',
          crypt(:'clave', gen_salt('bf', 10)), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
  returning id),
i as (
  insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', lower(:'usuario') || '@servitec.local', 'email_verified', true), 'email', now(), now(), now() from u),
p as (
  insert into public.perfiles (id, empresa_id, usuario, nombre, rol, correo, cambiar_clave)
  select u.id, e.id, :'usuario', :'nombre', 'superadmin', lower(:'correo'), false from u, e),
pl as (insert into public.plataforma_admins (user_id) select u.id from u where :'plataforma'::boolean),
c as (
  insert into public.configuracion (empresa_id, clave, valor)
  select e.id, 'empresa', jsonb_build_object('nombre', :'empresa', 'subtitulo', '', 'ruc', '', 'direccion', '', 'telefono', '', 'correo', '', 'web', '', 'pie', '') from e
  union all select e.id, 'tema', '{"primario": "#1565d8", "acento": "#f6c915"}'::jsonb from e
  union all select e.id, 'informes', '{"prefijo": "INF", "pdfChecklist": true, "pdfFotos": true, "pdfFirma": true, "pdfObservaciones": true}'::jsonb from e)
select 'creado';`,
      { usuario, correo, empresa, nombre, clave, plataforma: String(plataforma) },
    )
  } catch (e) {
    throw new Error(e.message.split(clave).join('***'))
  }
}
