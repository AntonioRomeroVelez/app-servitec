import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearEntorno, CLAVE_INICIAL } from './harness.js'
import { conEmpresa, datosUsuario, entornoListo, datosVisita, datosInforme, checklistCompleto, JPEG_B64, MINI } from './ayudas.js'

const esFecha = (v) => Object.prototype.toString.call(v) === '[object Date]' // las fechas se crean dentro del simulador
const dd = (n) => String(n).padStart(2, '0')

const bitacora = (env) => {
  const hoja = env.hoja('Bitácora')
  return hoja.filas.slice(1).map((f) => Object.fromEntries(env.tablas.BITACORA.headers.map((h, i) => [h, f[i]])))
}
const ultima = (env, accion) => bitacora(env).filter((r) => r.accion === accion).pop()

test('cada acción deja en la bitácora quién, cuándo (fecha y hora legibles), qué y sobre qué', () => {
  const { env, admin } = entornoListo()
  const v = env.ok('visitas_create', { data: datosVisita({ cliente: 'Banco del Sur' }) }, admin.token)

  const r = ultima(env, 'Visita creada')
  assert.equal(r.usuario, 'lucia')
  assert.equal(r.rol, 'admin')
  assert.match(r.detalle, /Banco del Sur \(20-11-2026 09:00\)/)
  assert.equal(r.ref, `visita:${v.id}`)

  // fecha real (se puede ordenar y filtrar) con formato 19-11-2026; hora como texto 14:13
  const hoy = new Date()
  assert.ok(esFecha(r.fecha))
  assert.deepEqual([r.fecha.getFullYear(), r.fecha.getMonth(), r.fecha.getDate()], [hoy.getFullYear(), hoy.getMonth(), hoy.getDate()])
  assert.match(r.hora, /^\d{2}:\d{2}$/)
  assert.equal(env.hoja('Bitácora').formatos[1], 'dd-MM-yyyy')
  assert.equal(env.hoja('Bitácora').formatos[2], '@') // la hora se guarda como texto para que Sheets no la convierta
})

test('los cambios se registran con el antes y el después', () => {
  const { env, admin, tec } = entornoListo()
  const v = env.ok('visitas_create', { data: datosVisita({ cliente: 'Clínica Norte' }) }, admin.token)

  env.ok('visitas_update', { id: v.id, data: { estado: 'Aceptada' } }, tec.token)
  let r = ultima(env, 'Visita modificada')
  assert.equal(r.usuario, 'carlos')
  assert.equal(r.rol, 'tecnico')
  assert.match(r.detalle, /Estado: de Programada a Aceptada/)

  env.ok('visitas_update', { id: v.id, data: { hora: '15:30', fecha: '2026-12-01' } }, admin.token)
  r = ultima(env, 'Visita modificada')
  assert.equal(r.usuario, 'lucia')
  assert.match(r.detalle, /Fecha: de 20-11-2026 a 01-12-2026/) // las fechas se muestran como 19-11-2026
  assert.match(r.detalle, /Hora: de 09:00 a 15:30/)

  env.ok('visitas_update', { id: v.id, data: {} }, admin.token)
  assert.match(ultima(env, 'Visita modificada').detalle, /sin cambios/)
})

test('informes: creado, finalizado, modificado y eliminado', () => {
  const { env, sa, admin, tec } = entornoListo()
  const v = env.ok('visitas_create', { data: datosVisita() }, admin.token)
  env.ok('visitas_update', { id: v.id, data: { estado: 'Aceptada' } }, tec.token)

  const inf = env.ok('informes_create', { data: datosInforme({ visitaId: v.id, checklist: checklistCompleto }) }, tec.token)
  assert.equal(ultima(env, 'Informe creado').usuario, 'carlos')
  assert.match(ultima(env, 'Informe creado').detalle, new RegExp(inf.numero))

  env.ok('informes_update', { id: inf.id, data: { descripcion: 'Texto nuevo', estado: 'Finalizado' } }, tec.token)
  const fin = ultima(env, 'Informe finalizado')
  assert.equal(fin.usuario, 'carlos')
  assert.match(fin.detalle, /Estado: de Borrador a Finalizado/)
  assert.match(fin.detalle, /Cambió: observaciones/) // los campos largos no se copian: solo se indica que cambiaron
  assert.ok(!fin.detalle.includes('Texto nuevo'))

  env.ok('informes_update', { id: inf.id, data: { titulo: 'Reabierto' } }, sa)
  assert.equal(ultima(env, 'Informe modificado').usuario, 'dueno')
  env.ok('informes_delete', { id: inf.id }, sa)
  assert.equal(ultima(env, 'Informe eliminado').rol, 'admin')
})

