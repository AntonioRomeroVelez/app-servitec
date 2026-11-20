// Filtros de la agenda de visitas. Se resuelven en el servidor y la lista llega paginada.
import { hoy, diaAnterior } from './utils'

export const PERIODOS = [
  { id: 'proximas', texto: 'Próximas' },
  { id: 'hoy', texto: 'Hoy' },
  { id: 'pasadas', texto: 'Pasadas' },
  { id: 'todas', texto: 'Todas' },
]

/** Parámetros de visitas_list para un período y un texto de búsqueda opcional. */
export function paramsAgenda(periodo = 'proximas', q = '') {
  const h = hoy()
  const base = { proximas: { desde: h, orden: 'asc' }, hoy: { desde: h, hasta: h, orden: 'asc' }, pasadas: { hasta: diaAnterior(h), orden: 'desc' }, todas: { orden: 'desc' } }[periodo]
  return q ? { ...base, q } : base
}

/** Período que corresponde a unos parámetros ya aplicados (para volver a mostrar el filtro al regresar a la agenda). */
export function periodoDe(p = {}) {
  if (p.desde && p.hasta) return 'hoy'
  if (p.desde) return 'proximas'
  if (p.hasta) return 'pasadas'
  return p.orden ? 'todas' : 'proximas'
}
