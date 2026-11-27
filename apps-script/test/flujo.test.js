import { test } from 'node:test'
import assert from 'node:assert/strict'
import { datosUsuario, entornoListo, datosVisita, datosInforme, checklistCompleto, checklistIncompleto, JPEG_B64, MINI } from './ayudas.js'

const anio = new Date().getFullYear()

test('visibilidad de visitas: técnico asignado, administradores y superadmin', () => {
  const { env, sa, admin, admin2, tec, tec2 } = entornoListo()
  const v = env.ok('visitas_create', { data: datosVisita() }, admin.token)

  const ids = (token) => env.ok('visitas_list', {}, token).items.map((x) => x.id)
  assert.deepEqual(ids(admin.token), [v.id])
  assert.deepEqual(ids(tec.token), [v.id]) // carlos es el responsable
  assert.deepEqual(ids(sa), [v.id])
  assert.deepEqual(ids(admin2.token), [v.id]) // todos los administradores ven las visitas de la empresa
  assert.deepEqual(ids(tec2.token), []) // otro técnico no
})

test('solo se puede asignar a un usuario activo existente', () => {
  const { env, admin } = entornoListo()
  assert.match(env.llamar('visitas_create', { data: datosVisita({ responsable: 'inventado' }) }, admin.token).error, /Técnico inválido/)
  assert.equal(env.llamar('visitas_create', { data: datosVisita({ responsable: 'marta' }) }, admin.token).ok, true) // un admin también atiende visitas
})

test('el técnico no crea ni elimina visitas y solo cambia estado y notas', () => {
  const { env, admin, tec } = entornoListo()
  assert.equal(env.llamar('visitas_create', { data: datosVisita() }, tec.token).code, 'FORBIDDEN')

  const v = env.ok('visitas_create', { data: datosVisita() }, admin.token)
  assert.equal(env.llamar('visitas_delete', { id: v.id }, tec.token).code, 'FORBIDDEN')

  const r = env.ok('visitas_update', { id: v.id, data: { estado: 'Aceptada', cliente: 'Cambiado', responsable: 'diego', notas: 'ok' } }, tec.token)
  assert.equal(r.estado, 'Aceptada')
  assert.equal(r.notas, 'ok')
  assert.equal(r.cliente, 'Cliente A') // el resto de campos no se toca
  assert.equal(r.responsable, 'carlos')
})

test('flujo de estados del técnico y cancelación con motivo', () => {
  const { env, admin, tec } = entornoListo()
  const v = env.ok('visitas_create', { data: datosVisita() }, admin.token)
  const cambiar = (estado, extra = {}) => env.llamar('visitas_update', { id: v.id, data: { estado, ...extra } }, tec.token)

  assert.match(cambiar('En curso').error, /no permitido/) // no se puede saltar la aceptación
  assert.equal(cambiar('Aceptada').ok, true)
  assert.match(cambiar('Realizada').error, /no permitido/)
  assert.equal(cambiar('En curso').ok, true)
  assert.match(cambiar('Cancelada').error, /motivo/) // la cancelación exige motivo
  assert.equal(cambiar('Cancelada', { motivo: 'Cliente ausente' }).ok, true)
  assert.match(cambiar('Aceptada').error, /no permitido/) // cerrada para el técnico

  // el admin sí puede reabrirla
  assert.equal(env.llamar('visitas_update', { id: v.id, data: { estado: 'Programada' } }, admin.token).ok, true)
})

test('informes: el técnico necesita aceptar la visita; numeración correlativa', () => {
  const { env, admin, tec } = entornoListo()
  const v = env.ok('visitas_create', { data: datosVisita() }, admin.token)

  assert.match(env.llamar('informes_create', { data: datosInforme({ visitaId: v.id }) }, tec.token).error, /Acepta la visita/)
  env.ok('visitas_update', { id: v.id, data: { estado: 'Aceptada' } }, tec.token)

  const a = env.ok('informes_create', { data: datosInforme({ visitaId: v.id }) }, tec.token)
  const b = env.ok('informes_create', { data: datosInforme({ visitaId: v.id, titulo: 'Otro' }) }, tec.token)
  assert.equal(a.numero, `INF-${anio}-0001`)
  assert.equal(b.numero, `INF-${anio}-0002`)
  assert.equal(a.autor, 'carlos')
})

