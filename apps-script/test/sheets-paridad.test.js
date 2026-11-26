// El backend de Google Sheets cumple lo que la app usa: datos de personas, quién creó cada cosa, permisos y el inicio.
import test from 'node:test'
import assert from 'node:assert/strict'
import { crearEntorno, CLAVE_INICIAL } from './harness.js'
import { entornoListo, datosVisita, datosInforme, datosUsuario, cedulaDe } from './ayudas.js'
import { cedulaValida, generarUsuario } from '../../src/utils.js'

const filas = (env, hoja) => {
  const [cabecera, ...resto] = env.hoja(hoja).filas
  return resto.map((f) => Object.fromEntries(cabecera.map((h, i) => [h, f[i]])))
}
const usuarioEnHoja = (env, usuario) => filas(env, 'Usuarios').find((u) => u.usuario === usuario)
const dia = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test('la hoja Usuarios guarda los datos de la persona y quién la creó y modificó', () => {
  const { env, sa, admin } = entornoListo()
  const datos = datosUsuario('rosa', 'tecnico', 50, { direccion: 'Av. Uno', cargo: 'Instaladora' })
  assert.ok(cedulaValida(datos.cedula))
  const u = env.ok('usuarios_create', { data: datos }, admin.token)
  let fila = usuarioEnHoja(env, 'rosa')
  for (const c of ['nombre', 'cedula', 'correo', 'telefono', 'ciudad', 'direccion', 'cargo']) assert.equal(fila[c], datos[c], c)
  assert.equal(fila.cedula[0], '0') // se conserva el cero inicial
  assert.equal(fila.autor, 'lucia')
  assert.equal(fila.modificadoPor, 'lucia')
  assert.ok(fila.creado && fila.actualizado)

  env.ok('usuarios_update', { id: u.id, data: { ...datos, ciudad: 'Cuenca' } }, sa)
  fila = usuarioEnHoja(env, 'rosa')
  assert.equal(fila.ciudad, 'Cuenca')
  assert.equal(fila.autor, 'lucia') // el autor no cambia
  assert.equal(fila.modificadoPor, 'dueno')
  assert.equal(usuarioEnHoja(env, 'dueno').autor, 'servitec') // lo creó el superadministrador
  assert.equal(usuarioEnHoja(env, 'servitec').autor, 'superadmin') // y a este, el root
  assert.equal(usuarioEnHoja(env, 'superadmin').autor, 'Sistema')
})

test('visitas, informes y clientes quedan a nombre de quien los crea, aunque envíe otro autor', () => {
  const { env, admin, tec } = entornoListo()
  const v = env.ok('visitas_create', { data: datosVisita({ autor: 'otro', modificadoPor: 'otro' }) }, admin.token)
  env.ok('visitas_update', { id: v.id, data: { estado: 'Aceptada', autor: 'otro' } }, tec.token)
  env.ok('informes_create', { data: datosInforme({ visitaId: v.id, autor: 'otro' }) }, tec.token)

  const [visita] = filas(env, 'Visitas')
  assert.deepEqual([visita.autor, visita.modificadoPor], ['lucia', 'carlos'])
  assert.equal(filas(env, 'Informes')[0].autor, 'carlos')
  assert.equal(filas(env, 'Clientes')[0].autor, 'lucia')
})

test('una hoja Usuarios anterior gana las columnas nuevas sin perder usuarios', () => {
  const env = crearEntorno()
  env.ok('login', { usuario: 'superadmin', clave: CLAVE_INICIAL })
  const hoja = env.hoja('Usuarios')
  hoja.filas = hoja.filas.map((f) => f.slice(0, 10)) // como estaba antes
  env.avanzar(100000) // caduca la caché
  assert.equal(env.ok('login', { usuario: 'superadmin', clave: CLAVE_INICIAL }).usuario.usuario, 'superadmin')
  assert.deepEqual([...hoja.filas[0]], [...env.tablas.USUARIOS.headers])
  assert.equal(hoja.filas.length, 2)
})

test('si hay una columna ajena donde va una nueva, no se pisa y se avisa', () => {
  const env = crearEntorno()
  env.ok('login', { usuario: 'superadmin', clave: CLAVE_INICIAL })
  const hoja = env.hoja('Usuarios')
  hoja.filas = hoja.filas.map((f) => f.slice(0, 10))
  hoja.filas[0].push('apodo')
  env.avanzar(100000)
  assert.match(env.llamar('login', { usuario: 'superadmin', clave: CLAVE_INICIAL }).error, /apodo/)
  assert.equal(hoja.filas[0][10], 'apodo')
})

