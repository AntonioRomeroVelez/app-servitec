// Checklist de los informes. Los ítems de cada tipo de visita los define el superadmin en Ajustes (tipos de visita);
// al crear un informe se carga la lista del tipo elegido. Cada ítem se responde con: Cumple / Falla (exige observación) / N/A.
import { CONFIG_DEFECTO } from './configuracion.js'

export const RESULTADOS = [
  { id: 'ok', texto: 'Cumple', activo: 'bg-emerald-600 text-white border-emerald-600' },
  { id: 'falla', texto: 'Falla', activo: 'bg-red-600 text-white border-red-600' },
  { id: 'na', texto: 'N/A', activo: 'bg-brand-600 text-white border-brand-600' },
]

// `tipos` = configuración vigente ([{ nombre, checklist: [...] }]); por defecto, la de fábrica
export const nuevoChecklist = (tipo, tipos = CONFIG_DEFECTO.tipos) =>
  (tipos.find((t) => t.nombre === tipo)?.checklist || []).map((item) => ({ item, resultado: '', obs: '' }))

// El checklist se guarda como texto JSON en una celda de la hoja
export function leerChecklist(texto) {
  try {
    const c = JSON.parse(texto || '[]')
    return Array.isArray(c) ? c : []
  } catch {
    return []
  }
}

export const sinResponder = (c) => c.filter((i) => !i.resultado).length
export const fallasSinObs = (c) => c.filter((i) => i.resultado === 'falla' && !i.obs.trim()).length