test('un técnico no puede crear informes de una visita que no es suya', () => {
  const { env, admin, tec2 } = entornoListo()
  const v = env.ok('visitas_create', { data: datosVisita() }, admin.token) // asignada a carlos
  assert.match(env.llamar('informes_create', { data: datosInforme({ visitaId: v.id }) }, tec2.token).error, /Visita no encontrada/)
})

test('listado de informes: livianos (sin descripción, checklist ni firma); get trae todo', () => {
  const { env, sa } = entornoListo()
  const firma = 'data:image/png;base64,' + 'A'.repeat(500)
  const inf = env.ok('informes_create', { data: datosInforme({ firma, checklist: checklistCompleto, firmante: 'María' }) }, sa)

  const item = env.ok('informes_list', {}, sa).items[0]
  assert.equal(item.id, inf.id)
  assert.equal(item.titulo, 'Informe de prueba')
  assert.equal(item.firmante, 'María')
  for (const pesado of ['firma', 'checklist', 'descripcion']) assert.equal(item[pesado], undefined, `${pesado} no debe venir en el listado`)

  const completo = env.ok('informes_get', { id: inf.id }, sa)
  assert.equal(completo.firma, firma)
  assert.equal(completo.checklist, checklistCompleto)
  assert.equal(completo.descripcion, 'Observaciones de prueba')
  assert.equal(completo._row, undefined) // nunca se expone el número de fila
})

test('finalizar exige checklist completo; luego queda cerrado salvo para un administrador', () => {
  const { env, sa, admin, tec } = entornoListo()
  const v = env.ok('visitas_create', { data: datosVisita() }, admin.token)
  env.ok('visitas_update', { id: v.id, data: { estado: 'Aceptada' } }, tec.token)

  assert.match(env.llamar('informes_create', { data: datosInforme({ visitaId: v.id, estado: 'Finalizado', checklist: checklistIncompleto }) }, tec.token).error, /cada actividad necesita/)
  const inf = env.ok('informes_create', { data: datosInforme({ visitaId: v.id, checklist: checklistIncompleto }) }, tec.token)
  assert.match(env.llamar('informes_update', { id: inf.id, data: { estado: 'Finalizado' } }, tec.token).error, /cada actividad necesita/)

  env.ok('informes_update', { id: inf.id, data: { estado: 'Finalizado', checklist: checklistCompleto } }, tec.token)

  // cerrado: ni su autor puede modificarlo o eliminarlo; un administrador sí
  assert.equal(env.llamar('informes_update', { id: inf.id, data: { titulo: 'x' } }, tec.token).code, 'FORBIDDEN')
  assert.equal(env.llamar('informes_delete', { id: inf.id }, tec.token).code, 'FORBIDDEN')
  assert.equal(env.llamar('informes_update', { id: inf.id, data: { titulo: 'Reabierto' } }, admin.token).ok, true)
})

test('el número y el vínculo con la visita no se pueden cambiar', () => {
  const { env, admin, tec } = entornoListo()
  const v = env.ok('visitas_create', { data: datosVisita() }, admin.token)
  env.ok('visitas_update', { id: v.id, data: { estado: 'Aceptada' } }, tec.token)
  const inf = env.ok('informes_create', { data: datosInforme({ visitaId: v.id }) }, tec.token)

  const r = env.ok('informes_update', { id: inf.id, data: { numero: 'INF-0000', visitaId: 'otra', titulo: 'Nuevo' } }, tec.token)
  assert.equal(r.numero, inf.numero)
  assert.equal(r.visitaId, v.id)
  assert.equal(r.titulo, 'Nuevo')
})

