import { test } from 'node:test'
import assert from 'node:assert/strict'
import { entornoListo, datosVisita } from './ayudas.js'

const clientes = (env, quien, p = {}) => env.ok('clientes_list', p, quien.token)

test('al registrar una visita el cliente queda registrado y la visita queda vinculada', () => {
  const { env, admin } = entornoListo()
  assert.equal(clientes(env, admin).total, 0)

  const v = env.ok('visitas_create', { data: datosVisita({ cliente: 'Banco del Sur', direccion: 'Av. Amazonas 123', telefono: '0991234567' }) }, admin.token)
  const lista = clientes(env, admin)
  assert.equal(lista.total, 1)
  assert.equal(lista.items[0].nombre, 'Banco del Sur')
  assert.equal(lista.items[0].direccion, 'Av. Amazonas 123')
  assert.equal(lista.items[0].telefono, '0991234567')
  assert.equal(lista.items[0].autor, 'lucia')
  assert.equal(lista.items[0].clave, undefined) // la clave interna no sale
  assert.equal(v.clienteId, lista.items[0].id)
})

test('el mismo cliente escrito distinto no se duplica; solo se completan datos vacíos', () => {
  const { env, admin, admin2 } = entornoListo()
  env.ok('visitas_create', { data: datosVisita({ cliente: 'Clínica Señor Ñandú', direccion: '', telefono: '' }) }, admin.token)
  const v2 = env.ok('visitas_create', { data: datosVisita({ cliente: '  clinica   SENOR nandu ', direccion: 'Calle Bolívar 45', telefono: '022222222' }) }, admin2.token)

  const lista = clientes(env, admin)
  assert.equal(lista.total, 1) // mayúsculas, tildes y espacios no crean otro cliente
  assert.equal(lista.items[0].nombre, 'Clínica Señor Ñandú') // conserva el primer nombre
  assert.equal(lista.items[0].direccion, 'Calle Bolívar 45') // lo vacío se completó
  assert.equal(lista.items[0].telefono, '022222222')
  assert.equal(v2.clienteId, lista.items[0].id)

  // los datos ya cargados no se pisan
  env.ok('visitas_create', { data: datosVisita({ cliente: 'Clínica Señor Ñandú', direccion: 'Otra calle', telefono: '000' }) }, admin.token)
  assert.equal(clientes(env, admin).items[0].direccion, 'Calle Bolívar 45')
})

test('cambiar el cliente de una visita registra el nuevo; el técnico no crea clientes', () => {
  const { env, admin, tec } = entornoListo()
  const v = env.ok('visitas_create', { data: datosVisita({ cliente: 'Cliente Uno' }) }, admin.token)
  const r = env.ok('visitas_update', { id: v.id, data: { cliente: 'Cliente Dos' } }, admin.token)
  assert.equal(clientes(env, admin).total, 2)
  assert.notEqual(r.clienteId, v.clienteId)

  env.ok('visitas_update', { id: v.id, data: { estado: 'Aceptada', cliente: 'Inventado por el técnico' } }, tec.token) // el técnico solo cambia estado y notas
  assert.equal(clientes(env, admin).total, 2)
})

test('repetir la creación de una visita (reintento sin conexión) no duplica el cliente', () => {
  const { env, admin } = entornoListo()
  const id = crypto.randomUUID()
  env.ok('visitas_create', { data: datosVisita({ id, cliente: 'Cliente Offline' }) }, admin.token)
  env.ok('visitas_create', { data: datosVisita({ id, cliente: 'Cliente Offline' }) }, admin.token)
  assert.equal(clientes(env, admin).total, 1)
})

test('permisos: el técnico no ve el catálogo; admin y superadmin sí', () => {
  const { env, sa, admin, tec } = entornoListo()
  env.ok('visitas_create', { data: datosVisita() }, admin.token)
  assert.equal(env.llamar('clientes_list', {}, tec.token).code, 'FORBIDDEN')
  assert.equal(env.llamar('clientes_create', { data: { nombre: 'X' } }, tec.token).code, 'FORBIDDEN')
  assert.equal(clientes(env, admin).total, 1)
  assert.equal(env.ok('clientes_list', {}, sa).total, 1) // el catálogo es compartido: el superadmin y todos los admins ven todo
})

test('crear y editar clientes a mano: validaciones y nombres únicos', () => {
  const { env, admin } = entornoListo()
  assert.match(env.llamar('clientes_create', { data: { nombre: '   ' } }, admin.token).error, /nombre del cliente/)
  const a = env.ok('clientes_create', { data: { nombre: 'Hotel Plaza', direccion: 'Centro', telefono: '0999' } }, admin.token)
  assert.match(env.llamar('clientes_create', { data: { nombre: 'hotel  PLAZA' } }, admin.token).error, /Ya existe/)
  const b = env.ok('clientes_create', { data: { nombre: 'Hotel Sol' } }, admin.token)

  const r = env.ok('clientes_update', { id: a.id, data: { telefono: '0988', direccion: 'Av. Nueva' } }, admin.token)
  assert.equal(r.telefono, '0988')
  assert.equal(r.nombre, 'Hotel Plaza') // lo no enviado se conserva
  assert.match(env.llamar('clientes_update', { id: b.id, data: { nombre: 'Hotel Plaza' } }, admin.token).error, /Ya existe/)
  assert.equal(env.ok('clientes_update', { id: b.id, data: { nombre: 'Hotel Sol y Luna' } }, admin.token).nombre, 'Hotel Sol y Luna')

  // una visita nueva con el nombre de un cliente creado a mano se vincula a él (sin duplicar)
  const v = env.ok('visitas_create', { data: datosVisita({ cliente: 'HOTEL PLAZA' }) }, admin.token)
  assert.equal(v.clienteId, a.id)
  assert.equal(clientes(env, admin).total, 2)
})

