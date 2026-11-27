// Mensajes de WhatsApp: variables, plantilla de fábrica, formato de fecha y hora, teléfonos y enlace wa.me.
// Las mismas reglas están en apps-script/Code.gs (hay pruebas que comprueban que coincidan). Funciones puras.

export const TIPOS_PLANTILLA = [
  { id: 'confirmacion', texto: 'Confirmación' },
  { id: 'recordatorio', texto: 'Recordatorio' },
  { id: 'reprogramacion', texto: 'Reprogramación' },
  { id: 'cancelacion', texto: 'Cancelación' },
  { id: 'otro', texto: 'Otro' },
]
export const textoTipo = (id) => TIPOS_PLANTILLA.find((t) => t.id === id)?.texto ?? id

export const GRUPOS_VARIABLES = [
  {
    grupo: 'Empresa',
    variables: [
      { id: 'empresa_nombre', texto: 'Nombre de la empresa', ejemplo: 'ServiTec' },
      { id: 'empresa_telefono', texto: 'Teléfono de la empresa', ejemplo: '02 234 5678' },
      { id: 'empresa_direccion', texto: 'Dirección de la empresa', ejemplo: 'Av. 10 de Agosto y Colón' },
    ],
  },
  {
    grupo: 'Cliente',
    variables: [
      { id: 'cliente_nombre', texto: 'Nombre del cliente', ejemplo: 'María Pérez' },
      { id: 'cliente_telefono', texto: 'Teléfono del cliente', ejemplo: '0991234567' },
    ],
  },
  {
    grupo: 'Cita',
    variables: [
      { id: 'fecha_cita', texto: 'Fecha de la visita', ejemplo: '2026-11-27', tipo: 'date' },
      { id: 'hora_cita', texto: 'Hora de la visita', ejemplo: '14:30', tipo: 'time' },
      { id: 'estado_cita', texto: 'Estado de la visita', ejemplo: 'Programada' },
    ],
  },
  {
    grupo: 'Técnico',
    variables: [
      { id: 'tecnico_nombre', texto: 'Nombre del técnico asignado', ejemplo: 'Carlos Andrade' },
      { id: 'tecnico_telefono', texto: 'Teléfono del técnico', ejemplo: '0987654321' },
    ],
  },
  {
    grupo: 'Servicio',
    variables: [
      { id: 'servicio_nombre', texto: 'Tipo de visita', ejemplo: 'Mantenimiento' },
      { id: 'servicio_descripcion', texto: 'Descripción (opcional, se escribe al enviar)', ejemplo: 'Limpieza de cámaras y revisión del grabador' },
    ],
  },
  { grupo: 'Ubicación', variables: [{ id: 'direccion', texto: 'Dirección de la visita', ejemplo: 'Calle Bolívar 45' }] },
]
export const VARIABLES = GRUPOS_VARIABLES.flatMap((g) => g.variables)
export const IDS_VARIABLES = VARIABLES.map((v) => v.id)

export const MAX_MENSAJE = 1500
export const MAX_DESCRIPCION = 500
export const ID_FABRICA = 'fabrica'

export const PLANTILLA_FABRICA = [
  '*{{empresa_nombre}}*',
  '*Confirmación de cita*',
  '',
  'Un cordial saludo, {{cliente_nombre}}.',
  '',
  'Nos complace confirmar que su cita ha sido agendada con los siguientes datos:',
  '',
  '📅 *Fecha:* {{fecha_cita}}',
  '🕒 *Hora:* {{hora_cita}}',
  '🛠️ *Servicio:* {{servicio_nombre}}',
  '📝 *Descripción:* {{servicio_descripcion}}',
  '👨‍🔧 *Técnico asignado:* {{tecnico_nombre}}',
  '📍 *Dirección:* {{direccion}}',
  '',
  'Si necesita reprogramar o cancelar su cita, le agradeceremos comunicarse con nosotros con anticipación.',
  '📞 {{empresa_telefono}}',
  '',
  'Gracias por su confianza. Será un gusto atenderle.',
  '',
  'Atentamente,',
  '*{{empresa_nombre}}*',
].join('\n')

const TOKEN = /\{\{\s*([^{}]*?)\s*\}\}/g

/** Variables escritas en un mensaje, sin repetir. */
export const variablesDe = (mensaje) => [...new Set([...String(mensaje || '').matchAll(TOKEN)].map((m) => m[1]))]
export const variablesDesconocidas = (mensaje) => variablesDe(mensaje).filter((v) => !IDS_VARIABLES.includes(v))

/**
 * Reemplaza las variables una sola vez (lo que traigan los datos no se vuelve a interpretar). Una línea cuyas variables
 * están todas vacías se omite, para no dejar renglones como "Técnico asignado: " sin nada.
 */
