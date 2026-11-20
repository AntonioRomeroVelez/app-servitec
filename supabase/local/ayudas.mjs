// Ayudas comunes de las pruebas contra el Supabase local: superadmin de plataforma, personas con datos válidos y empresas
// creadas por la vía real. El usuario de ingreso lo genera la base de los nombres completos: siempre se usa el devuelto.
import { crearSuperadmin } from './superadmin.mjs'

/** Cédula ecuatoriana válida y distinta para cada n (provincia 17, tercer dígito 1, dígito verificador calculado). */
export function cedulaDe(n) {
  const base = `171${String(1000000 + n).slice(1)}` // 9 dígitos
  const suma = [2, 1, 2, 1, 2, 1, 2, 1, 2].reduce((s, k, i) => {
    const p = Number(base[i]) * k
    return s + (p > 9 ? p - 9 : p)
  }, 0)
  return base + ((10 - (suma % 10)) % 10)
}

/** Datos completos de una persona. `n` cambia la cédula (deben ser distintas dentro de una empresa). */
export const persona = (nombre, n = 0, extra = {}) => ({
  nombre,
  cedula: cedulaDe(n),
  correo: `${nombre.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}@prueba.test`,
  telefono: '0991234567',
  ciudad: 'Quito',
  ...extra,
})

/** Crea un superadmin de plataforma (por SQL) y abre su sesión en el transporte P. Devuelve su usuario. */
export async function prepararPlataforma(P, sufijo) {
  const usuario = `plat${sufijo}`
  const clave = 'ClavePlataforma123'
  crearSuperadmin({ usuario, correo: `${usuario}@plataforma.test`, empresa: `Plataforma ${sufijo}`, clave, plataforma: true })
  await P.call('login', { usuario, clave })
  return usuario
}

/** La plataforma crea la empresa con su administrador; este entra con su cédula (clave temporal) y la cambia por `clave`. */
export async function crearEmpresaConAdmin(P, T, { empresa, nombre, clave, datos = {}, n = 0 }) {
  const admin = persona(nombre, n)
  const r = await P.call('empresas_create', { data: { nombre: empresa, ...datos, admin } })
  await T.call('login', { usuario: r.usuario, clave: admin.cedula })
  const sesion = await T.call('cambiar_clave', { actual: admin.cedula, nueva: clave })
  return { id: r.empresaId, usuario: r.usuario, sesion }
}

/** El superadmin A crea un usuario de su empresa (su clave temporal es la cédula). Devuelve el usuario creado (trae `usuario`). */
export const crearUsuario = (A, nombre, rol, n = 1) => A.call('usuarios_create', { data: { ...persona(nombre, n), rol } })
