// Prueba de escala: con miles de registros (cada informe con firma, checklist y observaciones) se mide cuántas
// celdas lee el backend por petición y cuánto pesa la respuesta. No mide la latencia real de Google, pero las
// celdas leídas y los bytes devueltos son lo que de verdad hace lenta una hoja.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { entornoListo, datosVisita, JPEG_B64, MINI } from './ayudas.js'

const N = 20000 // informes
const NV = 10000 // visitas
const NF = 5000 // fotos
const COLS_INFORMES = 17 // columnas totales (lo que leía el diseño anterior por fila)
const LIGERAS_INFORMES = 14
const COLS_VISITAS = 16

const autores = ['lucia', 'marta', 'carlos', 'diego']
const firma = 'data:image/png;base64,' + 'A'.repeat(10000) // una firma real pesa ~10 KB
const checklist = JSON.stringify(Array.from({ length: 7 }, (_, i) => ({ item: `Ítem de revisión número ${i}`, resultado: 'ok', obs: '' })))
const descripcion = 'Observaciones del técnico sobre la visita. '.repeat(25)
const fechaDe = (i) => new Date(Date.UTC(2024, 0, 1) + ((i * 37) % 1000) * 86400000).toISOString().slice(0, 10)

function sembrar({ env, sa }) {
  // Se crean las hojas llamando una vez a cada listado; luego se rellenan directamente (más rápido que 30 mil POST)
  env.ok('informes_list', {}, sa)
  env.ok('visitas_list', {}, sa)
  const informes = env.hoja('Informes')
  const visitas = env.hoja('Visitas')
  const iso = (i) => new Date(Date.UTC(2024, 0, 1) + i * 60000).toISOString()

  const propietarioVisita = (i) => (i % 3 === 0 ? 'lucia' : 'marta')
  for (let i = 0; i < NV; i++) {
    visitas.filas.push([`v${i}`, fechaDe(i), '09:00', `Cliente ${i % 500}`, 'Av. Principal 123', '', 'Visita técnica', i % 2 ? 'carlos' : 'diego', 'Programada', '', propietarioVisita(i), iso(i), propietarioVisita(i), iso(i), '', ''])
  }
  for (let i = 0; i < N; i++) {
    const visitaId = i % 2 ? `v${i % NV}` : ''
    informes.filas.push([`i${i}`, fechaDe(i), `Cliente ${i % 500}`, `Informe ${i}`, 'Visita técnica', i % 4 === 0 ? 'Finalizado' : 'Borrador', autores[i % 4], autores[i % 4], iso(i), autores[i % 4], iso(i), visitaId, `INF-2020-${String(i + 1).padStart(5, '0')}`, 'Cliente', descripcion, checklist, firma])
  }
  return { propietarioVisita }
}

function medir(env, fn) {
  env.reiniciarStats()
  const t0 = performance.now()
  const r = fn()
  return { r, celdas: env.stats.celdasLeidas, caracteres: env.stats.caracteres, lecturas: env.stats.lecturas, ms: Math.round(performance.now() - t0), bytes: JSON.stringify(r).length }
}

const mb = (n) => (n / 1024 / 1024 < 10 ? (n / 1024 / 1024).toFixed(1) : Math.round(n / 1024 / 1024)) + ' MB'
const fmt = (m) => `${m.celdas.toLocaleString('es')} celdas (${mb(m.caracteres)} leídos), ${m.lecturas} lecturas, ${(m.bytes / 1024).toFixed(1)} KB devueltos, ${m.ms} ms de CPU local`