test('fotos y clientes también quedan registrados', () => {
  const { env, sa, admin } = entornoListo()
  const v = env.ok('visitas_create', { data: datosVisita({ cliente: 'Hotel Sol' }) }, admin.token)
  assert.equal(ultima(env, 'Cliente registrado').usuario, 'lucia') // el cliente se registró solo al agendar
  assert.match(ultima(env, 'Cliente registrado').detalle, /Hotel Sol/)

  const f = env.ok('fotos_upload', { visitaId: v.id, imagen: JPEG_B64, mini: MINI }, admin.token)
  assert.equal(ultima(env, 'Foto subida').usuario, 'lucia')
  env.ok('fotos_delete', { id: f.id }, admin.token)
  assert.equal(ultima(env, 'Foto eliminada').usuario, 'lucia')

  const c = env.ok('clientes_create', { data: { nombre: 'Cliente Manual', telefono: '099' } }, admin.token)
  assert.equal(ultima(env, 'Cliente creado').detalle, 'Cliente Manual')
  env.ok('clientes_update', { id: c.id, data: { telefono: '098', direccion: 'Calle 1' } }, admin.token)
  assert.match(ultima(env, 'Cliente modificado').detalle, /Teléfono: de 099 a 098/)
  assert.match(ultima(env, 'Cliente modificado').detalle, /Dirección: de — a Calle 1/)
  env.ok('clientes_delete', { id: c.id }, sa)
  assert.equal(ultima(env, 'Cliente eliminado').usuario, 'dueno')
})

test('sesión y usuarios: ingresos, cambios de clave, altas y bloqueos (sin llenar la bitácora de intentos fallidos)', () => {
  const { env, sa } = conEmpresa(crearEntorno())
  assert.equal(ultima(env, 'Superadministrador creado').usuario, 'superadmin') // el root
  assert.equal(ultima(env, 'Inicio de sesión').usuario, 'dueno')
  assert.equal(ultima(env, 'Cambio de clave').usuario, 'dueno')
  const raiz = env.principal.getSheetByName('Bitácora').filas.map((f) => f[4])
  assert.ok(raiz.includes('Usuario inicial creado')) // lo que no es de ninguna empresa queda en la hoja principal

  const u = env.ok('usuarios_create', { data: datosUsuario('ana', 'tecnico', 20) }, sa)
  assert.match(ultima(env, 'Usuario creado').detalle, /ana \(tecnico\)/)

  env.ok('usuarios_update', { id: u.id, data: { activo: false, rol: 'admin' } }, sa)
  assert.match(ultima(env, 'Usuario modificado').detalle, /Rol: de tecnico a admin; Desactivado/)
  env.ok('usuarios_update', { id: u.id, data: { clave: 'Restablecida-88' } }, sa)
  assert.equal(ultima(env, 'Clave restablecida').usuario, 'dueno')

  // los intentos fallidos NO se registran uno a uno (cualquiera podría llenar la hoja); solo el bloqueo, una vez
  const antes = bitacora(env).length
  for (let i = 0; i < 4; i++) env.llamar('login', { usuario: 'ana', clave: 'mala' })
  assert.equal(bitacora(env).length, antes)
  env.llamar('login', { usuario: 'ana', clave: 'mala' }) // 5.º intento: se bloquea
  env.llamar('login', { usuario: 'ana', clave: 'mala' }) // ya bloqueado: no se vuelve a registrar
  assert.equal(bitacora(env).filter((r) => r.accion === 'Bloqueo por intentos fallidos').length, 1)
  assert.equal(ultima(env, 'Bloqueo por intentos fallidos').usuario, 'ana')
})

