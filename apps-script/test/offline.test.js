// Pruebas del modo sin conexión: la capa real (src/offline) contra el backend real (Code.gs en el simulador),
// con IndexedDB simulado y una "red" que se puede cortar o que puede perder la respuesta.
import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { entornoListo, datosVisita, datosInforme, checklistCompleto, JPEG_B64, MINI } from './ayudas.js'
import { crearCapaOffline } from '../../src/offline/capa.js'
import { estado } from '../../src/offline/estado.js'
import * as almacen from '../../src/offline/almacen.js'

const asentar = () => new Promise((r) => setTimeout(r, 30)) // las copias de lectura se guardan sin bloquear la respuesta
const reiniciarEstado = () => Object.assign(estado, { enLinea: true, pendientes: 0, fallidas: 0, sincronizando: false })

/** Un cliente (la app de un usuario) conectado al backend simulado a través de una red controlable */
function cliente(e, quien) {
  const net = { sinRed: false, perderRespuesta: false, token: quien.token, llamadas: [] }
  const red = async (action, payload) => {
    net.llamadas.push(action)
    if (net.sinRed) throw Object.assign(new Error('sin red'), { code: 'RED' })
    const r = e.env.llamar(action, payload, net.token)
    if (net.perderRespuesta && !/_(list|get)$/.test(action)) {
      net.perderRespuesta = false // el servidor SÍ ejecutó la acción, pero la respuesta nunca llegó
      throw Object.assign(new Error('se perdió la respuesta'), { code: 'RED' })
    }
    if (!r.ok) throw Object.assign(new Error(r.error), { code: r.code })
    return r.data
  }
  const capa = crearCapaOffline({ red, sesion: () => ({ usuarioId: quien.id, usuario: quien.usuario }), programar: () => {} })
  return { capa, net }
}

// Visita asignada a carlos y ya aceptada, para que pueda crear informes y subir fotos
function escenario() {
  reiniciarEstado()
  const e = entornoListo()
  const v = e.env.ok('visitas_create', { data: datosVisita() }, e.admin.token)
  e.env.ok('visitas_update', { id: v.id, data: { estado: 'Aceptada' } }, e.tec.token)
  return { e, v, ...cliente(e, e.tec) }
}
const delServidor = (e, quien, accion, p = {}) => e.env.ok(accion, p, quien.token)

test('lecturas: con red se guardan; sin red se responde con la copia; sin copia, error claro', async () => {
  const { e, v, capa, net } = escenario()
  assert.equal((await capa.call('visitas_list', {})).items.length, 1)
  await asentar()

  net.sinRed = true
  const sinRed = await capa.call('visitas_list', {})
  assert.deepEqual(sinRed.items.map((x) => x.id), [v.id])
  assert.equal(estado.enLinea, false)

  await assert.rejects(capa.call('visitas_list', { desde: '2030-01-01' }), (err) => err.code === 'OFFLINE' && /sin datos guardados/.test(err.message))
  net.sinRed = false
  assert.equal((await capa.call('visitas_list', {})).items.length, 1)
  assert.equal(estado.enLinea, true)
  assert.ok(e)
})

test('aceptar una visita sin conexión: queda en cola, se ve al instante y se envía al volver', async () => {
  const { e, v, capa, net } = escenario()
  e.env.ok('visitas_update', { id: v.id, data: { estado: 'Programada' } }, e.admin.token) // vuelve a Programada
  await capa.call('visitas_list', {})
  await asentar()

  net.sinRed = true
  const r = await capa.call('visitas_update', { id: v.id, data: { estado: 'Aceptada' } })
  assert.equal(r._pendiente, true)
  assert.equal(estado.pendientes, 1)

  const lista = await capa.call('visitas_list', {})
  assert.equal(lista.items[0].estado, 'Aceptada')
  assert.equal(lista.items[0]._pendiente, true)
  assert.equal(delServidor(e, e.admin, 'visitas_list').items[0].estado, 'Programada') // el servidor aún no lo sabe

  net.sinRed = false
  assert.equal(await capa.sincronizar(), 1)
  assert.equal(estado.pendientes, 0)
  assert.equal(delServidor(e, e.admin, 'visitas_list').items[0].estado, 'Aceptada')
  assert.ok(delServidor(e, e.admin, 'notificaciones_list').items.some((n) => n.titulo === 'Visita aceptada')) // y el admin recibió el aviso
  assert.equal((await capa.listarCola()).length, 0)
})