test(`con ${N.toLocaleString('es')} informes y ${NV.toLocaleString('es')} visitas las consultas siguen siendo baratas`, (t) => {
  const e = entornoListo()
  const { env, sa, admin, tec } = e
  const { propietarioVisita } = sembrar(e)

  const naivoCeldas = N * COLS_INFORMES
  const naivoBytes = N * (firma.length + checklist.length + descripcion.length + 300)
  t.diagnostic(`DISEÑO ANTERIOR (estimado): cada listado de informes leía ${naivoCeldas.toLocaleString('es')} celdas (~${mb(naivoBytes)}) y devolvía todo eso al navegador`)

  // Calentamiento: la primera petición de cada usuario trae la tabla Usuarios a caché
  env.ok('me', {}, sa)
  env.ok('me', {}, admin.token)
  env.ok('me', {}, tec.token)

  // 1) Sesión: con la caché caliente, validar el token no lee ninguna hoja
  const me = medir(env, () => env.ok('me', {}, admin.token))
  t.diagnostic(`me                          -> ${fmt(me)}`)
  assert.equal(me.celdas, 0)

  // 2) Listado de informes, superadmin: solo columnas livianas, una página
  const lSa = medir(env, () => env.ok('informes_list', { limit: 50 }, sa))
  t.diagnostic(`informes_list (superadmin)  -> ${fmt(lSa)}`)
  assert.equal(lSa.r.items.length, 50)
  assert.equal(lSa.r.total, N)
  assert.ok(lSa.celdas <= N * LIGERAS_INFORMES + 100, 'no debe leer las columnas pesadas')
  assert.ok(lSa.celdas < naivoCeldas * 0.85)
  assert.ok(lSa.caracteres < naivoBytes * 0.05, `debe leer menos del 5% de los caracteres del diseño anterior (${mb(lSa.caracteres)} vs ${mb(naivoBytes)})`)
  assert.ok(lSa.bytes < 60 * 1024, `la respuesta debe ser pequeña (${lSa.bytes} bytes)`)
  const fechas = lSa.r.items.map((x) => x.fecha)
  assert.deepEqual(fechas, [...fechas].sort().reverse())

  // 3) Listado de informes, admin: además consulta qué visitas agendó (2 columnas de Visitas)
  const lAd = medir(env, () => env.ok('informes_list', { limit: 50 }, admin.token))
  t.diagnostic(`informes_list (admin)       -> ${fmt(lAd)}`)
  assert.ok(lAd.celdas <= N * LIGERAS_INFORMES + 2 * NV + 100)
  // Resultado correcto: sus informes + los de las visitas que agendó (comprobado contra los datos sembrados)
  let esperadosAdmin = 0
  for (let i = 0; i < N; i++) {
    const suyo = autores[i % 4] === 'lucia'
    const deSuVisita = i % 2 === 1 && propietarioVisita(i % NV) === 'lucia'
    if (suyo || deSuVisita) esperadosAdmin++
  }
  assert.equal(lAd.r.total, esperadosAdmin)

  // 4) Listado, técnico: solo los suyos, sin consultar Visitas
  const lTec = medir(env, () => env.ok('informes_list', { limit: 50 }, tec.token))
  t.diagnostic(`informes_list (técnico)     -> ${fmt(lTec)}`)
  assert.ok(lTec.celdas <= N * LIGERAS_INFORMES + 100)
  assert.equal(lTec.r.total, N / 4)

  // 5) Búsqueda en el servidor: sigue leyendo solo lo liviano
  const busq = medir(env, () => env.ok('informes_list', { q: 'informe 1234', limit: 50 }, sa))
  t.diagnostic(`informes_list (búsqueda)    -> ${fmt(busq)}`)
  assert.ok(busq.celdas <= N * LIGERAS_INFORMES + 100)
  assert.ok(busq.r.total >= 1)

  // 6) Abrir un informe: lee la columna id y UNA fila completa (con firma y checklist)
  const get = medir(env, () => env.ok('informes_get', { id: 'i777' }, sa))
  t.diagnostic(`informes_get (superadmin)   -> ${fmt(get)}`)
  assert.equal(get.r.firma, firma)
  assert.ok(get.celdas <= N + COLS_INFORMES + 5)

  // i3: lo escribió diego, pero es de la visita v3 que agendó lucia -> el admin lo ve (consulta esa visita, no todas)
  const getAd = medir(env, () => env.ok('informes_get', { id: 'i3' }, admin.token))
  t.diagnostic(`informes_get (admin, de su visita) -> ${fmt(getAd)}`)
  assert.equal(getAd.r.autor, 'diego')
  assert.ok(getAd.celdas <= N + NV + COLS_INFORMES + COLS_VISITAS + 10)

  // i1: de marta y de una visita de marta -> lucia no debe verlo (y negarlo también es barato)
  const getNo = medir(env, () => env.llamar('informes_get', { id: 'i1' }, admin.token))
  t.diagnostic(`informes_get (admin, ajeno)      -> ${fmt(getNo)}`)
  assert.equal(getNo.r.ok, false)
  assert.ok(getNo.celdas <= N + NV + COLS_INFORMES + COLS_VISITAS + 10)

  // 7) Visitas: ventana de fechas
  const vis = medir(env, () => env.ok('visitas_list', { desde: '2026-01-01', limit: 200 }, admin.token))
  t.diagnostic(`visitas_list (ventana)      -> ${fmt(vis)} (${vis.r.items.length} de ${vis.r.total}, ${vis.r.antes} anteriores)`)
  assert.ok(vis.celdas <= NV * COLS_VISITAS)
  assert.ok(vis.r.items.length <= 200)
  assert.ok(vis.r.antes > 0)

  // 8) Modificar una visita: lee la columna id y una fila (no la hoja entera)
  const upd = medir(env, () => env.ok('visitas_update', { id: 'v3', data: { notas: 'nota' } }, admin.token))
  t.diagnostic(`visitas_update              -> ${fmt(upd)}`)
  assert.ok(upd.celdas <= NV + COLS_VISITAS + 10)

  // 9) Crear informe: el correlativo se calcula leyendo solo la columna numero
  const cre = medir(env, () => env.ok('informes_create', { data: { fecha: '2026-11-20', cliente: 'X', titulo: 'Nuevo', tipo: 'Otro', estado: 'Borrador', responsable: '', descripcion: '', checklist: '', firma: '', firmante: '', visitaId: '' } }, sa))
  t.diagnostic(`informes_create             -> ${fmt(cre)}`)
  assert.ok(cre.celdas <= N + 50)

  // 10) Fotos: se leen la columna visitaId y solo las filas de esa visita (no las miniaturas de las demás)
  const v = env.ok('visitas_create', { data: datosVisita() }, admin.token)
  env.ok('fotos_upload', { visitaId: v.id, imagen: JPEG_B64, mini: MINI }, admin.token)
  const fotos = env.hoja('Fotos')
  const miniPesada = 'data:image/jpeg;base64,' + 'A'.repeat(15000)
  for (let i = 0; i < NF; i++) fotos.filas.push([`f${i}`, `v${i % NV}`, `d${i}`, `foto${i}.jpg`, 'carlos', '2026-01-01T00:00:00', miniPesada])
  const fl = medir(env, () => env.ok('fotos_list', { visitaId: v.id }, admin.token))
  t.diagnostic(`fotos_list (1 visita)       -> ${fmt(fl)}`)
  assert.equal(fl.r.length, 1)
  assert.ok(fl.celdas <= NF + NV + COLS_VISITAS + 7 * 3 + 10, 'no debe leer las miniaturas de otras visitas')

  // 11) Login con la caché caliente: ninguna lectura de hojas
  const lg = medir(env, () => env.ok('login', { usuario: 'carlos', clave: 'Clave-Definitiva-77' }))
  t.diagnostic(`login                       -> ${fmt(lg)}`)
  assert.equal(lg.celdas, 0)
})

test('paginar recorriendo todo el listado nunca repite ni omite (20 mil informes)', () => {
  const e = entornoListo()
  sembrar(e)
  const vistos = new Set()
  let offset = 0
  let paginas = 0
  for (let hay = true; hay; paginas++) {
    const p = e.env.ok('informes_list', { limit: 100, offset }, e.sa)
    for (const i of p.items) {
      assert.ok(!vistos.has(i.id), `repetido: ${i.id}`)
      vistos.add(i.id)
    }
    offset += 100
    hay = p.hasMore
  }
  assert.equal(vistos.size, N)
  assert.equal(paginas, N / 100)
})