test('usuario sugerido y disponible: misma regla que la app', () => {
  const { env, sa, admin } = entornoListo()
  const nombre = 'Carlos Andrés Romero Vélez'
  const cedula = cedulaDe(60)
  const primero = env.ok('usuarios_sugerir', { nombre, cedula }, admin.token)
  assert.equal(primero, generarUsuario(nombre, cedula))
  assert.equal(env.ok('usuarios_disponible', { usuario: primero }, admin.token), true)
  env.ok('usuarios_create', { data: datosUsuario('', 'tecnico', 60, { nombre }) }, sa) // sin usuario: usa el sugerido
  assert.equal(env.ok('usuarios_disponible', { usuario: primero }, sa), false)
  assert.equal(env.ok('usuarios_sugerir', { nombre, cedula }, sa), generarUsuario(nombre, cedula, [primero]))
  assert.match(env.llamar('usuarios_create', { data: datosUsuario('otro', 'tecnico', 60) }, sa).error, /esa cédula/)
})

test('el admin crea, edita y desactiva administradores y técnicos, nunca al superadministrador', () => {
  const { env, root, admin, admin2, tec } = entornoListo()
  assert.deepEqual(env.ok('usuarios_list', {}, admin.token).map((u) => u.usuario).sort(), ['carlos', 'diego', 'dueno', 'lucia', 'marta'])
  assert.equal(env.llamar('usuarios_create', { data: datosUsuario('nuevo', 'admin', 55) }, admin.token).ok, true)
  assert.equal(env.llamar('usuarios_update', { id: tec.id, data: { rol: 'admin' } }, admin.token).ok, true)
  assert.equal(env.llamar('usuarios_update', { id: admin2.id, data: { activo: false } }, admin.token).ok, true)
  assert.equal(env.llamar('me', {}, admin2.token).code, 'AUTH')

  const dueno = env.ok('me', {}, root)
  for (const accion of ['usuarios_update', 'usuarios_delete'])
    assert.equal(env.llamar(accion, { id: dueno.id, data: { activo: false } }, admin.token).ok, false, accion)
  assert.match(env.llamar('usuarios_update', { id: tec.id, data: { rol: 'root' } }, admin.token).error, /Rol/)
  assert.equal(env.ok('me', {}, root).rol, 'root')
})

test('el admin edita sus propios datos pero no se quita el acceso', () => {
  const { env, admin } = entornoListo()
  const yo = env.ok('me', {}, admin.token)
  assert.equal(env.llamar('usuarios_update', { id: admin.id, data: { ...datosUsuario('lucia', 'admin', 1), ciudad: 'Loja' } }, admin.token).ok, true, yo.usuario)
  assert.match(env.llamar('usuarios_update', { id: admin.id, data: { activo: false } }, admin.token).error, /propio acceso/)
  assert.match(env.llamar('usuarios_update', { id: admin.id, data: { rol: 'tecnico' } }, admin.token).error, /propio acceso/)
  assert.match(env.llamar('usuarios_delete', { id: admin.id }, admin.token).error, /propia cuenta/)
})

test('eliminar un usuario: pierde el acceso, desaparece de las listas y su historial se conserva', () => {
  const { env, admin, admin2, tec, tec2 } = entornoListo()
  const v = env.ok('visitas_create', { data: datosVisita() }, admin.token) // asignada a carlos
  assert.match(env.llamar('usuarios_delete', { id: tec.id }, admin.token).error, /1 visita\(s\) pendiente/)
  env.ok('visitas_update', { id: v.id, data: { estado: 'Cancelada', motivo: 'Prueba' } }, admin.token)
  assert.equal(env.llamar('usuarios_delete', { id: tec.id }, tec2.token).code, 'FORBIDDEN')
  env.ok('usuarios_delete', { id: tec.id }, admin.token)
  env.ok('usuarios_delete', { id: admin2.id }, admin.token)

  assert.equal(env.llamar('me', {}, tec.token).code, 'AUTH')
  assert.equal(env.llamar('login', { usuario: 'carlos', clave: 'Clave-Definitiva-77' }).ok, false)
  for (const accion of ['usuarios_list', 'tecnicos_list']) assert.ok(!env.ok(accion, {}, admin.token).some((u) => ['carlos', 'marta'].includes(u.usuario)), accion)
  assert.equal(env.llamar('usuarios_update', { id: tec.id, data: { activo: true } }, admin.token).ok, false) // no se revive
  assert.equal(env.ok('visitas_get', { id: v.id }, admin.token).responsable, 'carlos')
  const fila = usuarioEnHoja(env, 'carlos')
  assert.deepEqual([fila.eliminado, fila.modificadoPor], [true, 'lucia'])
  // el nombre de usuario no se reutiliza; la cédula sí queda libre
  assert.match(env.llamar('usuarios_create', { data: datosUsuario('carlos', 'tecnico', 3) }, admin.token).error, /en uso/)
  assert.equal(env.llamar('usuarios_create', { data: datosUsuario('carlos2', 'tecnico', 3) }, admin.token).ok, true)
})