test('varios cambios de estado sin conexión se envían en orden, uno por uno', async () => {
  const { e, v, capa, net } = escenario()
  await capa.call('visitas_list', {})
  await asentar()
  net.sinRed = true
  await capa.call('visitas_update', { id: v.id, data: { estado: 'En curso' } })
  await capa.call('visitas_update', { id: v.id, data: { estado: 'Realizada' } })
  assert.equal((await capa.listarCola()).length, 2) // no se funden: el servidor valida cada paso
  net.sinRed = false
  assert.equal(await capa.sincronizar(), 2)
  assert.equal(delServidor(e, e.admin, 'visitas_list').items[0].estado, 'Realizada')
})

test('informe sin conexión: crear + editar se funden en un envío y el servidor asigna el número', async () => {
  const { e, v, capa, net } = escenario()
  await capa.call('informes_list', {})
  await asentar()
  net.sinRed = true

  const nuevo = await capa.call('informes_create', { data: datosInforme({ visitaId: v.id, titulo: 'Revisión sin señal' }) })
  assert.match(nuevo.id, /^[0-9a-f-]{36}$/) // id generado por el cliente
  assert.equal(nuevo.numero, '')
  assert.equal(nuevo._pendiente, true)
  await capa.call('informes_update', { id: nuevo.id, data: { descripcion: 'Se cambió el disco duro', checklist: checklistCompleto } })
  const cola = await capa.listarCola()
  assert.equal(cola.length, 1)
  assert.equal(cola[0].payload.data.descripcion, 'Se cambió el disco duro')

  // se ve completo sin conexión (en el detalle y en la lista) aunque el servidor no lo conozca
  const detalle = await capa.call('informes_get', { id: nuevo.id })
  assert.equal(detalle.descripcion, 'Se cambió el disco duro')
  assert.equal(detalle._pendiente, true)
  const lista = await capa.call('informes_list', {})
  assert.deepEqual(lista.items.map((i) => i.titulo), ['Revisión sin señal'])
  assert.equal(lista.items[0].descripcion, undefined) // el listado sigue siendo liviano

  net.sinRed = false
  assert.equal(await capa.sincronizar(), 1)
  const enServidor = delServidor(e, e.tec, 'informes_get', { id: nuevo.id })
  assert.equal(enServidor.numero, `INF-${new Date().getFullYear()}-0001`)
  assert.equal(enServidor.descripcion, 'Se cambió el disco duro')
  assert.equal((await capa.call('informes_list', {})).items[0]._pendiente, undefined)
})

test('crear y eliminar un informe sin conexión no deja nada pendiente', async () => {
  const { e, v, capa, net } = escenario()
  net.sinRed = true
  const nuevo = await capa.call('informes_create', { data: datosInforme({ visitaId: v.id }) })
  await capa.call('informes_update', { id: nuevo.id, data: { titulo: 'x' } })
  await capa.call('informes_delete', { id: nuevo.id })
  assert.equal((await capa.listarCola()).length, 0)
  assert.equal(estado.pendientes, 0)
  net.sinRed = false
  assert.equal(await capa.sincronizar(), 0)
  assert.equal(delServidor(e, e.tec, 'informes_list').total, 0)
})

