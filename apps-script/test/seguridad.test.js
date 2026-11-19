import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearEntorno, CLAVE_INICIAL } from './harness.js'

const nuevaClave = 'Ferisel-Nueva-2026'

// Deja un superadmin listo para operar (clave inicial cambiada)
function superadminListo(env) {
  const { token } = env.ok('login', { usuario: 'superadmin', clave: CLAVE_INICIAL })
  const r = env.ok('cambiar_clave', { actual: CLAVE_INICIAL, nueva: nuevaClave }, token)
  return r.token
}

test('el superadmin inicial debe cambiar su clave antes de usar el sistema', () => {
  const env = crearEntorno()
  const login = env.ok('login', { usuario: 'superadmin', clave: CLAVE_INICIAL })
  assert.equal(login.usuario.cambiarClave, true)
  assert.equal(env.ok('me', {}, login.token).cambiarClave, true) // "me" sí responde

  // Cualquier otra acción es rechazada por el backend (no depende de la pantalla)
  for (const accion of ['visitas_list', 'informes_list', 'usuarios_list', 'tecnicos_list']) {
    const r = env.llamar(accion, {}, login.token)
    assert.equal(r.ok, false, accion)
    assert.equal(r.code, 'CAMBIAR_CLAVE', accion)
  }
})

test('cambiar_clave: valida la actual, la política y la repetición', () => {
  const env = crearEntorno()
  const { token } = env.ok('login', { usuario: 'superadmin', clave: CLAVE_INICIAL })

  assert.match(env.llamar('cambiar_clave', { actual: 'incorrecta', nueva: nuevaClave }, token).error, /actual no es correcta/)
  assert.match(env.llamar('cambiar_clave', { actual: CLAVE_INICIAL, nueva: 'corta1' }, token).error, /al menos 10/)
  assert.match(env.llamar('cambiar_clave', { actual: CLAVE_INICIAL, nueva: 'sololetrasaquiii' }, token).error, /letras y números/)
  assert.match(env.llamar('cambiar_clave', { actual: CLAVE_INICIAL, nueva: 'superadmin12345' }, token).error, /nombre de usuario/)
  assert.match(env.llamar('cambiar_clave', { actual: CLAVE_INICIAL, nueva: CLAVE_INICIAL }, token).error, /distinta/)
})

test('cambiar_clave: entrega token nuevo, invalida el anterior y deja operar', () => {
  const env = crearEntorno()
  const { token } = env.ok('login', { usuario: 'superadmin', clave: CLAVE_INICIAL })
  const r = env.ok('cambiar_clave', { actual: CLAVE_INICIAL, nueva: nuevaClave }, token)

  assert.equal(r.usuario.cambiarClave, false)
  assert.equal(env.llamar('me', {}, token).code, 'AUTH') // el token anterior ya no vale
  assert.ok(Array.isArray(env.ok('visitas_list', {}, r.token).items)) // el nuevo sí
  assert.equal(env.llamar('login', { usuario: 'superadmin', clave: CLAVE_INICIAL }).ok, false) // la vieja clave ya no entra
  assert.equal(env.llamar('login', { usuario: 'superadmin', clave: nuevaClave }).ok, true)
})

test('bloqueo: 5 fallos bloquean 15 min, incluso con la clave correcta, y luego se libera', () => {
  const env = crearEntorno()
  env.ok('login', { usuario: 'superadmin', clave: CLAVE_INICIAL }) // crea el superadmin

  for (let i = 1; i <= 4; i++) {
    const r = env.llamar('login', { usuario: 'superadmin', clave: 'mala' + i })
    assert.equal(r.code, '', `intento ${i}`)
    assert.match(r.error, /incorrectos/)
  }
  assert.equal(env.llamar('login', { usuario: 'superadmin', clave: 'mala5' }).code, 'LOCKED') // el 5.º dispara el bloqueo
  assert.equal(env.llamar('login', { usuario: 'superadmin', clave: CLAVE_INICIAL }).code, 'LOCKED') // ni con la correcta

  env.avanzar(901)
  assert.equal(env.llamar('login', { usuario: 'superadmin', clave: CLAVE_INICIAL }).ok, true)
})

test('bloqueo: un login correcto reinicia el contador', () => {
  const env = crearEntorno()
  env.ok('login', { usuario: 'superadmin', clave: CLAVE_INICIAL })
  for (let i = 0; i < 4; i++) env.llamar('login', { usuario: 'superadmin', clave: 'mala' })
  assert.equal(env.llamar('login', { usuario: 'superadmin', clave: CLAVE_INICIAL }).ok, true)
  for (let i = 0; i < 4; i++) assert.notEqual(env.llamar('login', { usuario: 'superadmin', clave: 'mala' }).code, 'LOCKED')
})

test('no revela qué usuarios existen: mismo mensaje y mismo bloqueo', () => {
  const env = crearEntorno()
  env.ok('login', { usuario: 'superadmin', clave: CLAVE_INICIAL })
  const existente = env.llamar('login', { usuario: 'superadmin', clave: 'x' })
  const fantasma = env.llamar('login', { usuario: 'noexiste', clave: 'x' })
  assert.equal(existente.error, fantasma.error)
  for (let i = 0; i < 4; i++) env.llamar('login', { usuario: 'noexiste', clave: 'x' })
  assert.equal(env.llamar('login', { usuario: 'noexiste', clave: 'x' }).code, 'LOCKED')
})

