// Prueba de humo contra el Supabase local: registro, empresa, aislamiento entre empresas (HTTP real).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const env = Object.fromEntries(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '.env'), 'utf8').split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)))
const base = `http://localhost:${env.PUERTO_API}`
const llamar = async (ruta, { token, ...op } = {}) => {
  const r = await fetch(base + ruta, { ...op, headers: { apikey: env.ANON_KEY, 'content-type': 'application/json', authorization: `Bearer ${token || env.ANON_KEY}`, prefer: 'return=representation', ...op.headers } })
  const t = await r.text()
  return { ok: r.ok, estado: r.status, datos: t ? JSON.parse(t) : null }
}
let fallos = 0
const ok = (c, m, extra) => (c ? console.log('OK:', m) : (fallos++, console.log('FALLO:', m, extra ?? '')))
const sufijo = Date.now()
const registrar = async (n) => {
  const r = await llamar('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email: `${n}${sufijo}@prueba.com`, password: 'Clave12345x' }) })
  return r.datos.access_token
}

const ta = await registrar('a'), tb = await registrar('b')
ok(ta && tb, 'GoTrue registra usuarios y entrega token')
const ea = await llamar('/rest/v1/rpc/registrar_empresa', { method: 'POST', token: ta, body: JSON.stringify({ p_empresa: 'Empresa A', p_nombre: 'Ana', p_usuario: 'ana' }) })
const eb = await llamar('/rest/v1/rpc/registrar_empresa', { method: 'POST', token: tb, body: JSON.stringify({ p_empresa: 'Empresa B', p_nombre: 'Beto', p_usuario: 'beto' }) })
ok(ea.ok && eb.ok, 'rpc/registrar_empresa crea las empresas', JSON.stringify(ea.datos))
const yo = await llamar('/rest/v1/perfiles?select=usuario,rol', { token: ta })
ok(yo.datos?.length === 1 && yo.datos[0].rol === 'superadmin', 'A ve solo su perfil de superadmin')
const perfilA = (await llamar('/rest/v1/perfiles?select=id', { token: ta })).datos[0].id
const v = await llamar('/rest/v1/visitas', { method: 'POST', token: ta, body: JSON.stringify({ fecha: '2026-11-20', hora: '09:00', cliente: 'Cliente 1', tipo: 'Inspección', responsable: perfilA }) })
ok(v.ok && v.datos[0].estado === 'Programada', 'A agenda una visita por PostgREST', JSON.stringify(v.datos))
ok((await llamar('/rest/v1/visitas', { token: ta })).datos.length === 1, 'A lista su visita')
ok((await llamar('/rest/v1/visitas', { token: tb })).datos.length === 0, 'B no ve visitas de A')
ok((await llamar('/rest/v1/visitas')).datos?.length === 0 || (await llamar('/rest/v1/visitas')).estado >= 400, 'sin sesión no se ve nada')
const bit = await llamar('/rest/v1/bitacora?select=accion,usuario', { token: ta })
ok(bit.datos?.some((b) => b.accion === 'visitas_crear' && b.usuario === 'ana'), 'bitácora registra quién agendó')
console.log(fallos ? `${fallos} fallos` : 'Todo correcto')
process.exit(fallos ? 1 : 0)