test('fotos sin conexión: se ven en la galería, se pueden quitar y se suben al volver', async () => {
  const { e, v, capa, net } = escenario()
  net.sinRed = true
  const f1 = await capa.call('fotos_upload', { visitaId: v.id, imagen: JPEG_B64, mini: MINI })
  const f2 = await capa.call('fotos_upload', { visitaId: v.id, imagen: JPEG_B64, mini: MINI })
  assert.equal(f1._pendiente, true)
  assert.equal((await capa.call('fotos_list', { visitaId: v.id })).length, 2)
  assert.match((await capa.call('fotos_get', { id: f1.id })).dataUrl, /^data:image\/jpeg;base64,/)

  await capa.call('fotos_delete', { id: f2.id }) // quitar una que nunca se subió: se descarta
  assert.equal((await capa.listarCola()).length, 1)
  assert.equal((await capa.call('fotos_list', { visitaId: v.id })).length, 1)

  net.sinRed = false
  assert.equal(await capa.sincronizar(), 1)
  assert.equal(e.env.drive.archivos.size, 1)
  const enServidor = delServidor(e, e.tec, 'fotos_list', { visitaId: v.id })
  assert.deepEqual(enServidor.map((f) => f.id), [f1.id])
})

test('si se pierde la respuesta, el reintento no duplica el informe ni gasta otro número', async () => {
  const { e, v, capa, net } = escenario()
  net.perderRespuesta = true // el servidor crea el informe pero el cliente no se entera
  const r = await capa.call('informes_create', { data: datosInforme({ visitaId: v.id }) })
  assert.equal(r._pendiente, true) // para la app quedó pendiente
  assert.equal(delServidor(e, e.tec, 'informes_list').total, 1) // aunque el servidor ya lo tiene

  net.sinRed = false
  estado.enLinea = true
  assert.equal(await capa.sincronizar(), 1)
  const lista = delServidor(e, e.tec, 'informes_list')
  assert.equal(lista.total, 1)
  assert.equal(lista.items[0].numero, `INF-${new Date().getFullYear()}-0001`)
  assert.equal(estado.pendientes, 0)
})

test('con cambios en cola, uno nuevo no se adelanta aunque haya conexión (se respeta el orden)', async () => {
  const { e, v, capa, net } = escenario()
  net.sinRed = true
  await capa.call('visitas_update', { id: v.id, data: { estado: 'En curso' } })
  net.sinRed = false
  estado.enLinea = true // vuelve la red, pero el cambio anterior aún no se envió
  net.llamadas.length = 0
  await capa.call('visitas_update', { id: v.id, data: { estado: 'Realizada' } })
  assert.deepEqual(net.llamadas, []) // no se envió por delante
  assert.equal((await capa.listarCola()).length, 2)
  assert.equal(await capa.sincronizar(), 2)
  assert.equal(delServidor(e, e.admin, 'visitas_list').items[0].estado, 'Realizada')
})

test('un cambio que el servidor rechaza queda como fallido sin bloquear a los demás', async () => {
  const { e, v, capa, net } = escenario()
  net.sinRed = true
  await capa.call('visitas_update', { id: v.id, data: { estado: 'Aceptada' } }) // ya está aceptada: no hay cambio
  e.env.ok('visitas_update', { id: v.id, data: { estado: 'Programada' } }, e.admin.token) // el admin la devuelve a Programada
  await capa.call('visitas_update', { id: v.id, data: { estado: 'Realizada' } }) // desde Programada no se puede saltar
  await capa.call('visitas_update', { id: v.id, data: { notas: 'Llegué a las 9' } }) // este sí es válido
  net.sinRed = false

  const hechos = await capa.sincronizar()
  assert.equal(hechos, 2) // 'Aceptada' (válida desde Programada) y las notas
  assert.equal(estado.fallidas, 1)
  const [fallida] = (await capa.listarCola()).filter((o) => o.estado === 'fallida')
  assert.match(fallida.error, /no permitido/)
  assert.equal(delServidor(e, e.admin, 'visitas_list').items[0].notas, 'Llegué a las 9')

  await capa.reintentar(fallida.n) // sigue siendo inválida
  assert.equal(estado.fallidas, 1)
  await capa.descartar(fallida.n)
  assert.equal(estado.fallidas, 0)
  assert.equal((await capa.listarCola()).length, 0)
})