test('cada registro guarda quién lo creó y quién lo modificó por última vez', () => {
  const { env, admin, tec } = entornoListo()
  const v = env.ok('visitas_create', { data: datosVisita() }, admin.token)
  const fila = () => Object.fromEntries(env.tablas.VISITAS.headers.map((h, i) => [h, env.hoja('Visitas').filas[1][i]]))

  assert.equal(fila().autor, 'lucia')
  assert.equal(fila().modificadoPor, 'lucia')
  env.ok('visitas_update', { id: v.id, data: { estado: 'Aceptada' } }, tec.token)
  assert.equal(fila().autor, 'lucia') // quien la agendó no cambia
  assert.equal(fila().modificadoPor, 'carlos') // quien la tocó por última vez

  const leida = env.ok('visitas_get', { id: v.id }, admin.token)
  assert.equal(leida.modificadoPor, 'carlos')
})

test('las fechas se guardan como fechas reales con formato legible y la API las sigue entregando igual', () => {
  const { env, admin } = entornoListo()
  const v = env.ok('visitas_create', { data: datosVisita({ fecha: '2026-11-20' }) }, admin.token)
  const h = env.tablas.VISITAS.headers
  const fila = env.hoja('Visitas').filas[1]

  // en la hoja: fecha real a medianoche local, y creado/actualizado como fecha y hora reales
  assert.ok(esFecha(fila[h.indexOf('fecha')]))
  const f = fila[h.indexOf('fecha')]
  assert.deepEqual([f.getFullYear(), f.getMonth() + 1, f.getDate()], [2026, 11, 20])
  assert.ok(esFecha(fila[h.indexOf('creado')]))
  assert.ok(esFecha(fila[h.indexOf('actualizado')]))
  assert.equal(fila[h.indexOf('hora')], '09:00') // la hora de la visita sigue siendo texto HH:mm

  // formatos de columna: 19-11-2026 y 19-11-2026 14:13
  const formatos = env.hoja('Visitas').formatos
  assert.equal(formatos[h.indexOf('fecha') + 1], 'dd-MM-yyyy')
  assert.equal(formatos[h.indexOf('creado') + 1], 'dd-MM-yyyy HH:mm')
  assert.equal(formatos[h.indexOf('actualizado') + 1], 'dd-MM-yyyy HH:mm')
  assert.equal(env.zona.tz, 'America/Guayaquil') // la hoja usa la misma zona horaria que el script

  // por la API todo sigue igual que antes (la app no cambia)
  assert.equal(v.fecha, '2026-11-20')
  const leida = env.ok('visitas_list', {}, admin.token).items[0]
  assert.equal(leida.fecha, '2026-11-20')
  assert.match(leida.creado, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
  assert.equal(env.ok('visitas_list', { desde: '2026-11-20', hasta: '2026-11-20' }, admin.token).total, 1)
})

test('aplicarFormatos convierte el texto que ya hubiera en fechas reales y no rompe la lectura', () => {
  const { env, admin } = entornoListo()
  env.ok('visitas_create', { data: datosVisita() }, admin.token)
  const h = env.tablas.VISITAS.headers
  const fila = env.hoja('Visitas').filas[1]
  fila[h.indexOf('fecha')] = '2026-11-20' // como lo dejaba la versión anterior: texto
  fila[h.indexOf('creado')] = '2026-11-19T19:13:00.000Z'
  assert.ok(!esFecha(fila[h.indexOf('fecha')]))

  env.ejecutar('aplicarFormatos')
  assert.ok(esFecha(fila[h.indexOf('fecha')]))
  assert.ok(esFecha(fila[h.indexOf('creado')]))
  assert.equal(env.ok('visitas_list', {}, admin.token).items[0].fecha, '2026-11-20')
  assert.ok(env.logs.some((l) => /Formatos de fecha aplicados/.test(l)))
})

test('los triggers del sistema también dejan registro', () => {
  const { env, admin } = entornoListo()
  const d = new Date()
  d.setDate(d.getDate() + 1)
  const manana = `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`
  env.ok('visitas_create', { data: datosVisita({ fecha: manana }) }, admin.token)
  env.ejecutar('enviarRecordatorios')
  const r = ultima(env, 'Recordatorios enviados')
  assert.equal(r.usuario, 'Sistema')
  assert.match(r.detalle, /1 visita\(s\)/)

  env.hoja('Notificaciones').filas.splice(1, 0, ['v1', 'carlos', 'x', 'Vieja', 'm', '', new Date(Date.now() - 90 * 86400000).toISOString(), true])
  env.ejecutar('limpiarNotificaciones')
  assert.equal(ultima(env, 'Avisos antiguos eliminados').usuario, 'Sistema')
})
