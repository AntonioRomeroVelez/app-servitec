import { test } from 'node:test'
import assert from 'node:assert/strict'
import { datosUsuario, entornoListo, datosVisita, datosInforme, checklistCompleto, JPEG_B64, MINI } from './ayudas.js'

const hoyMas = (dias) => {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Entorno con correo en los usuarios que lo necesitan
function conCorreos() {
  const e = entornoListo()
  const lista = e.env.ok('usuarios_list', {}, e.sa)
  const idDe = (u) => lista.find((x) => x.usuario === u).id
  for (const [usuario, correo] of [['carlos', 'carlos@ferisel.test'], ['lucia', 'lucia@ferisel.test'], ['diego', 'diego@ferisel.test']]) {
    e.env.ok('usuarios_update', { id: idDe(usuario), data: { correo } }, e.sa)
  }
  return e
}

const avisos = (env, quien) => env.ok('notificaciones_list', {}, quien.token)

test('al asignar una visita el técnico recibe aviso en la app y por correo; quien la agenda no', () => {
  const { env, admin, tec } = conCorreos()
  const v = env.ok('visitas_create', { data: datosVisita({ cliente: 'Banco del Sur' }) }, admin.token)

  const t = avisos(env, tec)
  assert.equal(t.noLeidas, 1)
  assert.equal(t.items[0].tipo, 'visita_asignada')
  assert.equal(t.items[0].titulo, 'Nueva visita asignada')
  assert.match(t.items[0].mensaje, /Banco del Sur/)
  assert.match(t.items[0].mensaje, /20-11-2026 09:00/)
  assert.equal(t.items[0].ref, `visita:${v.id}`)
  assert.equal(t.items[0].leida, false)
  assert.equal(avisos(env, admin).noLeidas, 0) // el autor de la acción no se avisa a sí mismo

  assert.equal(env.correos.length, 1)
  assert.equal(env.correos[0].to, 'carlos@ferisel.test')
  assert.equal(env.correos[0].subject, '[ServiTec] Nueva visita asignada')
  assert.match(env.correos[0].htmlBody, /Banco del Sur/)
  assert.match(env.correos[0].htmlBody, /ServiTec/)
  assert.equal(env.correos[0].conLock, false) // se envió con el lock ya liberado
})

test('sin correo registrado solo hay aviso en la app', () => {
  const { env, admin, tec } = entornoListo() // nadie tiene correo
  env.ok('visitas_create', { data: datosVisita() }, admin.token)
  assert.equal(avisos(env, tec).noLeidas, 1)
  assert.equal(env.correos.length, 0)
})

test('el técnico acepta, rechaza o finaliza: el admin que agendó recibe el aviso', () => {
  const { env, admin, tec } = conCorreos()
  const v1 = env.ok('visitas_create', { data: datosVisita({ cliente: 'Cliente Uno' }) }, admin.token)
  const v2 = env.ok('visitas_create', { data: datosVisita({ cliente: 'Cliente Dos' }) }, admin.token)

  env.ok('visitas_update', { id: v1.id, data: { estado: 'Aceptada' } }, tec.token)
  env.ok('visitas_update', { id: v2.id, data: { estado: 'Cancelada', motivo: 'Cliente ausente' } }, tec.token)
  env.ok('visitas_update', { id: v1.id, data: { estado: 'En curso' } }, tec.token)
  env.ok('visitas_update', { id: v1.id, data: { estado: 'Realizada' } }, tec.token)

  const titulos = avisos(env, admin).items.map((i) => i.titulo)
  assert.deepEqual(titulos.sort(), ['Visita aceptada', 'Visita en curso', 'Visita realizada', 'Visita rechazada'].sort())
  const rechazo = avisos(env, admin).items.find((i) => i.titulo === 'Visita rechazada')
  assert.match(rechazo.mensaje, /Motivo: Cliente ausente/)
  assert.match(rechazo.mensaje, /CARLOS/) // nombre del técnico
  assert.equal(env.correos.filter((c) => c.to === 'lucia@ferisel.test').length, 4)
})

test('cancelación, reasignación y reprogramación por el admin avisan al técnico correspondiente', () => {
  const { env, admin, tec, tec2 } = conCorreos()
  const v = env.ok('visitas_create', { data: datosVisita({ cliente: 'Cliente Tres' }) }, admin.token)
  const nuevos = (q) => avisos(env, q).items.map((i) => i.titulo)

  env.ok('visitas_update', { id: v.id, data: { hora: '15:30' } }, admin.token)
  assert.ok(nuevos(tec).includes('Visita reprogramada'))
  assert.match(avisos(env, tec).items.find((i) => i.tipo === 'visita_reprogramada').mensaje, /15:30/)

  env.ok('visitas_update', { id: v.id, data: { responsable: 'diego' } }, admin.token)
  assert.ok(nuevos(tec).includes('Visita reasignada')) // el anterior se entera
  assert.ok(nuevos(tec2).includes('Nueva visita asignada')) // el nuevo recibe la visita

  env.ok('visitas_update', { id: v.id, data: { estado: 'Cancelada', motivo: 'El cliente la pospuso' } }, admin.token)
  const cancel = avisos(env, tec2).items.find((i) => i.tipo === 'visita_cancelada')
  assert.match(cancel.mensaje, /El cliente la pospuso/)
  assert.equal(nuevos(tec).includes('Visita cancelada'), false) // carlos ya no tenía la visita
})

test('informe finalizado: avisa al admin que agendó la visita', () => {
  const { env, sa, admin, tec } = conCorreos()
  const v = env.ok('visitas_create', { data: datosVisita() }, admin.token)
  env.ok('visitas_update', { id: v.id, data: { estado: 'Aceptada' } }, tec.token)
  const inf = env.ok('informes_create', { data: datosInforme({ visitaId: v.id, checklist: checklistCompleto }) }, tec.token)
  const antes = avisos(env, admin).items.filter((i) => i.tipo === 'informe_finalizado').length
  assert.equal(antes, 0) // en borrador no avisa

  env.ok('informes_update', { id: inf.id, data: { estado: 'Finalizado' } }, tec.token)
  const a = avisos(env, admin).items.find((i) => i.tipo === 'informe_finalizado')
  assert.match(a.mensaje, new RegExp(inf.numero))
  assert.equal(a.ref, `informe:${inf.id}`)

  // volver a guardar un informe ya finalizado (solo el superadmin puede) no repite el aviso
  env.ok('informes_update', { id: inf.id, data: { titulo: 'Otro título' } }, sa)
  assert.equal(avisos(env, admin).items.filter((i) => i.tipo === 'informe_finalizado').length, 1)
})

test('marcar como leídas: por id, todas, y cada usuario solo ve las suyas', () => {
  const { env, admin, tec, tec2 } = conCorreos()
  for (let i = 0; i < 3; i++) env.ok('visitas_create', { data: datosVisita({ cliente: `C${i}` }) }, admin.token)
  env.ok('visitas_create', { data: datosVisita({ responsable: 'diego' }) }, admin.token)

  assert.equal(env.ok('notificaciones_list', { resumen: true }, tec.token).noLeidas, 3)
  assert.equal(env.ok('notificaciones_list', { resumen: true }, tec.token).items, undefined) // el resumen es liviano
  assert.equal(avisos(env, tec2).noLeidas, 1)

  const primero = avisos(env, tec).items[0]
  env.ok('notificaciones_leer', { ids: [primero.id] }, tec.token)
  assert.equal(avisos(env, tec).noLeidas, 2)

  // no se puede marcar la de otro usuario
  env.ok('notificaciones_leer', { ids: [avisos(env, tec2).items[0].id] }, tec.token)
  assert.equal(avisos(env, tec2).noLeidas, 1)

  env.ok('notificaciones_leer', { todas: true }, tec.token)
  assert.equal(avisos(env, tec).noLeidas, 0)
  assert.equal(avisos(env, tec).items.length, 3) // siguen en la lista, ya leídas
  assert.equal(avisos(env, tec2).noLeidas, 1)
})

test('un fallo o falta de cuota de correo no rompe la operación ni los avisos en la app', () => {
  const { env, admin, tec } = conCorreos()
  env.config.fallaCorreo = true
  const v = env.llamar('visitas_create', { data: datosVisita() }, admin.token)
  assert.equal(v.ok, true)
  assert.equal(avisos(env, tec).noLeidas, 1)

  env.config.fallaCorreo = false
  env.config.cuotaCorreo = 0
  assert.equal(env.llamar('visitas_create', { data: datosVisita() }, admin.token).ok, true)
  assert.equal(env.correos.length, 0)
  assert.equal(avisos(env, tec).noLeidas, 2)
})

test('correo de usuario: se valida, se puede quitar y nunca se expone a otros roles', () => {
  const { env, sa, admin } = entornoListo()
  assert.match(env.llamar('usuarios_create', { data: datosUsuario('rosa', 'tecnico', 30, { correo: 'no-es-correo' }) }, sa).error, /correo no es válido/)
  const u = env.ok('usuarios_create', { data: datosUsuario('rosa', 'tecnico', 30, { correo: ' rosa@ferisel.test ' }) }, sa)
  assert.equal(u.correo, 'rosa@ferisel.test')

  assert.match(env.llamar('usuarios_update', { id: u.id, data: { correo: 'x@' } }, sa).error, /Correo inválido/)
  assert.equal(env.ok('usuarios_update', { id: u.id, data: { correo: '' } }, sa).correo, '')

  for (const t of env.ok('tecnicos_list', {}, admin.token)) assert.equal(t.correo, undefined) // el selector de técnicos no trae correos
})

test('recordatorios: visitas de mañana al técnico y al admin si quedó sin técnico', () => {
  const { env, admin, tec, tec2 } = conCorreos()
  const manana = hoyMas(1)
  env.ok('visitas_create', { data: datosVisita({ fecha: manana, hora: '10:00', cliente: 'Cliente B', estado: 'Programada' }) }, admin.token)
  env.ok('visitas_create', { data: datosVisita({ fecha: manana, hora: '08:30', cliente: 'Cliente A' }) }, admin.token)
  env.ok('visitas_create', { data: datosVisita({ fecha: manana, cliente: 'Sin técnico', responsable: '' }) }, admin.token)
  env.ok('visitas_create', { data: datosVisita({ fecha: manana, cliente: 'Cancelada', responsable: 'diego', estado: 'Programada' }) }, admin.token)
  const cancelada = env.ok('visitas_list', {}, admin.token).items.find((v) => v.cliente === 'Cancelada')
  env.ok('visitas_update', { id: cancelada.id, data: { estado: 'Cancelada', motivo: 'x' } }, admin.token)
  env.ok('visitas_create', { data: datosVisita({ fecha: hoyMas(2), cliente: 'Pasado mañana' }) }, admin.token)

  env.correos.length = 0
  env.ejecutar('enviarRecordatorios')

  const r = avisos(env, tec).items.find((i) => i.tipo === 'recordatorio')
  assert.equal(r.titulo, 'Mañana tienes 2 visitas')
  assert.deepEqual(r.mensaje.split('\n').map((l) => l.split(' · ')[1]), ['Cliente A', 'Cliente B']) // ordenadas por hora
  assert.match(r.mensaje, /sin aceptar/)
  assert.equal(avisos(env, tec2).items.filter((i) => i.tipo === 'recordatorio').length, 0) // su única visita está cancelada

  const sinTec = avisos(env, admin).items.find((i) => i.tipo === 'recordatorio')
  assert.equal(sinTec.titulo, 'Visitas de mañana sin técnico')
  assert.match(sinTec.mensaje, /Sin técnico/)

  assert.deepEqual(env.correos.map((c) => c.to).sort(), ['carlos@ferisel.test', 'lucia@ferisel.test'])
  assert.equal(env.correos.every((c) => c.conLock === false), true)
})

test('sin visitas mañana no hay recordatorios', () => {
  const { env, admin, tec } = conCorreos()
  env.ok('visitas_create', { data: datosVisita({ fecha: hoyMas(5) }) }, admin.token)
  env.correos.length = 0
  env.ejecutar('enviarRecordatorios')
  assert.equal(avisos(env, tec).items.filter((i) => i.tipo === 'recordatorio').length, 0)
  assert.equal(env.correos.length, 0)
})

test('limpieza diaria: borra avisos de más de 60 días y conserva los recientes', () => {
  const { env, admin, tec } = conCorreos()
  env.ok('visitas_create', { data: datosVisita() }, admin.token) // 1 aviso reciente
  const hoja = env.hoja('Notificaciones')
  const vieja = new Date(Date.now() - 90 * 86400000).toISOString()
  hoja.filas.splice(1, 0, ['v1', 'carlos', 'x', 'Vieja', 'm', '', vieja, true], ['v2', 'carlos', 'x', 'Vieja 2', 'm', '', vieja, true])
  assert.equal(hoja.filas.length, 4)
  env.ejecutar('limpiarNotificaciones')
  assert.equal(hoja.filas.length, 2)
  assert.equal(avisos(env, tec).items.length, 1)
})

test('instalarTriggers crea los dos triggers y repetirlo no los duplica', () => {
  const { env } = entornoListo()
  env.ejecutar('instalarTriggers')
  env.ejecutar('instalarTriggers')
  assert.deepEqual(env.triggers.map((t) => [t.fn, t.hora]).sort(), [['enviarRecordatorios', 18], ['limpiarNotificaciones', 3]])
})

// ---------- Idempotencia: ids generados por el cliente (base del modo sin conexión) ----------

test('crear con id del cliente es idempotente: repetir devuelve el mismo registro, sin duplicar', () => {
  const { env, admin, tec } = entornoListo()
  const idV = crypto.randomUUID()
  const a = env.ok('visitas_create', { data: datosVisita({ id: idV }) }, admin.token)
  const b = env.ok('visitas_create', { data: datosVisita({ id: idV, cliente: 'Otro nombre' }) }, admin.token)
  assert.equal(a.id, idV)
  assert.equal(b.id, idV)
  assert.equal(b.cliente, 'Cliente A') // no se modifica
  assert.equal(env.ok('visitas_list', {}, admin.token).total, 1)

  env.ok('visitas_update', { id: idV, data: { estado: 'Aceptada' } }, tec.token)
  const idI = crypto.randomUUID()
  const i1 = env.ok('informes_create', { data: datosInforme({ id: idI, visitaId: idV }) }, tec.token)
  const i2 = env.ok('informes_create', { data: datosInforme({ id: idI, visitaId: idV }) }, tec.token)
  assert.equal(i1.numero, i2.numero) // mismo correlativo: no se consume otro
  assert.equal(env.ok('informes_list', {}, tec.token).total, 1)

  const idF = crypto.randomUUID()
  env.ok('fotos_upload', { id: idF, visitaId: idV, imagen: JPEG_B64, mini: MINI }, tec.token)
  const f2 = env.ok('fotos_upload', { id: idF, visitaId: idV, imagen: JPEG_B64, mini: MINI }, tec.token)
  assert.equal(f2.id, idF)
  assert.equal(env.ok('fotos_list', { visitaId: idV }, tec.token).length, 1)
  assert.equal(env.drive.archivos.size, 1) // un solo archivo en Drive
})

test('un id del cliente ya usado por otro usuario se rechaza, y uno inválido se ignora', () => {
  const { env, admin, admin2 } = entornoListo()
  const id = crypto.randomUUID()
  env.ok('visitas_create', { data: datosVisita({ id }) }, admin.token)
  assert.match(env.llamar('visitas_create', { data: datosVisita({ id }) }, admin2.token).error, /Identificador en uso/)

  const v = env.ok('visitas_create', { data: datosVisita({ id: 'no-es-uuid' }) }, admin.token)
  assert.notEqual(v.id, 'no-es-uuid')
  assert.match(v.id, /^[0-9a-f-]{36}$/)
})
