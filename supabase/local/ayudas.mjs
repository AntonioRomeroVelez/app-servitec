// Ayudas comunes de las pruebas contra el Supabase local: superadmin de plataforma y empresas creadas por la vía real.
import { crearSuperadmin } from './superadmin.mjs'

/** Crea un superadmin de plataforma (por SQL) y abre su sesión en el transporte P. */
export async function prepararPlataforma(P, sufijo) {
  const correo = `plat${sufijo}@plataforma.test`
  const clave = 'ClavePlataforma123'
  crearSuperadmin({ usuario: 'plataforma', correo, empresa: `Plataforma ${sufijo}`, clave, plataforma: true })
  return P.call('login', { usuario: correo, clave })
}

/** La plataforma crea la empresa con su administrador; este entra con la clave temporal y la cambia por `clave`. */
export async function crearEmpresaConAdmin(P, T, { empresa, usuario, nombre, correo, clave, datos = {} }) {
  const id = await P.call('empresas_create', { data: { nombre: empresa, ...datos, admin: { usuario, nombre, correo, clave: 'Temporal12345' } } })
  await T.call('login', { usuario: correo, clave: 'Temporal12345' })
  const sesion = await T.call('cambiar_clave', { actual: 'Temporal12345', nueva: clave })
  return { id, sesion }
}
