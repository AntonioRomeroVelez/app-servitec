import test from 'node:test'
import assert from 'node:assert/strict'
import { entornoListo, datosVisita } from './ayudas.js'
import { PLANTILLA_FABRICA, IDS_VARIABLES, TIPOS_PLANTILLA, renderizar, formatearFecha, formatearHora, normalizarTelefono, trozosConFormato, valoresDeEjemplo, variablesDesconocidas } from '../../src/whatsapp.js'
import { CONFIG_DEFECTO } from '../../src/configuracion.js'

const nueva = (extra = {}) => ({ nombre: 'Recordatorio', tipo: 'recordatorio', mensaje: 'Hola {{cliente_nombre}}', activa: true, predeterminada: false, ...extra })
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function escenario(visita = {}) {
  const e = entornoListo()
  const v = e.env.ok('visitas_create', { data: datosVisita({ telefono: '099 123 4567', ...visita }) }, e.admin.token)
  return { ...e, v }
}
const preparar = (e, extra = {}) => e.env.ok('whatsapp_preparar', { id: uuid(1), visitaId: e.v.id, ...extra }, e.admin.token)

test('la plantilla de fábrica y las variables del servidor coinciden con las del frontend', () => {
  const { env, sup } = entornoListo()
  const [fabrica] = env.ok('whatsapp_plantillas_list', {}, sup)
  assert.equal(fabrica.mensaje, PLANTILLA_FABRICA)
  assert.equal(fabrica.predeterminada, true)
  assert.deepEqual(variablesDesconocidas(PLANTILLA_FABRICA), [])
  // el servidor acepta todas las variables y todos los tipos que ofrece la app
  const todas = IDS_VARIABLES.map((v) => `{{${v}}}`).join(' ')
  for (const t of TIPOS_PLANTILLA) env.ok('whatsapp_plantillas_create', { data: nueva({ tipo: t.id, mensaje: todas }) }, sup)
})

