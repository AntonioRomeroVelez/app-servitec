import test from 'node:test'
import assert from 'node:assert/strict'
import { entornoListo, datosVisita } from './ayudas.js'
import { leerUbicacion, textoUbicacion, enlaceGoogleMaps, direccionDe } from '../../src/mapa.js'

const PUNTO = '-0.180653,-78.467834'

test('la ubicación se guarda con la visita, llega en el listado y la ve el técnico', () => {
  const { env, empresaId, admin, tec } = entornoListo()
  const v = env.ok('visitas_create', { data: datosVisita({ ubicacion: PUNTO }) }, admin.token)
  assert.equal(env.ok('visitas_list', {}, tec.token).items[0].ubicacion, PUNTO)
  assert.equal(env.ok('visitas_get', { id: v.id }, tec.token).ubicacion, PUNTO)
  assert.ok(env.hoja('Visitas', empresaId).filas[0].includes('ubicacion'))
  // el técnico no cambia el punto; el administrador sí puede quitarlo
  env.ok('visitas_update', { id: v.id, data: { estado: 'Aceptada', ubicacion: '1.000000,1.000000' } }, tec.token)
  assert.equal(env.ok('visitas_get', { id: v.id }, admin.token).ubicacion, PUNTO)
  env.ok('visitas_update', { id: v.id, data: { ubicacion: '' } }, admin.token)
  assert.equal(env.ok('visitas_get', { id: v.id }, admin.token).ubicacion, '')
})

test('una hoja de visitas anterior recibe la columna nueva al guardar y conserva sus datos', () => {
  const { env, empresaId, admin } = entornoListo()
  const vieja = env.ok('visitas_create', { data: datosVisita({ cliente: 'Antigua' }) }, admin.token)
  const filas = env.hoja('Visitas', empresaId).filas
  const columna = filas[0].indexOf('ubicacion')
  filas.forEach((f) => f.splice(columna, 1)) // como la dejaba la versión anterior
  env.ok('visitas_create', { data: datosVisita({ cliente: 'Nueva', ubicacion: PUNTO }) }, admin.token)
  assert.equal(env.hoja('Visitas', empresaId).filas[0][columna], 'ubicacion')
  const lista = env.ok('visitas_list', {}, admin.token).items
  assert.equal(lista.find((x) => x.cliente === 'Nueva').ubicacion, PUNTO)
  assert.equal(env.ok('visitas_get', { id: vieja.id }, admin.token).ubicacion || '', '')
})

test('el servidor y la app rechazan los mismos puntos', () => {
  const { env, admin } = entornoListo()
  for (const bueno of [PUNTO, '0,0', '-90,180']) {
    assert.ok(leerUbicacion(bueno), bueno)
    env.ok('visitas_create', { data: datosVisita({ ubicacion: bueno }) }, admin.token)
  }
  for (const malo of ['hola', '91,0', '0,181', '-0.18', '0.1, 0.2', '=1+1', '1,2,3']) {
    assert.equal(leerUbicacion(malo), null, malo)
    assert.match(env.llamar('visitas_create', { data: datosVisita({ ubicacion: malo }) }, admin.token).error, /ubicación/, malo)
  }
})

test('Cómo llegar usa el punto marcado y, sin punto, la dirección', () => {
  assert.equal(textoUbicacion({ lat: -0.1806531111, lng: -78.4678342222 }), '-0.180653,-78.467834')
  assert.match(enlaceGoogleMaps({ ubicacion: PUNTO, direccion: 'Av. Amazonas' }), /query=-0\.180653%2C-78\.467834$/)
  assert.match(enlaceGoogleMaps({ ubicacion: '', direccion: 'Av. Amazonas 1' }), /query=Av\.%20Amazonas%201$/)
  assert.equal(enlaceGoogleMaps({ ubicacion: '', direccion: ' ' }), '')
})

test('la dirección del punto se acorta: calle, barrio y ciudad', () => {
  const r = { name: '', display_name: 'largo', address: { road: 'Avenida Amazonas', house_number: 'N34', suburb: 'Iñaquito', city: 'Quito', country: 'Ecuador' } }
  assert.equal(direccionDe(r), 'Avenida Amazonas N34, Iñaquito, Quito')
  assert.equal(direccionDe({ display_name: 'Solo el nombre' }), 'Solo el nombre')
  assert.equal(direccionDe(null), '')
})
