// Actividades (checklist) de los informes. Un informe nuevo empieza con dos casillas vacías; el técnico escribe lo que
// hizo, agrega las que necesite y marca cada una Cumple / No cumple / Falla. Las listas de cada tipo de visita (Ajustes)
// solo sirven de ejemplo en el texto de ayuda de las primeras casillas.
import { CONFIG_DEFECTO } from './configuracion.js'

export const RESULTADOS = [
  { id: 'ok', texto: 'Cumple', activo: 'bg-emerald-600 text-white border-emerald-600' },
  { id: 'no', texto: 'No cumple', activo: 'bg-amber-600 text-white border-amber-600' },
  { id: 'falla', texto: 'Falla', activo: 'bg-red-600 text-white border-red-600' },
]
// Opción anterior: ya no se ofrece, pero se muestra en los informes que la tienen
export const NO_APLICA = { id: 'na', texto: 'N/A', activo: 'bg-brand-600 text-white border-brand-600' }
export const textoResultado = (id) => [...RESULTADOS, NO_APLICA].find((r) => r.id === id)?.texto ?? 'Sin responder'

export const MAX_ACTIVIDADES = 50

export const ACTIVIDADES_INICIALES = 2
export const actividadesIniciales = () => Array.from({ length: ACTIVIDADES_INICIALES }, () => ({ item: '', resultado: '', obs: '' }))

// `tipos` = configuración vigente ([{ nombre, checklist: [...] }]); por defecto, la de fábrica
export function ejemploDeActividad(posicion, tipo, tipos = CONFIG_DEFECTO.tipos) {
  const ejemplo = posicion < ACTIVIDADES_INICIALES && tipos.find((t) => t.nombre === tipo)?.checklist[posicion]
  return ejemplo ? `Describe lo que hiciste. Ej.: ${ejemplo}` : 'Describe lo que hiciste…'
}

// El checklist se guarda como texto JSON en una celda de la hoja
export function leerChecklist(texto) {
  try {
    const c = JSON.parse(texto || '[]')
    return Array.isArray(c) ? c : []
  } catch {
    return []
  }
}

/** Las actividades que se guardan: sin las filas vacías y sin datos internos del formulario. */
export const actividadesUtiles = (c) =>
  c.filter((i) => i.item.trim() || i.resultado).map(({ item, resultado, obs }) => ({ item: item.trim(), resultado, obs: obs || '' }))

/** Cuántas actividades faltan por completar (sin descripción o sin resultado). */
export const sinCompletar = (c) => actividadesUtiles(c).filter((i) => !i.item || !i.resultado).length