export function renderizar(mensaje, valores) {
  const valor = (id) => String(valores[id] ?? '').trim()
  return String(mensaje || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((linea) => {
      const usadas = [...linea.matchAll(TOKEN)].map((m) => m[1])
      return !usadas.length || usadas.some((v) => valor(v))
    })
    .map((linea) => linea.replace(TOKEN, (_, v) => valor(v)))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** 'corta' -> 27-11-2026; 'larga' -> viernes, 27 de noviembre de 2026 */
export function formatearFecha(iso, formato = 'corta') {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  if (!m) return String(iso || '')
  if (formato !== 'larga') return `${m[3]}-${m[2]}-${m[1]}`
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${m[1]}`
}

/** '24' -> 14:30; '12' -> 2:30 p. m. */
export function formatearHora(hora, formato = '24') {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hora || ''))
  if (!m) return String(hora || '')
  const h = Number(m[1])
  if (formato !== '12') return `${String(h).padStart(2, '0')}:${m[2]}`
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'a. m.' : 'p. m.'}`
}

/** Número en formato internacional sin signos (5939XXXXXXXX), o '' si no sirve para WhatsApp. */
export function normalizarTelefono(telefono, codigo = '593') {
  const texto = String(telefono || '').trim()
  if (!/^\+?[\d\s().-]+$/.test(texto)) return ''
  let n = texto.replace(/\D/g, '')
  if (texto.startsWith('+') || n.startsWith('00')) n = n.replace(/^00/, '')
  else if (!(n.startsWith(codigo) && n.length >= codigo.length + 8)) n = codigo + n.replace(/^0/, '')
  if (n.startsWith('593')) return /^5939\d{8}$/.test(n) ? n : '' // en Ecuador solo los celulares
  return /^\d{8,15}$/.test(n) ? n : ''
}

export const enlaceWa = (numero, mensaje) => `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`

/** Valores de la vista previa del editor: los datos de ejemplo configurados, con el formato elegido. */
export function valoresDeEjemplo(config) {
  const propios = config.whatsapp.ejemplos || {}
  const v = Object.fromEntries(VARIABLES.map((x) => [x.id, propios[x.id] || x.ejemplo]))
  // Los datos de la empresa son los reales cuando están llenos
  for (const [id, campo] of [['empresa_nombre', 'nombre'], ['empresa_telefono', 'telefono'], ['empresa_direccion', 'direccion']]) {
    if (!propios[id] && config.empresa[campo]) v[id] = config.empresa[campo]
  }
  v.fecha_cita = formatearFecha(v.fecha_cita, config.whatsapp.formatoFecha)
  v.hora_cita = formatearHora(v.hora_cita, config.whatsapp.formatoHora)
  return v
}

/** Parte un mensaje en trozos con el formato de WhatsApp (*negrita*, _cursiva_, ~tachado~, ```fijo```) para mostrarlo sin usar HTML. */
export function trozosConFormato(mensaje) {
  const marcas = { '*': 'negrita', _: 'cursiva', '~': 'tachado' }
  return String(mensaje || '')
    .split(/(```[^`\n]+```|(?<![\p{L}\p{N}])(?:\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)(?![\p{L}\p{N}]))/u)
    .filter(Boolean)
    .map((t) => {
      if (t.length > 6 && t.startsWith('```') && t.endsWith('```')) return { texto: t.slice(3, -3), formato: 'fijo' }
      return marcas[t[0]] && t.length > 2 && t.endsWith(t[0]) ? { texto: t.slice(1, -1), formato: marcas[t[0]] } : { texto: t, formato: '' }
    })
}

// ---------- Editor del mensaje (solo frontend: el mensaje se guarda siempre como un único texto) ----------

/** Un bloque es cada parte del mensaje separada por una línea en blanco. */
export const aBloques = (mensaje) => String(mensaje || '').replace(/\r\n?/g, '\n').split(/\n(?:[ \t]*\n)+/)
export const deBloques = (bloques) => bloques.join('\n\n')
/** Antes de guardar: sin líneas en blanco de más ni espacios sobrantes en los extremos. */
export const limpiarMensaje = (mensaje) => String(mensaje || '').replace(/\r\n?/g, '\n').replace(/\n(?:[ \t]*\n){2,}/g, '\n\n').trim()

const MARCAS = { negrita: '*', cursiva: '_', tachado: '~', fijo: '```' }
const PREFIJOS = { lista: '- ', cita: '> ' }

/**
 * Pone o quita un formato sobre lo seleccionado. Devuelve el texto nuevo y la selección que debe quedar.
 * Los formatos de texto se aplican línea por línea (WhatsApp no los admite entre renglones).
 */
export function aplicarFormato(texto, desde, hasta, tipo) {
  const prefijo = PREFIJOS[tipo]
  if (prefijo) {
    const ini = desde ? texto.lastIndexOf('\n', desde - 1) + 1 : 0
    const salto = texto.indexOf('\n', hasta)
    const fin = salto < 0 ? texto.length : salto
    const lineas = texto.slice(ini, fin).split('\n')
    const quitar = lineas.every((l) => l.startsWith(prefijo))
    const nuevo = lineas.map((l) => (quitar ? l.slice(prefijo.length) : prefijo + l)).join('\n')
    return { texto: texto.slice(0, ini) + nuevo + texto.slice(fin), desde: ini, hasta: ini + nuevo.length }
  }
  const m = MARCAS[tipo]
  // Ya está marcado alrededor de la selección: se quita
  if (desde >= m.length && texto.slice(desde - m.length, desde) === m && texto.slice(hasta, hasta + m.length) === m) {
    return { texto: texto.slice(0, desde - m.length) + texto.slice(desde, hasta) + texto.slice(hasta + m.length), desde: desde - m.length, hasta: hasta - m.length }
  }
  const elegido = texto.slice(desde, hasta) || 'texto'
  const nuevo = elegido
    .split('\n')
    .map((l) => l.replace(/^(\s*)(.*?)(\s*)$/, (_, a, centro, b) => (centro ? a + m + centro + m + b : l)))
    .join('\n')
  const margen = nuevo.indexOf(m)
  const unaLinea = !elegido.includes('\n') && margen >= 0
  return {
    texto: texto.slice(0, desde) + nuevo + texto.slice(hasta),
    desde: unaLinea ? desde + margen + m.length : desde,
    hasta: unaLinea ? desde + nuevo.lastIndexOf(m) : desde + nuevo.length,
  }
}

const CITA = '📅 *Fecha:* {{fecha_cita}}\n🕒 *Hora:* {{hora_cita}}\n🛠️ *Servicio:* {{servicio_nombre}}'
const DESPEDIDA = 'Atentamente,\n*{{empresa_nombre}}*'

/** Partes listas para agregar al mensaje. */
export const BLOQUES_LISTOS = [
  { id: 'vacio', texto: 'Texto libre', contenido: '' },
  { id: 'titulo', texto: 'Título', contenido: '*{{empresa_nombre}}*\n*Título del mensaje*' },
  { id: 'saludo', texto: 'Saludo', contenido: 'Un cordial saludo, {{cliente_nombre}}.' },
  { id: 'cita', texto: 'Datos de la cita', contenido: CITA },
  { id: 'tecnico', texto: 'Técnico', contenido: '👨‍🔧 *Técnico:* {{tecnico_nombre}}\n📱 {{tecnico_telefono}}' },
  { id: 'ubicacion', texto: 'Dirección', contenido: '📍 *Dirección:* {{direccion}}' },
  { id: 'contacto', texto: 'Contacto', contenido: 'Cualquier consulta, comuníquese con nosotros.\n📞 {{empresa_telefono}}' },
  { id: 'despedida', texto: 'Despedida', contenido: DESPEDIDA },
  { id: 'separador', texto: 'Separador', contenido: '──────────' },
]

const modelo = (titulo, intro, cierre) =>
  [`*{{empresa_nombre}}*\n*${titulo}*`, 'Un cordial saludo, {{cliente_nombre}}.', intro, `${CITA}\n📍 *Dirección:* {{direccion}}`, `${cierre}\n📞 {{empresa_telefono}}`, DESPEDIDA].join('\n\n')

/** Mensajes completos de partida. */
export const MODELOS_MENSAJE = [
  { id: 'confirmacion', texto: 'Confirmación completa', mensaje: PLANTILLA_FABRICA },
  { id: 'corto', texto: 'Confirmación corta', mensaje: 'Hola {{cliente_nombre}}, su visita de {{servicio_nombre}} quedó agendada para el {{fecha_cita}} a las {{hora_cita}}.\n\n*{{empresa_nombre}}*' },
  { id: 'recordatorio', texto: 'Recordatorio', mensaje: modelo('Recordatorio de cita', 'Le recordamos su próxima visita:', 'Si no podrá recibirnos, avísenos con anticipación.') },
  { id: 'reprogramacion', texto: 'Reprogramación', mensaje: modelo('Cita reprogramada', 'Su visita tiene nueva fecha:', 'Si el horario no le conviene, escríbanos.') },
  { id: 'cancelacion', texto: 'Cancelación', mensaje: '*{{empresa_nombre}}*\n*Cita cancelada*\n\nUn cordial saludo, {{cliente_nombre}}.\n\nSu visita del {{fecha_cita}} a las {{hora_cita}} fue cancelada.\n\nPara agendar una nueva fecha comuníquese con nosotros.\n📞 {{empresa_telefono}}' },
]
