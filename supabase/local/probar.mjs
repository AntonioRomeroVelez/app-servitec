// Prueba de humo contra el Supabase local: plataforma, empresas, aislamiento entre ellas (HTTP real).
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
import { crearSuperadmin } from './superadmin.mjs'

// Superadmin de plataforma (por SQL) y sesión por GoTrue; luego crea dos empresas con rpc/crear_empresa
const ingresar = async (correo, clave) => (await llamar('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: correo, password: clave }) })).datos.access_token
crearSuperadmin({ usuario: 'plataforma', correo: `plat${sufijo}@prueba.com`, empresa: `Plataforma ${sufijo}`, clave: 'ClavePlataforma123', plataforma: true })
const tp = await ingresar(`plat${sufijo}@prueba.com`, 'ClavePlataforma123')
const empresa = (nombre, usuario) => llamar('/rest/v1/rpc/crear_empresa', { method: 'POST', token: tp, body: JSON.stringify({ p: { nombre, admin: { usuario, nombre: usuario, correo: `${usuario}${sufijo}@prueba.com`, clave: 'Temporal12345' } } }) })
const ea = await empresa('Empresa A', 'ana')
const eb = await empresa('Empresa B', 'beto')
ok(ea.ok && eb.ok, 'la plataforma crea las empresas con rpc/crear_empresa', JSON.stringify(ea.datos))
const ta = await ingresar(`ana${sufijo}@prueba.com`, 'Temporal12345')
const tb = await ingresar(`beto${sufijo}@prueba.com`, 'Temporal12345')
ok(ta && tb, 'los administradores entran con GoTrue')
ok((await llamar('/rest/v1/rpc/crear_empresa', { method: 'POST', token: ta, body: JSON.stringify({ p: { nombre: 'X' } }) })).estado >= 400, 'un administrador no puede crear empresas')
ok((await llamar('/rest/v1/rpc/registrar_empresa', { method: 'POST', token: ta, body: JSON.stringify({ p_empresa: 'X', p_nombre: 'x', p_usuario: 'xxx' }) })).estado >= 400, 'el registro abierto está cerrado')
const yo = await llamar('/rest/v1/perfiles?select=usuario,rol', { token: ta })
ok(yo.datos?.length === 1 && yo.datos[0].rol === 'superadmin', 'A ve solo su perfil de superadmin')
const tecnico = await llamar('/rest/v1/rpc/crear_usuario', { method: 'POST', token: ta, body: JSON.stringify({ p_correo: `tecnico${sufijo}@prueba.com`, p_clave: 'Temporal12345', p_usuario: 'tecnico', p_nombre: 'Técnico', p_rol: 'tecnico' }) })
const perfilA = tecnico.datos
const v = await llamar('/rest/v1/visitas', { method: 'POST', token: ta, body: JSON.stringify({ fecha: '2026-11-20', hora: '09:00', cliente: 'Cliente 1', tipo: 'Inspección', responsable: perfilA }) })
ok(v.ok && v.datos[0].estado === 'Programada', 'A agenda una visita por PostgREST', JSON.stringify(v.datos))
ok((await llamar('/rest/v1/visitas', { token: ta })).datos.length === 1, 'A lista su visita')
ok((await llamar('/rest/v1/visitas', { token: tb })).datos.length === 0, 'B no ve visitas de A')
ok((await llamar('/rest/v1/visitas')).datos?.length === 0 || (await llamar('/rest/v1/visitas')).estado >= 400, 'sin sesión no se ve nada')
const bit = await llamar('/rest/v1/bitacora?select=accion,usuario', { token: ta })
ok(bit.datos?.some((b) => b.accion === 'visitas_crear' && b.usuario === 'ana'), 'bitácora registra quién agendó')
console.log(fallos ? `${fallos} fallos` : 'Todo correcto')
process.exit(fallos ? 1 : 0)
