// Color de la barra lateral de cada tarjeta según el estado de la visita o del informe (clases completas para Tailwind).
const BORDES = {
  Programada: 'border-l-brand-300',
  Aceptada: 'border-l-brand-500',
  'En curso': 'border-l-acento',
  Realizada: 'border-l-emerald-500',
  Cancelada: 'border-l-red-400',
  Borrador: 'border-l-brand-300',
  'En revisión': 'border-l-acento',
  Finalizado: 'border-l-emerald-500',
}
export const bordeDeEstado = (estado) => BORDES[estado] || 'border-l-brand-300'

// Nombre legible de cada rol y color de su etiqueta
export const ETIQUETA_ROL = { superadmin: 'Superadmin', admin: 'Administrador', tecnico: 'Técnico' }
export const CLASE_ROL = {
  superadmin: 'bg-acento text-acento-texto',
  admin: 'bg-brand-300 text-brand-950',
  tecnico: 'bg-brand-100 text-brand-800',
}
