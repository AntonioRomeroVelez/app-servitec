// Ajustes: marca de la empresa antes de ingresar, enlace con la empresa e informe de ejemplo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { entornoListo } from './ayudas.js'
import { enlaceInstalacion } from '../../src/plataforma.js'
import { CONFIG_DEFECTO } from '../../src/configuracion.js'
import { datosEjemplo } from '../../src/informeEjemplo.js'
import { actividadesIniciales, ejemploDeActividad, actividadesUtiles } from '../../src/plantillas.js'
import { generarPdfInforme } from '../../src/pdfInforme.js'

test('antes de ingresar se ve la marca de la empresa indicada, y solo la marca', () => {
  const { env, sup, root, empresaId } = entornoListo()
  env.ok('configuracion_update', { seccion: 'empresa', data: { nombre: 'Alarmas Norte' } }, sup)
  env.ok('configuracion_update', { seccion: 'tema', data: { primario: '#157347', acento: '#f59e0b' } }, sup)
  env.ok('configuracion_update', { seccion: 'informes', data: { prefijo: 'NOR' } }, sup)

  const r = env.ok('configuracion_get', { empresa: empresaId })
  assert.deepEqual([r.empresa.nombre, r.tema.primario], ['Alarmas Norte', '#157347'])
  assert.equal(r.informes.prefijo, CONFIG_DEFECTO.informes.prefijo) // lo demás no se entrega sin sesión
  assert.deepEqual(env.ok('configuracion_get', {}), CONFIG_DEFECTO)
  assert.deepEqual(env.ok('configuracion_get', { empresa: 'no-existe' }), CONFIG_DEFECTO)

  env.ok('empresas_update', { id: empresaId, data: { activa: false } }, root)
  assert.deepEqual(env.ok('configuracion_get', { empresa: empresaId }), CONFIG_DEFECTO)
})

test('el enlace de instalación puede llevar la empresa', () => {
  assert.equal(enlaceInstalacion('https://x.com', 'abc-123'), 'https://x.com/?instalar=1&empresa=abc-123')
  assert.equal(enlaceInstalacion('https://x.com', ''), 'https://x.com/?instalar=1')
})

test('el informe de ejemplo usa lo que se está editando y genera un PDF', async () => {
  const config = { ...CONFIG_DEFECTO, empresa: { ...CONFIG_DEFECTO.empresa, nombre: 'Alarmas Norte' }, informes: { ...CONFIG_DEFECTO.informes, prefijo: 'NOR' } }
  const d = datosEjemplo(config)
  assert.match(d.informe.numero, /^NOR-\d{4}-0001$/)
  assert.equal(d.empresa.nombre, 'Alarmas Norte')
  assert.ok(d.checklist.length > 1)
  const doc = await generarPdfInforme({ ...d, logo: null })
  assert.ok(doc.output('arraybuffer').byteLength > 1000)
  assert.deepEqual(datosEjemplo({ ...config, tipos: [{ nombre: 'Otro', checklist: [] }] }).checklist, [])
})

test('un informe nuevo empieza con dos actividades vacías que solo muestran un ejemplo', () => {
  const dos = actividadesIniciales()
  assert.equal(dos.length, 2)
  assert.deepEqual(actividadesUtiles(dos), []) // vacías: no se guardan
  assert.match(ejemploDeActividad(0, 'Visita técnica'), /Ej\.: Estado general/)
  for (const [n, tipo] of [[2, 'Visita técnica'], [0, 'Otro'], [0, 'No existe']]) assert.equal(ejemploDeActividad(n, tipo), 'Describe lo que hiciste…')
})
