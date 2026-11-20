// Carga datos de ejemplo en el Supabase local para probar listas, filtros y paginación.
// Uso: DEMO_USUARIO=... DEMO_CLAVE=... node --import ./supabase/local/registrar.mjs supabase/local/datos-demo.mjs
// Entra como el superadmin indicado y crea un técnico, visitas e informes en su empresa. Solo para pruebas locales.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crearTransporte } from '../../src/supabase/transporte.js'
import { persona } from './ayudas.mjs'

const env = Object.fromEntries(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '.env'), 'utf8').split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)))
const memoria = () => {
  const m = new Map()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }
}
const usuarioDemo = process.env.DEMO_USUARIO
const clave = process.env.DEMO_CLAVE
if (!usuarioDemo || !clave) {
  console.error('Define DEMO_USUARIO y DEMO_CLAVE')
  process.exit(1)
}
const T = crearTransporte({ url: `http://localhost:${env.PUERTO_API}`, anonKey: env.ANON_KEY, storage: memoria() })
await T.call('login', { usuario: usuarioDemo, clave })

const sufijo = String(Date.now()).slice(-6)
const creado = await T.call('usuarios_create', { data: { ...persona('Técnico Ejemplo Demo', 1), rol: 'tecnico' } })
const tecnico = creado.usuario
const clientes = ['Ferretería Sol', 'Panadería Luna', 'Taller Sur', 'Hotel Centro', 'Farmacia Norte', 'Colegio Andino', 'Banco Unión', 'Mercado Central', 'Clínica Vida', 'Bodega Este']
const tipos = ['Visita técnica', 'Inspección', 'Mantenimiento', 'Incidente']
const dia = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
for (let i = 0; i < 35; i++) {
  const v = await T.call('visitas_create', { data: { fecha: dia(i - 8), hora: `${String(8 + (i % 9)).padStart(2, '0')}:00`, cliente: clientes[i % clientes.length], direccion: `Av. ${i + 1} y Calle ${i + 5}`, telefono: `09900${String(i).padStart(4, '0')}`, tipo: tipos[i % tipos.length], responsable: tecnico } })
  if (i % 3 === 0) await T.call('informes_create', { data: { visitaId: v.id, fecha: v.fecha, cliente: v.cliente, titulo: `${v.tipo} - ${v.cliente}`, tipo: v.tipo, estado: 'Borrador', responsable: tecnico, checklist: '[]' } })
}
console.log('Datos de ejemplo creados: 1 técnico, 35 visitas, 12 informes.')
