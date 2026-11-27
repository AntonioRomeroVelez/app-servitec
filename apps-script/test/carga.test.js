import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { entornoListo, datosVisita } from './ayudas.js'
import { crearCapaOffline } from '../../src/offline/capa.js'

test('caché del servidor: repetir una consulta no relee las hojas y un cambio la invalida', () => {
  const { env, admin, tec } = entornoListo()
  env.ok('visitas_create', { data: datosVisita() }, admin.token)
  for (const accion of ['dashboard_resumen', 'visitas_list', 'informes_list', 'clientes_list']) {
    const primera = env.ok(accion, {}, admin.token)
    env.reiniciarStats()
    assert.deepEqual(env.ok(accion, {}, admin.token), primera)
    assert.equal(env.stats.celdasLeidas, 0, accion)
  }
  env.ok('visitas_create', { data: datosVisita({ cliente: 'Otro cliente' }) }, admin.token)
  assert.equal(env.ok('visitas_list', {}, admin.token).total, 2)
  assert.equal(env.ok('clientes_list', {}, admin.token).total, 2)
  // La respuesta guardada es de cada usuario: el técnico no recibe lo del administrador
  assert.equal(env.ok('dashboard_resumen', {}, tec.token).clientes, 0)
})

test('lecturas iguales a la vez comparten una petición y la copia guardada llega primero', async () => {
  let peticiones = 0
  let responder
  const capa = crearCapaOffline({
    red: () => (peticiones++, new Promise((ok) => (responder = ok))),
    sesion: () => ({ usuarioId: 'u-carga', usuario: 'ana' }),
  })
  const pausa = () => new Promise((ok) => setTimeout(ok, 30))

  const a = capa.call('tecnicos_list')
  const b = capa.call('tecnicos_list')
  await pausa()
  assert.equal(peticiones, 1)
  responder(['uno'])
  assert.deepEqual(await a, ['uno'])
  assert.deepEqual(await b, ['uno'])
  await pausa()

  let copia
  const c = capa.call('tecnicos_list', {}, { previo: (d) => (copia = d) })
  await pausa()
  assert.deepEqual(copia, ['uno'])
  responder(['dos'])
  assert.deepEqual(await c, ['dos'])
})
