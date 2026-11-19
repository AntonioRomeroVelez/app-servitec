import { crearEntorno, CLAVE_INICIAL } from './harness.js'

const TEMP = 'Temporal-2026'
const DEFINITIVA = 'Clave-Definitiva-77'

/**
 * Entorno con un superadmin, dos admins (lucia, marta) y dos técnicos (carlos, diego), todos con la clave ya
 * cambiada y su token listo.
 */
export function entornoListo() {
  const env = crearEntorno()
  const { token } = env.ok('login', { usuario: 'superadmin', clave: CLAVE_INICIAL })
  const sa = env.ok('cambiar_clave', { actual: CLAVE_INICIAL, nueva: 'Nueva-Super-2026' }, token).token

  const crear = (usuario, rol) => {
    const u = env.ok('usuarios_create', { data: { usuario, nombre: usuario.toUpperCase(), rol, clave: TEMP } }, sa)
    const t = env.ok('login', { usuario, clave: TEMP }).token
    return { token: env.ok('cambiar_clave', { actual: TEMP, nueva: DEFINITIVA }, t).token, id: u.id, usuario }
  }
  return { env, sa, admin: crear('lucia', 'admin'), admin2: crear('marta', 'admin'), tec: crear('carlos', 'tecnico'), tec2: crear('diego', 'tecnico') }
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