test('visibilidad de informes: autor, administradores y superadmin', () => {
  const { env, sa, admin, admin2, tec, tec2 } = entornoListo()
  const v = env.ok('visitas_create', { data: datosVisita() }, admin.token)
  env.ok('visitas_update', { id: v.id, data: { estado: 'Aceptada' } }, tec.token)
  const inf = env.ok('informes_create', { data: datosInforme({ visitaId: v.id }) }, tec.token)

  const ids = (token, p = {}) => env.ok('informes_list', p, token).items.map((x) => x.id)
  assert.deepEqual(ids(tec.token), [inf.id])
  assert.deepEqual(ids(admin.token), [inf.id])
  assert.deepEqual(ids(admin.token, { visitaId: v.id }), [inf.id])
  assert.deepEqual(ids(sa), [inf.id])
  assert.deepEqual(ids(admin2.token), [inf.id])
  assert.deepEqual(ids(tec2.token), [])
  assert.equal(env.llamar('informes_get', { id: inf.id }, tec2.token).ok, false)
  assert.equal(env.llamar('informes_get', { id: inf.id }, admin.token).ok, true)
})

test('paginación y filtros de informes', () => {
  const { env, sa } = entornoListo()
  const creados = []
  for (let i = 0; i < 25; i++) {
    creados.push(env.ok('informes_create', { data: datosInforme({ titulo: `Revisión ${String(i).padStart(2, '0')}`, fecha: `2026-10-${String(i + 1).padStart(2, '0')}`, estado: i % 5 === 0 ? 'En revisión' : 'Borrador', cliente: i < 3 ? 'Banco Norte' : 'Cliente A' }) }, sa))
  }

  // se recorre en páginas de 10: sin repetidos ni faltantes, y las más recientes primero
  let vistos = []
  for (let offset = 0, hay = true; hay; offset += 10) {
    const p = env.ok('informes_list', { limit: 10, offset }, sa)
    assert.equal(p.total, 25)
    vistos = vistos.concat(p.items.map((x) => x.id))
    hay = p.hasMore
    if (offset === 20) assert.equal(p.items.length, 5)
  }
  assert.equal(new Set(vistos).size, 25)
  const fechas = env.ok('informes_list', { limit: 100 }, sa).items.map((x) => x.fecha)
  assert.deepEqual(fechas, [...fechas].sort().reverse())

  assert.equal(env.ok('informes_list', { estado: 'En revisión' }, sa).total, 5)
  assert.equal(env.ok('informes_list', { q: 'banco' }, sa).total, 3) // sin distinguir mayúsculas
  assert.equal(env.ok('informes_list', { q: 'revisión 07' }, sa).total, 1)
  assert.equal(env.ok('informes_list', { q: 'INF-' + anio + '-0001' }, sa).total, 1) // también por número
  assert.equal(env.ok('informes_list', { limit: 100000 }, sa).items.length, 25) // el tope máximo se respeta
  assert.equal(env.ok('informes_list', { limit: 100000 }, sa).hasMore, false)
})

test('visitas por ventana de fechas, orden y "anteriores"', () => {
  const { env, admin } = entornoListo()
  for (const f of ['2026-09-01', '2026-10-10', '2026-11-05', '2026-11-20', '2026-12-24']) {
    env.ok('visitas_create', { data: datosVisita({ fecha: f }) }, admin.token)
  }
  const r = env.ok('visitas_list', { desde: '2026-11-01' }, admin.token)
  assert.deepEqual(r.items.map((v) => v.fecha), ['2026-11-05', '2026-11-20', '2026-12-24']) // cronológico
  assert.equal(r.antes, 2) // hay 2 anteriores sin cargar
  assert.equal(r.total, 3)

  const ant = env.ok('visitas_list', { hasta: '2026-10-31', orden: 'desc', limit: 1 }, admin.token)
  assert.deepEqual(ant.items.map((v) => v.fecha), ['2026-10-10']) // la más reciente anterior
  assert.equal(ant.hasMore, true)
  const ant2 = env.ok('visitas_list', { hasta: '2026-10-09', orden: 'desc', limit: 1 }, admin.token)
  assert.deepEqual(ant2.items.map((v) => v.fecha), ['2026-09-01'])
  assert.equal(ant2.hasMore, false)

  assert.equal(env.ok('visitas_list', { desde: '2026-11-20', hasta: '2026-11-20' }, admin.token).total, 1)
  assert.equal(env.ok('visitas_list', { desde: 'no-es-fecha' }, admin.token).total, 5) // parámetros inválidos se ignoran
})

