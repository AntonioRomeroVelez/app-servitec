// WhatsApp en el modo demo: mismas acciones y permisos que whatsapp_ en apps-script/Code.gs, guardando en localStorage.
import { ID_FABRICA, PLANTILLA_FABRICA, TIPOS_PLANTILLA, MAX_MENSAJE, MAX_DESCRIPCION, variablesDesconocidas, renderizar, formatearFecha, formatearHora, normalizarTelefono, enlaceWa } from './whatsapp'

const LS_P = 'ferisel-demo-whatsapp-plantillas'
const LS_E = 'ferisel-demo-whatsapp-envios'

export function whatsappDemo(op, p, { yo, error, leer, escribir, config, usuarios, visitas, clientes }) {
  const esDePlantillas = op.startsWith('plantillas_')
  if (yo.rol !== 'admin' && !(esDePlantillas && yo.rol === 'superadmin')) throw error('Sin permisos', 'FORBIDDEN')

  const propias = leer(LS_P, [])
  const fabrica = {
    id: ID_FABRICA,
    nombre: 'Confirmación de cita (de fábrica)',
    tipo: 'confirmacion',
    activa: true,
    predeterminada: !propias.some((x) => x.tipo === 'confirmacion' && x.predeterminada && x.activa),
    mensaje: PLANTILLA_FABRICA,
    fabrica: true,
  }
  const todas = [fabrica, ...propias]
  const ahora = new Date().toISOString()

  if (op === 'plantillas_list') return yo.rol === 'superadmin' ? todas : todas.filter((x) => x.activa)

  if (esDePlantillas) {
    if (yo.rol !== 'superadmin') throw error('Solo el superadministrador puede cambiar las plantillas', 'FORBIDDEN')
    if (p.id === ID_FABRICA) throw error('La plantilla de fábrica no se modifica: duplícala y cambia la copia')
    const actual = propias.find((x) => x.id === p.id)
    if (op !== 'plantillas_create' && !actual) throw error('No encontrado')
    if (op === 'plantillas_delete') {
      escribir(LS_P, propias.filter((x) => x.id !== p.id))
      return true
    }
    const d = { activa: true, ...actual, ...p.data }
    const nombre = String(d.nombre || '').trim()
    const mensaje = String(d.mensaje || '').trim()
    if (!nombre) throw error('Escribe el nombre de la plantilla')
    if (!TIPOS_PLANTILLA.some((t) => t.id === d.tipo)) throw error('Tipo de notificación inválido')
    if (!mensaje) throw error('Escribe el mensaje')
    if (mensaje.length > MAX_MENSAJE) throw error(`El mensaje es demasiado largo (máximo ${MAX_MENSAJE} caracteres)`)
    const raras = variablesDesconocidas(mensaje)
    if (raras.length) throw error(`Variable desconocida: {{${raras[0]}}}`)
    const nueva = { id: actual?.id || crypto.randomUUID(), nombre, tipo: d.tipo, mensaje, activa: !!d.activa, predeterminada: !!d.activa && !!d.predeterminada, modificadoPor: yo.usuario, actualizado: ahora }
    const resto = propias.filter((x) => x.id !== nueva.id).map((x) => (nueva.predeterminada && x.tipo === nueva.tipo ? { ...x, predeterminada: false } : x))
    escribir(LS_P, actual ? propias.map((x) => (x.id === nueva.id ? nueva : resto.find((r) => r.id === x.id))) : [...resto, nueva])
    return nueva
  }

  const envios = leer(LS_E, [])
  if (op === 'envios_list') {
    const q = String(p.q || '').trim().toLowerCase()
    const items = envios.filter(
      (e) => (!p.visitaId || e.visitaId === p.visitaId) && (!p.estado || e.estado === p.estado) && (!q || [e.cliente, e.telefono, e.plantillaNombre].some((c) => String(c || '').toLowerCase().includes(q))),
    )
    const limite = Math.min(50, Math.max(1, parseInt(p.limit, 10) || 15))
    const offset = Math.max(0, parseInt(p.offset, 10) || 0)
    return { items: items.slice(offset, offset + limite), total: items.length, hasMore: offset + limite < items.length }
  }
  if (op !== 'previsualizar' && op !== 'preparar') throw error('Acción inválida')

  if (!config.whatsapp.activo) throw error('El envío por WhatsApp está desactivado en los ajustes de la empresa')
  const v = visitas.find((x) => x.id === p.visitaId)
  if (!v) throw error('Visita no encontrada')
  const activas = todas.filter((x) => x.activa)
  const plantilla = p.plantillaId ? activas.find((x) => x.id === p.plantillaId) : activas.find((x) => x.tipo === 'confirmacion' && x.predeterminada)
  if (!plantilla) throw error('La plantilla no está disponible')
  const descripcion = String(p.descripcion || '').trim()
  if (descripcion.length > MAX_DESCRIPCION) throw error(`La descripción es demasiado larga (máximo ${MAX_DESCRIPCION} caracteres)`)
  const telefono = String(v.telefono || clientes.find((c) => c.id === v.clienteId)?.telefono || '').trim()
  const tecnico = usuarios.find((u) => u.usuario === v.responsable)
  const mensaje = renderizar(plantilla.mensaje, {
    empresa_nombre: config.empresa.nombre,
    empresa_telefono: config.empresa.telefono,
    empresa_direccion: config.empresa.direccion,
    cliente_nombre: v.cliente,
    cliente_telefono: telefono,
    fecha_cita: formatearFecha(v.fecha, config.whatsapp.formatoFecha),
    hora_cita: formatearHora(v.hora, config.whatsapp.formatoHora),
    estado_cita: v.estado,
    tecnico_nombre: tecnico?.nombre || v.responsable,
    tecnico_telefono: tecnico?.telefono,
    servicio_nombre: v.tipo,
    servicio_descripcion: descripcion,
    direccion: v.direccion,
  })
  const numero = normalizarTelefono(telefono, config.whatsapp.codigoPais)
  const fallo = numero ? '' : telefono ? `El teléfono "${telefono}" no es un número de WhatsApp válido` : 'La visita y el cliente no tienen teléfono'
  const salida = { cliente: v.cliente, telefono: numero || telefono, plantillaId: plantilla.id, mensaje, error: fallo, enlace: numero ? enlaceWa(numero, mensaje) : '' }
  if (op === 'previsualizar') return salida

  const envio = { id: p.id || crypto.randomUUID(), visitaId: v.id, clienteId: v.clienteId || '', cliente: v.cliente, telefono: salida.telefono, plantillaId: plantilla.id, plantillaNombre: plantilla.nombre, tipo: plantilla.tipo, estado: fallo ? 'Fallido' : 'Preparado', error: fallo, autor: yo.usuario, creado: ahora, mensaje }
  if (!envios.some((e) => e.id === envio.id)) escribir(LS_E, [envio, ...envios])
  return { ...envio, enlace: salida.enlace }
}
