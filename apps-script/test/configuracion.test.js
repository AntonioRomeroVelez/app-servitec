import { test } from 'node:test'
import assert from 'node:assert/strict'
import { entornoListo, datosVisita, datosInforme } from './ayudas.js'
import { crearEntorno } from './harness.js'
import { CONFIG_DEFECTO } from '../../src/configuracion.js'
import { paleta, contraste, textoSobre, hexAHsl, hslAHex } from '../../src/tema.js'

const PNG_CHICO = 'data:image/png;base64,' + 'iVBORw0KGgo='.repeat(10)
const config = (env, token) => env.ok('configuracion_get', {}, token) // sin token: valores por defecto
const guardar = (env, _token, seccion, data) => env.ok('configuracion_update', { seccion, data }, env.sup) // solo el superadministrador del sistema

test('la configuración por defecto del servidor y la del frontend son idénticas (no se desincronizan)', () => {
  const env = crearEntorno()
  assert.deepEqual(config(env), CONFIG_DEFECTO)
})

test('la lectura es pública (sirve para la pantalla de ingreso) y no expone datos sensibles', () => {
  const env = crearEntorno()
  const r = env.llamar('configuracion_get', {}) // sin sesión
  assert.equal(r.ok, true)
  const claves = Object.keys(r.data).sort()
  assert.deepEqual(claves, ['empresa', 'fondoImagen', 'informes', 'logo', 'logoClaro', 'tema', 'tipos'])
  assert.ok(!JSON.stringify(r.data).match(/hash|salt|clave|token/i))
})

test('solo el superadministrador de la empresa modifica la configuración', () => {
  const { env, sa, admin, tec } = entornoListo()
  for (const q of [{ token: sa }, admin, tec]) assert.equal(env.llamar('configuracion_update', { seccion: 'empresa', data: { nombre: 'X' } }, q.token).code, 'FORBIDDEN')
  assert.equal(env.llamar('configuracion_update', { seccion: 'empresa', data: { nombre: 'Otra Empresa' } }, env.sup).ok, true)
  assert.equal(config(env, sa).empresa.nombre, 'Otra Empresa') // su empresa ve el cambio de inmediato
  assert.equal(config(env, admin.token).empresa.nombre, 'Otra Empresa')
  assert.equal(config(env).empresa.nombre, CONFIG_DEFECTO.empresa.nombre) // sin sesión no se conoce la empresa
  assert.equal(env.llamar('configuracion_update', { seccion: 'inventada', data: {} }, env.sup).error, 'Sección inválida')
})

test('datos de la empresa: se guardan, se validan y lo no enviado queda en blanco', () => {
  const { env, sa } = entornoListo()
  const r = guardar(env, sa, 'empresa', { nombre: ' Seguridad Total ', subtitulo: 'Cámaras y alarmas', ruc: '1790000000001', direccion: 'Av. Principal 1', telefono: '0999999999', correo: 'info@ejemplo.ec', web: 'https://ejemplo.ec', pie: 'Gracias por confiar en nosotros' })
  assert.equal(r.empresa.nombre, 'Seguridad Total') // se recortan los espacios
  assert.equal(r.empresa.ruc, '1790000000001')
  assert.equal(r.empresa.pie, 'Gracias por confiar en nosotros')

  assert.match(env.llamar('configuracion_update', { seccion: 'empresa', data: { nombre: '  ' } }, env.sup).error, /nombre de la empresa/)
  assert.match(env.llamar('configuracion_update', { seccion: 'empresa', data: { nombre: 'X', correo: 'no-es-correo' } }, env.sup).error, /Correo inválido/)
  assert.match(env.llamar('configuracion_update', { seccion: 'empresa', data: { nombre: 'X'.repeat(61) } }, env.sup).error, /demasiado largo/)
  assert.equal(config(env, sa).empresa.nombre, 'Seguridad Total') // un intento rechazado no cambia nada
})