test('restablecer a la cédula: solo con la cédula del usuario se omite la política de claves', () => {
  const { env, sa, tec } = entornoListo()
  assert.match(env.llamar('usuarios_update', { id: tec.id, data: { clave: '123', temporal: true } }, sa).error, /al menos 10/)
  env.ok('usuarios_update', { id: tec.id, data: { clave: cedulaDe(3), temporal: true } }, sa)
  assert.equal(env.llamar('me', {}, tec.token).code, 'AUTH')
  assert.equal(env.ok('login', { usuario: 'carlos', clave: cedulaDe(3) }).usuario.cambiarClave, true)
})

test('responsables: los administradores también atienden visitas; el superadministrador no aparece', () => {
  const { env, admin, admin2, tec } = entornoListo()
  const nombres = (token) => env.ok('tecnicos_list', {}, token).map((t) => t.usuario)
  assert.deepEqual(nombres(admin.token).sort(), ['carlos', 'diego', 'dueno', 'lucia', 'marta'])

  const v = env.ok('visitas_create', { data: datosVisita({ responsable: 'marta' }) }, admin.token)
  assert.equal(env.ok('visitas_list', {}, admin2.token).items[0].id, v.id)
  assert.equal(env.ok('visitas_list', {}, tec.token).items.length, 0)
  env.ok('visitas_update', { id: v.id, data: { estado: 'Aceptada' } }, admin2.token)
  assert.equal(env.ok('notificaciones_list', {}, admin.token).items[0].tipo, 'visita_estado')
})

test('la agenda busca por cliente, dirección o tipo', () => {
  const { env, admin } = entornoListo()
  env.ok('visitas_create', { data: datosVisita({ cliente: 'Banco del Sur' }) }, admin.token)
  env.ok('visitas_create', { data: datosVisita({ cliente: 'Clínica Norte', direccion: 'Calle Bolívar' }) }, admin.token)
  const buscar = (q) => env.ok('visitas_list', { q }, admin.token).items.map((v) => v.cliente)
  assert.deepEqual(buscar('banco'), ['Banco del Sur'])
  assert.deepEqual(buscar('bolívar'), ['Clínica Norte'])
})

test('inicio: cifras según lo que ve cada rol', () => {
  const { env, sa, admin, tec, tec2 } = entornoListo()
  const v = env.ok('visitas_create', { data: datosVisita({ fecha: dia(0) }) }, admin.token)
  env.ok('visitas_create', { data: datosVisita({ fecha: dia(2), responsable: 'diego' }) }, admin.token)
  env.ok('visitas_create', { data: datosVisita({ fecha: dia(-1) }) }, admin.token)
  env.ok('visitas_update', { id: v.id, data: { estado: 'Aceptada' } }, tec.token)
  env.ok('informes_create', { data: datosInforme({ visitaId: v.id, fecha: dia(0) }) }, tec.token)

  const r = env.ok('dashboard_resumen', {}, sa)
  assert.deepEqual([r.visitasHoy, r.proximas, r.atrasadas, r.informesBorrador, r.clientes, r.tecnicos], [1, 1, 1, 1, 1, 2])
  assert.equal(r.porDia.length, 14)
  assert.equal(r.porDia[6].fecha, dia(0))
  assert.equal(r.proximasLista.length, 2)
  assert.equal(r.ultimosInformes.length, 1)
  const otro = env.ok('dashboard_resumen', {}, tec2.token)
  assert.deepEqual([otro.visitasHoy, otro.proximas, otro.informesBorrador, otro.clientes], [0, 1, 0, 0])
})

test('un texto que empieza como fórmula se guarda tal cual', () => {
  const { env, admin } = entornoListo()
  const notas = '- revisar cámaras'
  const v = env.ok('visitas_create', { data: datosVisita({ notas, cliente: '=1+1' }) }, admin.token)
  const guardada = env.ok('visitas_get', { id: v.id }, admin.token)
  assert.deepEqual([guardada.notas, guardada.cliente], [notas, '=1+1'])
})