test('cambiar_clave con la actual incorrecta también cuenta para el bloqueo', () => {
  const env = crearEntorno()
  const { token } = env.ok('login', { usuario: 'superadmin', clave: CLAVE_INICIAL })
  for (let i = 0; i < 5; i++) env.llamar('cambiar_clave', { actual: 'mala', nueva: nuevaClave }, token)
  assert.equal(env.llamar('cambiar_clave', { actual: CLAVE_INICIAL, nueva: nuevaClave }, token).code, 'LOCKED')
})

test('usuarios nuevos: política de clave, cambio obligatorio y primer uso', () => {
  const env = crearEntorno()
  const sa = superadminListo(env)

  assert.match(env.llamar('usuarios_create', { data: { usuario: 'ana', nombre: 'Ana', rol: 'tecnico', clave: 'corta1' } }, sa).error, /al menos 10/)
  assert.match(env.llamar('usuarios_create', { data: { usuario: 'ana', nombre: 'Ana', rol: 'tecnico', clave: 'ana-clave-12345' } }, sa).error, /nombre de usuario/)
  assert.match(env.llamar('usuarios_create', { data: { usuario: 'A n', nombre: 'Ana', rol: 'tecnico', clave: 'Temporal-2026' } }, sa).error, /Usuario inválido/)

  const u = env.ok('usuarios_create', { data: { usuario: 'ana', nombre: 'Ana', rol: 'tecnico', clave: 'Temporal-2026' } }, sa)
  assert.equal(u.cambiarClave, true)
  assert.equal(u.hash, undefined) // la respuesta nunca expone hash ni sal
  assert.equal(u.salt, undefined)

  const login = env.ok('login', { usuario: 'ana', clave: 'Temporal-2026' })
  assert.equal(env.llamar('visitas_list', {}, login.token).code, 'CAMBIAR_CLAVE')
  const cambio = env.ok('cambiar_clave', { actual: 'Temporal-2026', nueva: 'Mi-Clave-Propia-1' }, login.token)
  assert.ok(Array.isArray(env.ok('visitas_list', {}, cambio.token).items))
})

test('restablecer clave (superadmin): cierra sesiones, exige cambio y levanta el bloqueo', () => {
  const env = crearEntorno()
  const sa = superadminListo(env)
  const u = env.ok('usuarios_create', { data: { usuario: 'luis', nombre: 'Luis', rol: 'admin', clave: 'Temporal-2026' } }, sa)
  const sesion = env.ok('login', { usuario: 'luis', clave: 'Temporal-2026' })
  const activo = env.ok('cambiar_clave', { actual: 'Temporal-2026', nueva: 'Clave-Segura-7755' }, sesion.token)

  for (let i = 0; i < 5; i++) env.llamar('login', { usuario: 'luis', clave: 'mala' }) // se bloquea
  assert.equal(env.llamar('login', { usuario: 'luis', clave: 'Clave-Segura-7755' }).code, 'LOCKED')

  assert.match(env.llamar('usuarios_update', { id: u.id, data: { clave: 'floja' } }, sa).error, /al menos 10/)
  env.ok('usuarios_update', { id: u.id, data: { clave: 'Restablecida-88' } }, sa)

  assert.equal(env.llamar('me', {}, activo.token).code, 'AUTH') // su sesión abierta murió
  const nuevo = env.ok('login', { usuario: 'luis', clave: 'Restablecida-88' }) // ya no está bloqueado
  assert.equal(nuevo.usuario.cambiarClave, true)
})

test('logout invalida el token en el servidor', () => {
  const env = crearEntorno()
  const sa = superadminListo(env)
  assert.equal(env.llamar('me', {}, sa).ok, true)
  env.ok('logout', {}, sa)
  assert.equal(env.llamar('me', {}, sa).code, 'AUTH')
})

test('las claves nunca quedan en texto plano en la hoja y el hash es v2', () => {
  const env = crearEntorno()
  superadminListo(env)
  const texto = JSON.stringify(env.hoja('Usuarios').filas)
  assert.ok(!texto.includes(CLAVE_INICIAL))
  assert.ok(!texto.includes(nuevaClave))
  const hash = env.hoja('Usuarios').filas[1][5]
  assert.match(hash, /^v2:[0-9a-f]{64}$/)
})

test('usuario desactivado pierde el acceso aunque tenga token', () => {
  const env = crearEntorno()
  const sa = superadminListo(env)
  const u = env.ok('usuarios_create', { data: { usuario: 'pedro', nombre: 'Pedro', rol: 'admin', clave: 'Temporal-2026' } }, sa)
  const { token } = env.ok('login', { usuario: 'pedro', clave: 'Temporal-2026' })
  env.ok('usuarios_update', { id: u.id, data: { activo: false } }, sa)
  assert.equal(env.llamar('me', {}, token).code, 'AUTH')
  assert.equal(env.llamar('login', { usuario: 'pedro', clave: 'Temporal-2026' }).ok, false)
})

