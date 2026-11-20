// Crea una empresa en el Supabase local entrando como el superadmin de la plataforma (la misma vía que el menú Empresas).
// Uso:  PLATAFORMA_USUARIO=... PLATAFORMA_CLAVE=... node --import ./supabase/local/registrar.mjs supabase/local/crear-empresa.mjs <archivo.json>
// El JSON lleva { nombre, subtitulo, ruc, direccion, telefono, correo, web, pie, plan, admin: { nombre, cedula, correo, telefono, ciudad } }.
// El usuario del administrador se genera de sus nombres completos y se imprime al terminar.
// La clave de la plataforma se lee de una variable de entorno (nunca del JSON ni del código). La clave temporal del administrador
// es su cédula: entra con su usuario y su cédula y debe cambiarla al entrar.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crearTransporte } from '../../src/supabase/transporte.js'

const env = Object.fromEntries(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '.env'), 'utf8').split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)))
const { PLATAFORMA_USUARIO, PLATAFORMA_CLAVE } = process.env
const archivo = process.argv[2]
if (!PLATAFORMA_USUARIO || !PLATAFORMA_CLAVE || !archivo) {
  console.error('Uso: PLATAFORMA_USUARIO=... PLATAFORMA_CLAVE=... node --import ./supabase/local/registrar.mjs supabase/local/crear-empresa.mjs <archivo.json>')
  process.exit(1)
}
const memoria = () => {
  const m = new Map()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }
}
const datos = JSON.parse(readFileSync(archivo, 'utf8'))
const P = crearTransporte({ url: `http://localhost:${env.PUERTO_API}`, anonKey: env.ANON_KEY, storage: memoria() })
await P.call('login', { usuario: PLATAFORMA_USUARIO, clave: PLATAFORMA_CLAVE })
const r = await P.call('empresas_create', { data: datos })
console.log(`Empresa "${datos.nombre}" creada (${r.empresaId}). Administrador: ${datos.admin.nombre}, usuario ${r.usuario}, clave temporal: su cédula; debe cambiarla al entrar.`)