test('colores: formato #RRGGBB y el principal debe dejar leer el texto blanco', () => {
  const { env, sa } = entornoListo()
  assert.equal(guardar(env, sa, 'tema', { primario: '#157347', acento: '#F59E0B' }).tema.acento, '#f59e0b') // normaliza a minúsculas
  assert.match(env.llamar('configuracion_update', { seccion: 'tema', data: { primario: 'azul', acento: '#f59e0b' } }, env.sup).error, /#RRGGBB/)
  assert.match(env.llamar('configuracion_update', { seccion: 'tema', data: { primario: '#ffee00', acento: '#f59e0b' } }, env.sup).error, /demasiado claro/)
  assert.equal(config(env, sa).tema.primario, '#157347')
})

test('logo: PNG, JPG o WebP razonablemente livianos; se puede quitar', () => {
  const { env, sa } = entornoListo()
  assert.equal(guardar(env, sa, 'logo', { logo: PNG_CHICO }).logo, PNG_CHICO)
  assert.equal(config(env, sa).logo, PNG_CHICO)

  assert.match(env.llamar('configuracion_update', { seccion: 'logo', data: { logo: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' } }, env.sup).error, /PNG, JPG o WebP/) // SVG puede llevar scripts
  assert.match(env.llamar('configuracion_update', { seccion: 'logo', data: { logo: 'https://sitio.com/logo.png' } }, env.sup).error, /PNG, JPG o WebP/)
  assert.match(env.llamar('configuracion_update', { seccion: 'logo', data: { logo: 'data:image/png;base64,' + 'A'.repeat(46000) } }, env.sup).error, /pesado/)
  assert.equal(config(env, sa).logo, PNG_CHICO)

  assert.equal(guardar(env, sa, 'logo', { logo: '' }).logo, '') // quitar el logo
})

test('informes: el prefijo cambia el número y las secciones del PDF se guardan', () => {
  const { env, sa, admin } = entornoListo()
  const anio = new Date().getFullYear()
  const a = env.ok('informes_create', { data: datosInforme() }, admin.token)
  assert.equal(a.numero, `INF-${anio}-0001`)

  const cfg = guardar(env, sa, 'informes', { prefijo: 'fer', pdfChecklist: true, pdfFotos: false, pdfFirma: true, pdfObservaciones: false })
  assert.deepEqual(cfg.informes, { prefijo: 'FER', pdfChecklist: true, pdfFotos: false, pdfFirma: true, pdfObservaciones: false })
  const b = env.ok('informes_create', { data: datosInforme({ titulo: 'Con prefijo nuevo' }) }, admin.token)
  assert.equal(b.numero, `FER-${anio}-0001`) // el correlativo es por prefijo: los anteriores no se tocan
  assert.equal(env.ok('informes_get', { id: a.id }, admin.token).numero, `INF-${anio}-0001`)

  for (const malo of ['A', 'ABCDEFG', 'IN F', 'inf-1', '']) {
    assert.match(env.llamar('configuracion_update', { seccion: 'informes', data: { prefijo: malo } }, env.sup).error, /prefijo/, malo)
  }
})

test('tipos de visita y checklists: se editan, se validan y no afectan lo ya registrado', () => {
  const { env, sa, admin } = entornoListo()
  const v = env.ok('visitas_create', { data: datosVisita({ tipo: 'Visita técnica' }) }, admin.token)

  const cfg = guardar(env, sa, 'tipos', { tipos: [{ nombre: 'Instalación', checklist: ['Montaje', ' Pruebas ', ''] }, { nombre: 'Otro', checklist: [] }] })
  assert.deepEqual(cfg.tipos, [{ nombre: 'Instalación', checklist: ['Montaje', 'Pruebas'] }, { nombre: 'Otro', checklist: [] }]) // limpia espacios y vacíos
  assert.equal(env.ok('visitas_get', { id: v.id }, admin.token).tipo, 'Visita técnica') // la visita conserva su tipo aunque ya no esté en la lista

  const mal = (tipos, patron) => assert.match(env.llamar('configuracion_update', { seccion: 'tipos', data: { tipos } }, env.sup).error, patron)
  mal([], /entre 1 y 12/)
  mal(Array.from({ length: 13 }, (_, i) => ({ nombre: 'T' + i, checklist: [] })), /entre 1 y 12/)
  mal([{ nombre: '', checklist: [] }], /necesita un nombre/)
  mal([{ nombre: 'Banco', checklist: [] }, { nombre: ' BANCO ', checklist: [] }], /repetido/)
  mal([{ nombre: 'A', checklist: Array.from({ length: 31 }, (_, i) => 'ítem ' + i) }], /Máximo 30/)
  mal([{ nombre: 'A', checklist: ['x'.repeat(101)] }], /demasiado largo/)
  assert.equal(config(env, sa).tipos[0].nombre, 'Instalación')
})

test('restablecer una sección vuelve a los valores por defecto', () => {
  const { env, sa } = entornoListo()
  guardar(env, sa, 'empresa', { nombre: 'Otra' })
  guardar(env, sa, 'tema', { primario: '#157347', acento: '#f59e0b' })
  const r = env.ok('configuracion_update', { seccion: 'empresa', restablecer: true }, env.sup)
  assert.deepEqual(r.empresa, CONFIG_DEFECTO.empresa)
  assert.equal(r.tema.primario, '#157347') // las demás secciones no se tocan
})

test('la configuración queda en la hoja "Configuración" y cada cambio en la bitácora', () => {
  const { env, sa } = entornoListo()
  guardar(env, sa, 'empresa', { nombre: 'Otra' })
  guardar(env, sa, 'tema', { primario: '#157347', acento: '#f59e0b' })
  guardar(env, sa, 'empresa', { nombre: 'Otra 2' }) // actualizar la misma sección no duplica la fila

  const filas = env.hoja('Configuración').filas
  assert.equal(filas.length, 3) // encabezado + empresa + tema
  assert.deepEqual(filas.slice(1).map((f) => f[0]).sort(), ['empresa', 'tema'])
  assert.equal(env.hoja('Configuración').formatos[2], '@') // el valor (JSON o logo) se guarda como texto
  assert.equal(env.hoja('Configuración').formatos[4], 'dd-MM-yyyy HH:mm')
  assert.equal(filas.find((f) => f[0] === 'empresa')[2], 'servitec') // quién lo cambió: el superadministrador de la empresa

  const bitacora = env.hoja('Bitácora').filas.map((f) => f[4] + ' | ' + f[5])
  assert.ok(bitacora.includes('Configuración modificada | Datos de la empresa'))
  assert.ok(bitacora.includes('Configuración modificada | Colores'))
})

test('los correos usan el nombre y los colores configurados', () => {
  const { env, sa, admin } = entornoListo()
  const lista = env.ok('usuarios_list', {}, sa)
  env.ok('usuarios_update', { id: lista.find((u) => u.usuario === 'carlos').id, data: { correo: 'carlos@ejemplo.ec' } }, sa)
  guardar(env, sa, 'empresa', { nombre: 'Seguridad Total', subtitulo: 'Cámaras y alarmas' })
  guardar(env, sa, 'tema', { primario: '#157347', acento: '#f59e0b' })

  env.ok('visitas_create', { data: datosVisita() }, admin.token)
  const html = env.correos[0].htmlBody
  assert.match(html, /Seguridad Total/)
  assert.match(html, /Cámaras y alarmas/)
  assert.match(html, /#157347/)
  assert.ok(!html.includes('FERISEL'))
})

test('un dato dañado en la hoja no rompe la app: se usa el valor por defecto', () => {
  const { env, sa } = entornoListo()
  guardar(env, sa, 'empresa', { nombre: 'Otra' })
  env.hoja('Configuración').filas[1][1] = '{esto no es json' // alguien editó la celda a mano
  env.llamar('configuracion_update', { seccion: 'tipos', data: { tipos: [{ nombre: 'Solo', checklist: [] }] } }, env.sup) // invalida la caché
  const r = config(env, sa)
  assert.deepEqual(r.empresa, CONFIG_DEFECTO.empresa)
  assert.equal(r.tipos[0].nombre, 'Solo')
})

// ---------- Colores del frontend (funciones puras) ----------

test('paleta: con el azul por defecto reproduce los tonos del diseño original', () => {
  const p = paleta('#1565d8')
  const cerca = (a, b, tol = 14) => hexARgbDist(a, b) <= tol
  assert.equal(p[600], '#1565d8')
  assert.ok(cerca(p[800], '#0b3a85'), `800: ${p[800]}`)
  assert.ok(cerca(p[900], '#0a2a5e'), `900: ${p[900]}`)
  assert.ok(cerca(p[950], '#06173a', 18), `950: ${p[950]}`)
  assert.ok(cerca(p[50], '#eff6ff', 12), `50: ${p[50]}`)
})

function hexARgbDist(a, b) {
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [x, y] = [rgb(a), rgb(b)]
  return Math.max(...x.map((v, i) => Math.abs(v - y[i])))
}

test('paleta: de más clara a más oscura, para cualquier color principal', () => {
  for (const primario of ['#157347', '#b3261e', '#4338ca', '#374151', '#1565d8']) {
    const p = paleta(primario)
    const luz = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((k) => hexAHsl(p[k])[2])
    for (let i = 1; i < luz.length; i++) assert.ok(luz[i] <= luz[i - 1] + 1, `${primario}: ${luz.map(Math.round)}`)
    assert.ok(contraste(p[800], '#ffffff') >= 7, `${primario}: el encabezado (800) debe leerse con texto blanco`)
  }
})

test('contraste y color de texto sobre el acento', () => {
  assert.equal(Math.round(contraste('#000000', '#ffffff')), 21)
  assert.ok(contraste('#1565d8', '#ffffff') >= 4.5) // el azul por defecto cumple
  assert.ok(contraste('#ffee00', '#ffffff') < 4.5) // un amarillo no sirve como color principal
  assert.equal(textoSobre('#f6c915', '#06173a'), '#06173a') // sobre amarillo, texto oscuro
  assert.equal(textoSobre('#1e3a8a', '#06173a'), '#ffffff') // sobre azul oscuro, texto blanco
  assert.equal(hslAHex(...hexAHsl('#157347')).length, 7)
})