test('sesión vencida al sincronizar: se avisa y los cambios se conservan para el próximo ingreso', async () => {
  const { e, v, capa, net } = escenario()
  const avisos = []
  capa.ganchos.alExpirarSesion = (codigo) => avisos.push(codigo)
  net.sinRed = true
  await capa.call('visitas_update', { id: v.id, data: { notas: 'pendiente' } })
  net.sinRed = false
  const tokenBueno = net.token
  net.token = 'token-vencido'

  assert.equal(await capa.sincronizar(), 0)
  assert.deepEqual(avisos, ['AUTH'])
  assert.equal(estado.pendientes, 1) // sigue en cola

  net.token = tokenBueno // el usuario vuelve a entrar
  assert.equal(await capa.sincronizar(), 1)
  assert.equal(delServidor(e, e.admin, 'visitas_list').items[0].notas, 'pendiente')
})

test('los cambios de un usuario no se envían con la sesión de otro en el mismo dispositivo', async () => {
  const { e, v, capa, net } = escenario()
  net.sinRed = true
  await capa.call('visitas_update', { id: v.id, data: { notas: 'de carlos' } })
  const otro = cliente(e, e.tec2)
  assert.equal((await otro.capa.listarCola()).length, 0)
  assert.equal(await otro.capa.sincronizar(), 0)
  assert.equal((await capa.listarCola()).length, 1) // el de carlos sigue esperando
})

test('las acciones que requieren conexión fallan con un mensaje claro', async () => {
  const { capa, net } = escenario()
  net.sinRed = true
  for (const accion of ['usuarios_list', 'cambiar_clave', 'visitas_delete', 'login']) {
    await assert.rejects(capa.call(accion, {}), (err) => err.code === 'OFFLINE' && /necesita internet/.test(err.message), accion)
  }
})

test('eliminar algo que ya no existe en el servidor cuenta como hecho', async () => {
  const { e, v, capa, net } = escenario()
  const inf = await capa.call('informes_create', { data: datosInforme({ visitaId: v.id }) })
  net.sinRed = true
  await capa.call('informes_delete', { id: inf.id })
  e.env.ok('informes_delete', { id: inf.id }, e.sa) // alguien más lo eliminó mientras tanto
  net.sinRed = false
  assert.equal(await capa.sincronizar(), 1)
  assert.equal(estado.fallidas, 0)
})

test('con conexión también se muestran los cambios que aún no se enviaron', async () => {
  const { e, v, capa, net } = escenario()
  await capa.call('visitas_list', {})
  net.sinRed = true
  await capa.call('visitas_update', { id: v.id, data: { notas: 'sin enviar' } })
  net.sinRed = false
  estado.enLinea = true
  const lista = await capa.call('visitas_list', {}) // el servidor responde, sin esa nota todavía
  assert.equal(lista.items[0].notas, 'sin enviar')
  assert.equal(lista.items[0]._pendiente, true)
  assert.ok(e)
})

test('fotos completas guardadas se sirven sin conexión y se limita cuántas se conservan', async () => {
  const { e, v, capa, net } = escenario()
  const f = delServidor(e, e.tec, 'fotos_upload', { visitaId: v.id, imagen: JPEG_B64, mini: MINI })
  await capa.call('fotos_get', { id: f.id })
  await asentar()
  net.sinRed = true
  assert.match((await capa.call('fotos_get', { id: f.id })).dataUrl, /^data:image\/jpeg;base64,/)

  for (let i = 0; i < 45; i++) await almacen.guardarLectura(`rec|fotos_get|${i}`, { dataUrl: 'x' }, 'fotos_get')
  await almacen.recortarLecturas('fotos_get', 40)
  const quedan = (await Promise.all(Array.from({ length: 45 }, (_, i) => almacen.leerLectura(`rec|fotos_get|${i}`)))).filter(Boolean)
  assert.equal(quedan.length, 40)
})

test('al cerrar sesión se borran las copias de lectura pero se conservan los cambios pendientes', async () => {
  const { e, v, capa, net } = escenario()
  await capa.call('visitas_list', {})
  await asentar()
  net.sinRed = true
  await capa.call('visitas_update', { id: v.id, data: { notas: 'no perder' } })
  await capa.limpiarLecturas()
  await assert.rejects(capa.call('visitas_list', {}), (err) => err.code === 'OFFLINE') // sin copia
  assert.equal((await capa.listarCola()).length, 1) // pero el cambio sigue esperando
  assert.ok(e)
})
