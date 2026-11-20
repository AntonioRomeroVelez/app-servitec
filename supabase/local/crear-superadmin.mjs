// Crea una empresa con su superadmin en el Supabase local.
// Uso:  SUPERADMIN_CLAVE=... node supabase/local/crear-superadmin.mjs <usuario> <correo> "<empresa>" ["<nombre>"] [--plataforma]
// La clave se lee de la variable de entorno (nunca del código ni de los argumentos). Con --plataforma, el usuario
// es también superadmin de la plataforma (crea y administra las empresas del SaaS).
import { crearSuperadmin } from './superadmin.mjs'

const args = process.argv.slice(2)
const plataforma = args.includes('--plataforma')
const [usuario, correo, empresa, nombre] = args.filter((a) => a !== '--plataforma')
const clave = process.env.SUPERADMIN_CLAVE
if (!usuario || !correo || !empresa || !clave) {
  console.error('Uso: SUPERADMIN_CLAVE=... node supabase/local/crear-superadmin.mjs <usuario> <correo> "<empresa>" ["<nombre>"] [--plataforma]')
  process.exit(1)
}
try {
  crearSuperadmin({ usuario, correo, empresa, nombre, clave, plataforma })
  console.log(`Superadmin "${usuario}"${plataforma ? ' (plataforma)' : ''} creado en la empresa "${empresa}". Inicia sesión con el correo ${correo.toLowerCase()}.`)
} catch (e) {
  console.error(e.message)
  process.exit(1)
}