test('fotos: reglas, estructura de carpetas en Drive, permisos y papelera', () => {
  const { env, admin, tec, tec2, sa } = entornoListo()
  const v = env.ok('visitas_create', { data: datosVisita({ cliente: 'Cliente Ñandú S.A.' }) }, admin.token)
  const subir = (token, extra = {}) => env.llamar('fotos_upload', { visitaId: v.id, imagen: JPEG_B64, mini: MINI, ...extra }, token)

  assert.match(subir(tec.token).error, /Acepta la visita/)
  env.ok('visitas_update', { id: v.id, data: { estado: 'Aceptada' } }, tec.token)
  assert.equal(subir(tec2.token).ok, false) // otro técnico no ve la visita

  assert.match(subir(tec.token, { imagen: 'iVBORw0KGgo=' }).error, /JPEG/)
  assert.match(subir(tec.token, { mini: 'data:image/png;base64,AAAA' }).error, /Miniatura/)
  assert.match(subir(tec.token, { imagen: '/9j/' + 'A'.repeat(5 * 1024 * 1024) }).error, /demasiado grande/)

  const f1 = env.ok('fotos_upload', { visitaId: v.id, imagen: JPEG_B64, mini: MINI }, tec.token)
  const f2 = env.ok('fotos_upload', { visitaId: v.id, imagen: JPEG_B64, mini: MINI }, admin.token)

  // Drive: Raíz / Nombre de la empresa / "NOMBRE (usuario)" / AAAA-MM / archivo
  assert.equal(env.drive.raices[0].nombre, 'ServiTec - Empresas')
  assert.equal(env.drive.raices[0].hijos.length, 1)
  const raiz = env.drive.raices[0].hijos[0]
  assert.equal(raiz.nombre, 'ServiTec')
  assert.deepEqual(raiz.hijos.map((c) => c.nombre).sort(), ['CARLOS PRUEBA (carlos)', 'LUCIA PRUEBA (lucia)'])
  const mes = raiz.hijos.find((c) => c.nombre === 'CARLOS PRUEBA (carlos)').hijos[0]
  assert.equal(mes.nombre, '2026-11')
  assert.match(mes.archivos[0].nombre, /^2026-11-20_Cliente-Nandu-S-A_[0-9a-f]{6}\.jpg$/)

  // listado con miniaturas y lectura completa (solo quien ve la visita)
  const lista = env.ok('fotos_list', { visitaId: v.id }, tec.token)
  assert.equal(lista.length, 2)
  assert.equal(lista[0].mini, MINI)
  assert.equal(lista[0].driveId, undefined) // el id de Drive no se expone
  assert.match(env.ok('fotos_get', { id: f1.id }, tec.token).dataUrl, /^data:image\/jpeg;base64,/)
  assert.equal(env.llamar('fotos_get', { id: f1.id }, tec2.token).ok, false)
  assert.equal(env.llamar('fotos_list', { visitaId: v.id }, tec2.token).ok, false)

  // borrar: quien la subió o un administrador
  assert.equal(env.llamar('fotos_delete', { id: f2.id }, tec.token).code, 'FORBIDDEN')
  assert.equal(env.llamar('fotos_delete', { id: f1.id }, tec.token).ok, true)
  assert.equal(mes.archivos[0].papelera, true)
  assert.equal(env.ok('fotos_list', { visitaId: v.id }, sa).length, 1)

  // al eliminar la visita, las fotos que quedan van a la papelera y se borran sus registros
  env.ok('visitas_delete', { id: v.id }, admin.token)
  assert.equal([...env.drive.archivos.values()].every((a) => a.papelera), true)
  assert.equal(env.hoja('Fotos').filas.length, 1) // solo el encabezado
})

test('máximo 25 fotos por visita', () => {
  const { env, admin } = entornoListo()
  const v = env.ok('visitas_create', { data: datosVisita() }, admin.token)
  for (let i = 0; i < 25; i++) env.ok('fotos_upload', { visitaId: v.id, imagen: JPEG_B64, mini: MINI }, admin.token)
  assert.match(env.llamar('fotos_upload', { visitaId: v.id, imagen: JPEG_B64, mini: MINI }, admin.token).error, /Máximo 25/)
})

