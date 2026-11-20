import { crearRecurso } from './useRecurso'

export const ESTADOS_VISITA = ['Programada', 'Aceptada', 'En curso', 'Realizada', 'Cancelada']

// Cambios de estado que puede hacer el técnico (admin/superadmin pueden poner cualquiera). Debe coincidir con Code.gs.
export const TRANSICIONES_TECNICO = {
  Programada: ['Aceptada', 'Cancelada'],
  Aceptada: ['En curso', 'Cancelada'],
  'En curso': ['Realizada', 'Cancelada'],
}
// Estados desde los que el técnico puede crear el informe de la visita
export const ESTADOS_CON_INFORME = ['Aceptada', 'En curso', 'Realizada']

// Cronológico: la más próxima primero
// Cronológico dentro de la página (el orden de las páginas lo define el filtro de la agenda)
export const useVisitas = crearRecurso('visitas', (a, b) => `${a.fecha} ${a.hora}`.localeCompare(`${b.fecha} ${b.hora}`), { limite: 15 })
