// Personalización de la marca: colores desde el logo, encabezado propio, logo claro y fondo del ingreso.
import test from 'node:test'
import assert from 'node:assert/strict'
import { entornoListo } from './ayudas.js'
import { coloresDePixeles, hastaLegible } from '../../src/colores.js'
import { estiloFondo, contraste } from '../../src/tema.js'
import { valorSeccion } from '../../src/validarConfig.js'

const pixeles = (...grupos) => grupos.flatMap(([n, rgba]) => Array.from({ length: n }, () => rgba).flat())
const IMAGEN = 'data:image/jpeg;base64,' + 'AAAA'.repeat(20)

test('colores desde el logo: el dominante como principal (legible) y otro tono como acento', () => {
  const r = coloresDePixeles(pixeles([500, [255, 255, 255, 255]], [300, [30, 120, 60, 255]], [100, [250, 160, 20, 255]], [900, [0, 0, 0, 0]]))
  assert.ok(contraste(r.primario, '#ffffff') >= 4.5)
  const [rojo, verde, azul] = [1, 3, 5].map((i) => parseInt(r.primario.slice(i, i + 2), 16))
  assert.ok(verde > rojo && verde > azul, r.primario)
  assert.equal(r.acento, '#faa014')
})

test('un logo de un solo color o gris también da una combinación; uno vacío no', () => {
  for (const color of [[240, 220, 40, 255], [60, 60, 60, 255]]) {
    const r = coloresDePixeles(pixeles([50, color]))
    assert.ok(contraste(r.primario, '#ffffff') >= 4.5, r.primario)
    assert.match(r.acento, /^#[0-9a-f]{6}$/)
  }
  assert.equal(coloresDePixeles(pixeles([50, [255, 255, 255, 255]])), null)
  assert.ok(contraste(hastaLegible('#ffff00'), '#ffffff') >= 4.5)
})

test('fondo del ingreso: degradado, color sólido o foto (sin foto, degradado)', () => {
  assert.match(estiloFondo({ fondo: 'degradado' }).backgroundImage, /brand-900/)
  assert.equal(estiloFondo({ fondo: 'solido', encabezado: '#111111' }).backgroundColor, '#111111')
  assert.match(estiloFondo({ fondo: 'foto' }, IMAGEN).backgroundImage, /url\("data:image\/jpeg/)
  assert.match(estiloFondo({ fondo: 'foto' }, '').backgroundImage, /brand-900/)
})

test('el superadministrador guarda encabezado, fondo, logo claro y foto; se ven antes de ingresar', () => {
  const { env, sup, sa, empresaId } = entornoListo()
  const guardar = (seccion, data) => env.llamar('configuracion_update', { seccion, data }, sup)
  const colores = { primario: '#157347', acento: '#f59e0b' }
  assert.equal(guardar('tema', { ...colores, encabezado: '#111827', fondo: 'foto' }).ok, true)
  assert.equal(guardar('logoClaro', { logoClaro: IMAGEN }).ok, true)
  assert.equal(guardar('fondoImagen', { fondoImagen: IMAGEN }).ok, true)
  const publica = env.ok('configuracion_get', { empresa: empresaId })
  assert.deepEqual([publica.tema.encabezado, publica.tema.fondo, publica.logoClaro, publica.fondoImagen], ['#111827', 'foto', IMAGEN, IMAGEN])
  assert.equal(env.ok('configuracion_get', {}, sa).fondoImagen, IMAGEN)

  assert.match(guardar('tema', { ...colores, encabezado: '#ffee00' }).error, /encabezado es demasiado claro/)
  assert.match(guardar('tema', { ...colores, fondo: 'video' }).error, /Fondo/)
  assert.match(guardar('fondoImagen', { fondoImagen: 'https://x.com/a.jpg' }).error, /La foto debe ser/)
  assert.match(guardar('logoClaro', { logoClaro: 'data:image/png;base64,' + 'A'.repeat(46000) }).error, /pesado/)
  assert.equal(guardar('fondoImagen', { fondoImagen: '' }).data.fondoImagen, '')
  assert.equal(env.llamar('configuracion_update', { seccion: 'logoClaro', data: { logoClaro: IMAGEN } }, sa).code, 'FORBIDDEN')
})

test('el modo demo valida las mismas reglas', () => {
  assert.deepEqual(valorSeccion('tema', { primario: '#157347', acento: '#f59e0b' }), { primario: '#157347', acento: '#f59e0b', encabezado: '', fondo: 'degradado' })
  assert.throws(() => valorSeccion('tema', { primario: '#157347', acento: '#f59e0b', encabezado: '#ffee00' }), /encabezado/)
  assert.equal(valorSeccion('logoClaro', { logoClaro: IMAGEN }), IMAGEN)
})
