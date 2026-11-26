import { crearEntorno, CLAVE_INICIAL } from './harness.js'

/** Cédula ecuatoriana válida y distinta para cada n (con 0 inicial, para comprobar que se conserva como texto). */
export function cedulaDe(n) {
  const base = '01' + '0' + String(n).padStart(6, '0')
  const suma = [...base].reduce((s, d, i) => {
    const p = Number(d) * (i % 2 ? 1 : 2)
    return s + (p > 9 ? p - 9 : p)
  }, 0)
  return base + ((10 - (suma % 10)) % 10)
}

/** Datos completos de un usuario nuevo, como los envía la app. Su clave temporal es la cédula. */
export const datosUsuario = (usuario, rol, n, extra = {}) => ({
  usuario,
  rol,
  nombre: `${usuario.toUpperCase()} PRUEBA`,
  cedula: cedulaDe(n),
  correo: '',
  telefono: '09' + String(n).padStart(8, '0'),
  ciudad: 'Quito',
  direccion: '',
  cargo: '',
  ...extra,
  ...(extra.correo === undefined ? { correo: `${usuario.replace(/[^a-z]/gi, '') || 'persona'}@ejemplo.ec` } : {}),
})

const DEFINITIVA = 'Clave-Definitiva-77'
export const CEDULA_ROOT = cedulaDe(999999)

/** Datos que pide la app para crear una empresa. */
export const datosEmpresa = (nombre, n, extra = {}) => ({ nombre, ciudad: 'Quito', cedula: cedulaDe(n), correo: `dueno${n}@ejemplo.ec`, telefono: '09' + String(n).padStart(8, '0'), ...extra })

/**
 * Entra como root y crea una empresa; su superadministrador (`sup`) crea al administrador propietario (`sa`, usuario
 * "dueno"). Ambos quedan con la clave ya cambiada.
 * Devuelve los tokens de ambos y los datos de la empresa.
 */
export function conEmpresa(env, nombre = 'ServiTec') {
  env.propiedades.set('SUPERADMIN_CEDULA', CEDULA_ROOT)
  const t = env.ok('login', { usuario: 'superadmin', clave: CLAVE_INICIAL }).token
  const root = env.ok('cambiar_clave', { actual: CLAVE_INICIAL, nueva: 'Nueva-Root-2026' }, t).token
  const r = env.ok('empresas_create', { data: datosEmpresa(nombre, 500) }, root)
  const s = env.ok('login', { usuario: r.usuario, clave: r.clave }).token
  const sup = env.ok('cambiar_clave', { actual: r.clave, nueva: 'Nueva-Soporte-2026' }, s).token
  const dueno = datosUsuario('dueno', 'admin', 501)
  env.ok('usuarios_create', { data: dueno }, sup)
  const d = env.ok('login', { usuario: 'dueno', clave: dueno.cedula }).token
  const sa = env.ok('cambiar_clave', { actual: dueno.cedula, nueva: 'Nueva-Super-2026' }, d).token
  return { env, root, sup, sa, empresaId: r.empresaId, usuario: 'dueno' }
}

/**
 * Entorno con un superadmin, dos admins (lucia, marta) y dos técnicos (carlos, diego), todos con la clave ya
 * cambiada y su token listo.
 */
export function entornoListo() {
  const { env, root, sup, sa, empresaId } = conEmpresa(crearEntorno())
  Object.assign(env, { root, sup, empresaId }) // para las pruebas que cambian los Ajustes

  const crear = (usuario, rol, n) => {
    // sin correo: así las pruebas de notificaciones deciden quién lo tiene
    const datos = datosUsuario(usuario, rol, n)
    const u = env.ok('usuarios_create', { data: datos }, sa)
    env.ok('usuarios_update', { id: u.id, data: { correo: '' } }, sa)
    const t = env.ok('login', { usuario, clave: datos.cedula }).token
    return { token: env.ok('cambiar_clave', { actual: datos.cedula, nueva: DEFINITIVA }, t).token, id: u.id, usuario }
  }
  return { env, root, sup, sa, empresaId, admin: crear('lucia', 'admin', 1), admin2: crear('marta', 'admin', 2), tec: crear('carlos', 'tecnico', 3), tec2: crear('diego', 'tecnico', 4) }
}

export const datosVisita = (extra = {}) => ({
  fecha: '2026-11-20',
  hora: '09:00',
  cliente: 'Cliente A',
  direccion: 'Av. Principal 123',
  telefono: '',
  tipo: 'Visita técnica',
  responsable: 'carlos',
  estado: 'Programada',
  notas: '',
  motivo: '',
  ...extra,
})

export const datosInforme = (extra = {}) => ({
  fecha: '2026-11-20',
  cliente: 'Cliente A',
  titulo: 'Informe de prueba',
  tipo: 'Visita técnica',
  estado: 'Borrador',
  responsable: 'carlos',
  descripcion: 'Observaciones de prueba',
  checklist: '',
  firma: '',
  firmante: '',
  visitaId: '',
  ...extra,
})

export const checklistCompleto = JSON.stringify([
  { item: 'Cámaras', resultado: 'ok', obs: '' },
  { item: 'Grabador', resultado: 'falla', obs: 'Disco lleno' },
])
export const checklistIncompleto = JSON.stringify([
  { item: 'Cámaras', resultado: 'ok', obs: '' },
  { item: 'Grabador', resultado: '', obs: '' },
])

// JPEG mínimo "válido" para el backend (solo se verifica la firma /9j/ y el tamaño)
export const JPEG_B64 = '/9j/' + 'AAAA'.repeat(50)
export const MINI = 'data:image/jpeg;base64,' + 'AAAA'.repeat(20)
