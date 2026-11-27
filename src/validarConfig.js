// Validación de cada sección de la configuración (empresa, tema, logo, informes, tipos).
// La usan el modo demo y el transporte de Supabase, para que ambos apliquen las mismas reglas.
import { CONFIG_DEFECTO } from './configuracion.js'
import { contraste } from './tema.js'
import { normalizar } from './utils.js'
import { IDS_VARIABLES } from './whatsapp.js'

const IMAGENES = ['logo', 'logoClaro', 'fondoImagen']
export const SECCIONES = ['empresa', 'tema', ...IMAGENES, 'informes', 'tipos', 'whatsapp']

/** Devuelve el valor ya limpio de una sección o lanza Error con un mensaje en español. */
export function valorSeccion(seccion, d = {}) {
  if (!SECCIONES.includes(seccion)) throw new Error('Sección inválida')
  if (seccion === 'empresa') {
    if (!String(d.nombre || '').trim()) throw new Error('Escribe el nombre de la empresa')
    return { ...CONFIG_DEFECTO.empresa, ...d, nombre: String(d.nombre).trim() }
  }
  if (seccion === 'tema') {
    const t = { primario: String(d.primario || '').trim().toLowerCase(), acento: String(d.acento || '').trim().toLowerCase() }
    if (!/^#[0-9a-f]{6}$/.test(t.primario) || !/^#[0-9a-f]{6}$/.test(t.acento)) throw new Error('Los colores deben tener el formato #RRGGBB')
    if (contraste(t.primario, '#ffffff') < 4.5) throw new Error('El color principal es demasiado claro: el texto blanco no se leería. Elige uno más oscuro.')
    const encabezado = String(d.encabezado || '').trim().toLowerCase()
    if (encabezado && !/^#[0-9a-f]{6}$/.test(encabezado)) throw new Error('Los colores deben tener el formato #RRGGBB')
    if (encabezado && contraste(encabezado, '#ffffff') < 4.5) throw new Error('El color del encabezado es demasiado claro: el texto blanco no se leería. Elige uno más oscuro.')
    const fondo = d.fondo || 'degradado'
    if (!['degradado', 'solido', 'foto'].includes(fondo)) throw new Error('Fondo de ingreso inválido')
    return { ...t, encabezado, fondo }
  }
  if (IMAGENES.includes(seccion)) {
    const imagen = d[seccion] || ''
    if (imagen && !/^data:image\/(png|jpeg|webp);base64,/.test(imagen)) throw new Error('La imagen debe ser PNG, JPG o WebP')
    return imagen
  }
  if (seccion === 'informes') {
    const prefijo = String(d.prefijo || '').trim().toUpperCase()
    if (!/^[A-Z0-9]{2,6}$/.test(prefijo)) throw new Error('El prefijo del número debe tener de 2 a 6 letras o números (por ejemplo INF)')
    return { prefijo, pdfChecklist: !!d.pdfChecklist, pdfFotos: !!d.pdfFotos, pdfFirma: !!d.pdfFirma, pdfObservaciones: !!d.pdfObservaciones }
  }
  if (seccion === 'whatsapp') {
    const codigoPais = String(d.codigoPais || '').replace(/^\+/, '').trim()
    if (!/^[1-9]\d{0,3}$/.test(codigoPais)) throw new Error('El código de país debe tener de 1 a 4 números (por ejemplo 593)')
    if (!['corta', 'larga'].includes(d.formatoFecha)) throw new Error('Formato de fecha inválido')
    if (!['12', '24'].includes(String(d.formatoHora))) throw new Error('Formato de hora inválido')
    const ejemplos = Object.fromEntries(IDS_VARIABLES.map((v) => [v, String(d.ejemplos?.[v] ?? '').trim()]).filter(([, e]) => e))
    return { activo: !!d.activo, codigoPais, formatoFecha: d.formatoFecha, formatoHora: String(d.formatoHora), ejemplos }
  }
  const tipos = Array.isArray(d.tipos) ? d.tipos : []
  if (tipos.length < 1 || tipos.length > 12) throw new Error('Debe haber entre 1 y 12 tipos de visita')
  const vistos = new Set()
  return tipos.map((t) => {
    const nombre = String(t.nombre || '').trim()
    if (!nombre) throw new Error('Cada tipo de visita necesita un nombre')
    if (vistos.has(normalizar(nombre))) throw new Error(`Tipo de visita repetido: ${nombre}`)
    vistos.add(normalizar(nombre))
    return { nombre, checklist: (t.checklist || []).map((x) => String(x).trim()).filter(Boolean) }
  })
}