test('login y consultas no toman el lock; las escrituras sí (y sin tomarlo dos veces)', () => {
  const env = crearEntorno()
  env.ok('login', { usuario: 'superadmin', clave: CLAVE_INICIAL }) // el primer uso crea el superadmin: toma el lock 1 vez
  env.reiniciarStats()
  env.llamar('login', { usuario: 'superadmin', clave: CLAVE_INICIAL })
  assert.equal(env.stats.bloqueos, 0)
  const { token } = env.ok('login', { usuario: 'superadmin', clave: CLAVE_INICIAL })
  env.reiniciarStats()
  env.ok('cambiar_clave', { actual: CLAVE_INICIAL, nueva: nuevaClave }, token)
  assert.equal(env.stats.bloqueos, 1)
})

// Los datos del superadmin salen de las propiedades del script (nunca del código)
const definirSuperadmin = (env, clave = 'temporal1') => {
  env.propiedades.set('SUPERADMIN_USUARIO', 'jefe.demo')
  env.propiedades.set('SUPERADMIN_NOMBRE', 'Jefe Demo')
  env.propiedades.set('SUPERADMIN_CLAVE', clave)
}

test('crearSuperadmin (desde el editor): crea el usuario con la clave temporal de las propiedades y evita el superadmin genérico', () => {
  const env = crearEntorno()
  definirSuperadmin(env)
  env.ejecutar('crearSuperadmin')

  // la clave temporal sirve para entrar, pero exige cambiarla antes de hacer nada
  const login = env.ok('login', { usuario: 'jefe.demo', clave: 'temporal1' })
  assert.equal(login.usuario.rol, 'superadmin')
  assert.equal(login.usuario.nombre, 'Jefe Demo')
  assert.equal(login.usuario.cambiarClave, true)
  assert.equal(env.llamar('usuarios_list', {}, login.token).code, 'CAMBIAR_CLAVE')
  assert.match(env.llamar('cambiar_clave', { actual: 'temporal1', nueva: 'corta1' }, login.token).error, /al menos 10/) // la política sí rige al cambiarla
  const cambio = env.ok('cambiar_clave', { actual: 'temporal1', nueva: 'Clave-Nueva-Segura-1' }, login.token)
  assert.equal(env.ok('usuarios_list', {}, cambio.token).length, 1)

  // la hoja no estaba vacía: no se creó el superadmin genérico con la clave pública
  assert.equal(env.llamar('login', { usuario: 'superadmin', clave: CLAVE_INICIAL }).ok, false)
  // la clave nunca queda en texto plano ni en la hoja ni en las propiedades
  assert.ok(!JSON.stringify(env.hoja('Usuarios').filas).includes('temporal1'))
  assert.equal(env.propiedades.has('SUPERADMIN_CLAVE'), false)
  // sin la clave en las propiedades no hace nada; con ella, no duplica
  assert.throws(() => env.ejecutar('crearSuperadmin'), /Define las propiedades/)
  env.propiedades.set('SUPERADMIN_CLAVE', 'otra1234')
  assert.throws(() => env.ejecutar('crearSuperadmin'), /ya existe/)
})

test('crearSuperadmin sin propiedades definidas o con un usuario inválido explica qué falta', () => {
  const env = crearEntorno()
  assert.throws(() => env.ejecutar('crearSuperadmin'), /SUPERADMIN_USUARIO y SUPERADMIN_CLAVE/)
  env.propiedades.set('SUPERADMIN_USUARIO', 'No Valido!')
  env.propiedades.set('SUPERADMIN_CLAVE', 'temporal1')
  assert.throws(() => env.ejecutar('crearSuperadmin'), /SUPERADMIN_USUARIO inválido/)
  assert.equal(env.hoja('Usuarios')?.filas.length ?? 1, 1) // no se creó nada
})

test('diagnosticoUsuarios: indica si el usuario existe y si la clave temporal coincide, sin mostrar claves', () => {
  const env = crearEntorno()
  env.ejecutar('diagnosticoUsuarios')
  assert.ok(env.logs.some((l) => /define la propiedad SUPERADMIN_USUARIO/.test(l)))

  definirSuperadmin(env)
  env.logs.length = 0
  env.ejecutar('diagnosticoUsuarios')
  assert.ok(env.logs.some((l) => /NO existe/.test(l)))

  env.ejecutar('crearSuperadmin')
  env.propiedades.set('SUPERADMIN_CLAVE', 'temporal1') // se borró al crear; se vuelve a definir solo para comprobar
  env.logs.length = 0
  env.ejecutar('diagnosticoUsuarios')
  const texto = env.logs.join(' | ')
  assert.match(texto, /Hash en formato v2: true/)
  assert.match(texto, /coincide con el hash guardado \(con este código\): true/)
  assert.match(texto, /Nueva versión/)
  assert.ok(!texto.includes('temporal1')) // nunca imprime la clave
  assert.ok(!/v2:[0-9a-f]{20}/.test(texto)) // ni el hash
})