test('el mensaje del servidor es el mismo que arma el frontend, con datos reales', () => {
  const e = escenario({ direccion: 'Calle Bolívar 45' })
  e.env.ok('configuracion_update', { seccion: 'whatsapp', data: { ...CONFIG_DEFECTO.whatsapp, formatoFecha: 'larga', formatoHora: '12' } }, e.sup)
  const r = e.env.ok('whatsapp_previsualizar', { visitaId: e.v.id, descripcion: 'Cambio de disco' }, e.admin.token)
  const esperado = renderizar(PLANTILLA_FABRICA, {
    empresa_nombre: 'ServiTec', empresa_telefono: '0900000500', cliente_nombre: 'Cliente A',fecha_cita: formatearFecha('2026-11-20', 'larga'), hora_cita: formatearHora('09:00', '12'),
    servicio_nombre: 'Visita técnica', servicio_descripcion: 'Cambio de disco', tecnico_nombre: 'CARLOS PRUEBA', direccion: 'Calle Bolívar 45',
  })
  assert.equal(r.mensaje, esperado)
  assert.match(r.mensaje, /viernes, 20 de noviembre de 2026/)
  assert.match(r.mensaje, /9:00 a\. m\./)
  assert.equal(r.telefono, '593991234567')
  assert.equal(r.enlace, `https://wa.me/593991234567?text=${encodeURIComponent(esperado)}`)
  assert.doesNotMatch(r.mensaje, /\{\{/)
})

test('las líneas sin datos se omiten y lo que escriben los datos no se vuelve a interpretar', () => {
  const e = escenario({ responsable: '', cliente: 'Ana {{empresa_nombre}}' })
  const r = preparar(e)
  assert.doesNotMatch(r.mensaje, /Técnico asignado|Descripción/)
  assert.match(r.mensaje, /Ana \{\{empresa_nombre\}\}/)
})

test('teléfonos: celulares de Ecuador y números internacionales; lo demás no sirve', () => {
  for (const [entrada, salida] of [['0991234567', '593991234567'], ['+593 99 123 4567', '593991234567'], ['593991234567', '593991234567'], ['991234567', '593991234567'], ['00593991234567', '593991234567'], ['+57 300 123 4567', '573001234567']])
    assert.equal(normalizarTelefono(entrada), salida, entrada)
  for (const mal of ['', 'abc', '022345678', '099123', '0991234567 / 022345678']) assert.equal(normalizarTelefono(mal), '', mal)
  // el servidor decide igual
  const e = escenario()
  for (const t of ['0991234567', '+57 300 123 4567', '022345678', 'abc']) {
    e.env.ok('visitas_update', { id: e.v.id, data: { telefono: t } }, e.admin.token)
    const r = e.env.ok('whatsapp_previsualizar', { visitaId: e.v.id }, e.admin.token)
    assert.equal(r.enlace.split('?')[0].replace('https://wa.me/', ''), normalizarTelefono(t), t)
  }
})

test('preparar queda en el historial y en la bitácora; repetir la petición no duplica', () => {
  const e = escenario()
  const r = preparar(e)
  assert.equal(r.estado, 'Preparado')
  preparar(e)
  const h = e.env.ok('whatsapp_envios_list', { visitaId: e.v.id }, e.admin.token)
  assert.equal(h.total, 1)
  assert.equal(h.items[0].autor, 'lucia')
  assert.equal(h.items[0].mensaje, r.mensaje)
  assert.equal(h.items[0].plantillaNombre, 'Confirmación de cita (de fábrica)')
  assert.ok(e.env.hoja('Bitácora', e.empresaId).filas.some((f) => f.includes('WhatsApp preparado') && f.includes('lucia')))
  // otro administrador no puede reutilizar el identificador
  assert.equal(e.env.llamar('whatsapp_preparar', { id: uuid(1), visitaId: e.v.id }, e.admin2.token).ok, false)
  // eliminar la visita conserva el historial
  e.env.ok('visitas_delete', { id: e.v.id }, e.admin.token)
  assert.equal(e.env.ok('whatsapp_envios_list', {}, e.admin.token).total, 1)
})

test('sin un teléfono válido queda registrado como fallido y la visita no cambia', () => {
  const e = escenario({ telefono: '' })
  const r = preparar(e)
  assert.equal(r.estado, 'Fallido')
  assert.equal(r.enlace, '')
  assert.match(r.error, /no tienen teléfono/)
  assert.equal(e.env.ok('whatsapp_envios_list', { estado: 'Fallido' }, e.admin.token).total, 1)
  assert.equal(e.env.ok('visitas_get', { id: e.v.id }, e.admin.token).estado, 'Programada')
})

test('si la visita no tiene teléfono se usa el del cliente registrado', () => {
  const e = escenario({ telefono: '' })
  e.env.ok('clientes_update', { id: e.v.clienteId, data: { telefono: '0987654321' } }, e.admin.token)
  assert.equal(preparar(e).telefono, '593987654321')
})

test('plantillas: solo el superadministrador las cambia y los administradores ven las activas', () => {
  const { env, sup, admin, tec, root } = entornoListo()
  for (const t of [admin.token, tec.token, root]) assert.equal(env.llamar('whatsapp_plantillas_create', { data: nueva() }, t).code, 'FORBIDDEN')
  assert.equal(env.llamar('whatsapp_plantillas_list', {}, tec.token).code, 'FORBIDDEN')
  const p = env.ok('whatsapp_plantillas_create', { data: nueva() }, sup)
  assert.equal(env.ok('whatsapp_plantillas_list', {}, admin.token).length, 2)
  env.ok('whatsapp_plantillas_update', { id: p.id, data: { activa: false } }, sup)
  assert.equal(env.ok('whatsapp_plantillas_list', {}, admin.token).length, 1)
  assert.equal(env.ok('whatsapp_plantillas_list', {}, sup).length, 2)
  env.ok('whatsapp_plantillas_delete', { id: p.id }, sup)
  assert.equal(env.ok('whatsapp_plantillas_list', {}, sup).length, 1)
  assert.match(env.llamar('whatsapp_plantillas_delete', { id: 'fabrica' }, sup).error, /de fábrica/)
})

test('plantillas: validaciones y una sola predeterminada por tipo', () => {
  const e = escenario()
  const crear = (extra) => e.env.llamar('whatsapp_plantillas_create', { data: nueva(extra) }, e.sup)
  assert.match(crear({ nombre: ' ' }).error, /nombre/)
  assert.match(crear({ tipo: 'x' }).error, /Tipo/)
  assert.match(crear({ mensaje: 'x'.repeat(1501) }).error, /demasiado largo/)
  assert.match(crear({ mensaje: 'Cita {{numero_cita}}' }).error, /Variable desconocida: \{\{numero_cita\}\}/)

  const a = crear({ tipo: 'confirmacion', predeterminada: true, mensaje: 'A {{cliente_nombre}}' }).data
  const b = crear({ tipo: 'confirmacion', predeterminada: true, mensaje: 'B {{cliente_nombre}}' }).data
  const lista = () => e.env.ok('whatsapp_plantillas_list', {}, e.sup)
  assert.deepEqual(lista().filter((p) => p.predeterminada).map((p) => p.id), [b.id])
  assert.equal(preparar(e).mensaje, 'B Cliente A')
  // al desactivar la predeterminada vuelve la de fábrica
  e.env.ok('whatsapp_plantillas_update', { id: b.id, data: { activa: false } }, e.sup)
  assert.deepEqual(lista().filter((p) => p.predeterminada).map((p) => p.id), ['fabrica'])
  assert.match(e.env.llamar('whatsapp_previsualizar', { visitaId: e.v.id, plantillaId: b.id }, e.admin.token).error, /no está disponible/)
  assert.equal(e.env.ok('whatsapp_previsualizar', { visitaId: e.v.id, plantillaId: a.id }, e.admin.token).mensaje, 'A Cliente A')
})

test('envío e historial: solo administradores; cada empresa ve lo suyo', () => {
  const e = escenario()
  preparar(e)
  for (const t of [e.sup, e.tec.token, e.root])
    for (const accion of ['whatsapp_preparar', 'whatsapp_previsualizar', 'whatsapp_envios_list'])
      assert.equal(e.env.llamar(accion, { visitaId: e.v.id }, t).code, 'FORBIDDEN', accion)
})

test('el módulo se puede desactivar y los ajustes se validan', () => {
  const e = escenario()
  const guardar = (data, token = e.sup) => e.env.llamar('configuracion_update', { seccion: 'whatsapp', data: { ...CONFIG_DEFECTO.whatsapp, ...data } }, token)
  assert.equal(guardar({}, e.admin.token).code, 'FORBIDDEN')
  assert.match(guardar({ codigoPais: 'abc' }).error, /código de país/)
  assert.match(guardar({ formatoHora: '99' }).error, /hora/)
  const c = guardar({ activo: false, ejemplos: { cliente_nombre: 'Rosa', inventada: 'x' } }).data
  assert.deepEqual(c.whatsapp.ejemplos, { cliente_nombre: 'Rosa' })
  assert.match(e.env.llamar('whatsapp_previsualizar', { visitaId: e.v.id }, e.admin.token).error, /desactivado/)
})

test('vista previa: datos de ejemplo configurables y formato de WhatsApp sin HTML', () => {
  const v = valoresDeEjemplo({ ...CONFIG_DEFECTO, whatsapp: { ...CONFIG_DEFECTO.whatsapp, ejemplos: { cliente_nombre: 'Rosa' } } })
  assert.equal(v.cliente_nombre, 'Rosa')
  assert.equal(v.fecha_cita, '27-11-2026')
  assert.deepEqual(trozosConFormato('a *b* _c_ <i>x</i> nombre_de_archivo').filter((t) => t.formato).map((t) => [t.texto, t.formato]), [['b', 'negrita'], ['c', 'cursiva']])
})