test('búsqueda y paginación del catálogo, ordenado por nombre', () => {
  const { env, admin } = entornoListo()
  const nombres = ['Zapatería Luna', 'Banco del Sur', 'Álamo Hotel', 'Clínica Norte', 'Banco Central']
  nombres.forEach((n, i) => env.ok('clientes_create', { data: { nombre: n, telefono: `099${i}`, direccion: i === 2 ? 'Calle de los Pinos' : '' } }, admin.token))

  assert.deepEqual(clientes(env, admin).items.map((c) => c.nombre), ['Álamo Hotel', 'Banco Central', 'Banco del Sur', 'Clínica Norte', 'Zapatería Luna'])
  assert.equal(clientes(env, admin, { q: 'banco' }).total, 2)
  assert.equal(clientes(env, admin, { q: 'ALAMO' }).total, 1) // sin tildes ni mayúsculas
  assert.equal(clientes(env, admin, { q: 'pinos' }).items[0].nombre, 'Álamo Hotel') // también por dirección
  assert.equal(clientes(env, admin, { q: '0993' }).items[0].nombre, 'Clínica Norte') // y por teléfono

  const p1 = clientes(env, admin, { limit: 2 })
  const p2 = clientes(env, admin, { limit: 2, offset: 2 })
  assert.equal(p1.hasMore, true)
  assert.deepEqual([...p1.items, ...p2.items].map((c) => c.nombre).slice(0, 4), ['Álamo Hotel', 'Banco Central', 'Banco del Sur', 'Clínica Norte'])
})

test('eliminar: solo un administrador y solo clientes sin visitas', () => {
  const { env, admin, tec } = entornoListo()
  const v = env.ok('visitas_create', { data: datosVisita({ cliente: 'Con visitas' }) }, admin.token)
  const libre = env.ok('clientes_create', { data: { nombre: 'Sin visitas' } }, admin.token)

  assert.equal(env.llamar('clientes_delete', { id: libre.id }, tec.token).code, 'FORBIDDEN')
  assert.match(env.llamar('clientes_delete', { id: v.clienteId }, admin.token).error, /tiene visitas/)
  assert.equal(env.llamar('clientes_delete', { id: libre.id }, admin.token).ok, true)
  assert.equal(env.ok('clientes_list', {}, admin.token).total, 1)
})

test('visitas_list filtra por cliente', () => {
  const { env, admin } = entornoListo()
  const a = env.ok('visitas_create', { data: datosVisita({ cliente: 'Cliente A' }) }, admin.token)
  env.ok('visitas_create', { data: datosVisita({ cliente: 'Cliente A', fecha: '2026-12-01' }) }, admin.token)
  env.ok('visitas_create', { data: datosVisita({ cliente: 'Cliente B' }) }, admin.token)
  const r = env.ok('visitas_list', { clienteId: a.clienteId, orden: 'desc' }, admin.token)
  assert.equal(r.total, 2)
  assert.deepEqual(r.items.map((v) => v.fecha), ['2026-12-01', '2026-11-20'])
})

test('registrarClientesExistentes: registra los clientes de visitas anteriores al catálogo', () => {
  const { env, admin } = entornoListo()
  env.ok('visitas_create', { data: datosVisita({ cliente: 'Antiguo Uno' }) }, admin.token)
  env.ok('visitas_create', { data: datosVisita({ cliente: 'Antiguo Dos' }) }, admin.token)
  env.ok('visitas_create', { data: datosVisita({ cliente: 'antiguo uno' }) }, admin.token)

  // se simula una hoja anterior al catálogo: sin clientes y sin vínculo en las visitas
  const iCol = env.tablas.VISITAS.headers.indexOf('clienteId')
  env.hoja('Visitas').filas.slice(1).forEach((f) => (f[iCol] = ''))
  env.hoja('Clientes').filas.length = 1
  assert.equal(clientes(env, admin).total, 0)

  env.ejecutar('registrarClientesExistentes')
  assert.deepEqual(clientes(env, admin).items.map((c) => c.nombre), ['Antiguo Dos', 'Antiguo Uno'])
  const vs = env.ok('visitas_list', {}, admin.token).items
  assert.equal(vs.every((v) => v.clienteId), true)
  assert.equal(new Set(vs.map((v) => v.clienteId)).size, 2)
  assert.ok(env.logs.some((l) => /Visitas vinculadas a un cliente: 3/.test(l)))
})