test('rechaza acciones inválidas y sesiones sin token', () => {
  const e = entornoListo()
  const { env } = e
  assert.equal(env.llamar('visitas_list', {}).code, 'AUTH')
  assert.equal(env.llamar('visitas_list', {}, 'token-falso').code, 'AUTH')
  assert.match(env.llamar('accion_inventada', {}, e.sa).error, /Acción inválida/)
})

test('el técnico no gestiona usuarios y nadie crea otros roles', () => {
  const { env, admin, tec } = entornoListo()
  assert.equal(env.llamar('usuarios_list', {}, tec.token).code, 'FORBIDDEN')
  assert.equal(env.llamar('usuarios_create', { data: datosUsuario('zzz', 'admin', 40) }, tec.token).code, 'FORBIDDEN')
  for (const rol of ['superadmin', 'root']) assert.match(env.llamar('usuarios_create', { data: datosUsuario('zzz', rol, 40) }, admin.token).error, /rol|Solo puedes/)
})

test('los usuarios se sirven desde caché y la caché se invalida al modificarlos', () => {
  const { env, sa, tec } = entornoListo()
  env.ok('me', {}, tec.token) // calienta la caché
  env.reiniciarStats()
  env.ok('me', {}, tec.token)
  env.ok('visitas_list', {}, tec.token)
  const leidas = env.stats.celdasLeidas
  assert.ok(leidas <= 14, `no debe releer la hoja Usuarios (leyó ${leidas} celdas)`) // solo lo mínimo de Visitas (hoja vacía = 0)

  // al desactivar a un usuario el cambio rige de inmediato, aunque estuviera en caché
  const lista = env.ok('usuarios_list', {}, sa)
  env.ok('usuarios_update', { id: lista.find((u) => u.usuario === 'carlos').id, data: { activo: false } }, sa)
  assert.equal(env.llamar('me', {}, tec.token).code, 'AUTH')
})

test('actividades: se finaliza con No cumple o Falla sin observación aparte, pero no sin descripción', () => {
  const { env, tec } = entornoListo()
  const crear = (items) => env.llamar('informes_create', { data: datosInforme({ estado: 'Finalizado', checklist: JSON.stringify(items) }) }, tec.token)
  assert.equal(crear([{ item: 'Cambié el disco', resultado: 'no', obs: '' }, { item: 'Revisé el cableado', resultado: 'falla', obs: '' }]).ok, true)
  assert.match(crear([{ item: '   ', resultado: 'ok', obs: '' }]).error, /cada actividad necesita/)
})

test('no se finaliza un informe sin actividades; los antiguos ya finalizados se pueden seguir corrigiendo', () => {
  const { env, admin, tec } = entornoListo()
  for (const checklist of ['', '[]']) {
    assert.match(env.llamar('informes_create', { data: datosInforme({ estado: 'Finalizado', checklist }) }, tec.token).error, /al menos una actividad/)
    const borrador = env.ok('informes_create', { data: datosInforme({ checklist }) }, tec.token) // en borrador sí se guarda
    assert.match(env.llamar('informes_update', { id: borrador.id, data: { estado: 'Finalizado' } }, tec.token).error, /al menos una actividad/)
  }

  // a un finalizado con actividades no se le pueden quitar todas
  const completo = env.ok('informes_create', { data: datosInforme({ estado: 'Finalizado', checklist: checklistCompleto }) }, tec.token)
  assert.match(env.llamar('informes_update', { id: completo.id, data: { checklist: '' } }, admin.token).error, /al menos una actividad/)

  // informe finalizado sin actividades guardado antes de la regla: se simula vaciando su celda en la hoja
  const hoja = env.hoja('Informes')
  const columna = (nombre) => hoja.filas[0].indexOf(nombre)
  hoja.filas.find((f) => f[columna('id')] === completo.id)[columna('checklist')] = ''
  assert.equal(env.llamar('informes_update', { id: completo.id, data: { titulo: 'Corregido' } }, admin.token).ok, true)
})
