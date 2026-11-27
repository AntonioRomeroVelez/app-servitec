// Varias empresas, cada una con su hoja de cálculo y su carpeta. El root las crea y nadie ve datos de otra.
import test from 'node:test'
import assert from 'node:assert/strict'
import { crearEntorno, CLAVE_INICIAL } from './harness.js'
import { entornoListo, conEmpresa, datosEmpresa, datosVisita, datosInforme, datosUsuario, cedulaDe, CEDULA_ROOT, JPEG_B64, MINI, checklistCompleto } from './ayudas.js'

const NUEVA = 'Clave-Definitiva-77'

/** El root crea una empresa y su superadministrador cambia la clave temporal. */
function crearEmpresa(env, root, nombre, n) {
  const r = env.ok('empresas_create', { data: datosEmpresa(nombre, n) }, root)
  const t = env.ok('login', { usuario: r.usuario, clave: r.clave }).token
  const token = env.ok('cambiar_clave', { actual: r.clave, nueva: NUEVA }, t).token
  return { id: r.empresaId, token, usuario: r.usuario }
}

function persona(env, token, usuario, rol, n) {
  const datos = datosUsuario(usuario, rol, n)
  const u = env.ok('usuarios_create', { data: datos }, token)
  const t = env.ok('login', { usuario, clave: datos.cedula }).token
  return { id: u.id, usuario, token: env.ok('cambiar_clave', { actual: datos.cedula, nueva: NUEVA }, t).token }
}

function dosEmpresas() {
  const e = entornoListo() // empresa ServiTec: servitec (superadmin), dueno, lucia, marta, carlos, diego
  const otra = crearEmpresa(e.env, e.root, 'Alarmas Norte', 70)
  const jefeB = persona(e.env, otra.token, 'nora', 'admin', 73) // propietaria de la segunda empresa
  return { ...e, otra, jefeB, adminB: persona(e.env, jefeB.token, 'pablo', 'admin', 71), tecB: persona(e.env, jefeB.token, 'sofia', 'tecnico', 72) }
}

test('el primer usuario es root: no pertenece a ninguna empresa', () => {
  const env = crearEntorno()
  const { usuario } = env.ok('login', { usuario: 'superadmin', clave: CLAVE_INICIAL })
  assert.deepEqual([usuario.rol, usuario.plataforma, usuario.empresaId], ['root', true, ''])
  assert.equal(env.principal.getSheetByName('Empresas').filas.length, 1)
  assert.equal(env.drive.raices.length, 0)
})

test('crearSuperadmin crea al root y exige su cédula', () => {
  const env = crearEntorno()
  env.propiedades.set('SUPERADMIN_USUARIO', 'dueno')
  env.propiedades.set('SUPERADMIN_CLAVE', 'temporal1')
  assert.throws(() => env.ejecutar('crearSuperadmin'), /SUPERADMIN_CEDULA/)
  env.propiedades.set('SUPERADMIN_CEDULA', CEDULA_ROOT)
  env.ejecutar('crearSuperadmin')
  assert.equal(env.ok('login', { usuario: 'dueno', clave: 'temporal1' }).usuario.rol, 'root')
})

test('crear una empresa crea su superadministrador: usuario del nombre y clave la cédula del root', () => {
  const { env, root } = conEmpresa(crearEntorno())
  const datos = datosEmpresa('Alarmas Norte', 80)
  const r = env.ok('empresas_create', { data: datos }, root)
  assert.deepEqual([r.usuario, r.clave], ['alarmas', CEDULA_ROOT])
  const login = env.ok('login', { usuario: 'alarmas', clave: CEDULA_ROOT })
  assert.deepEqual([login.usuario.rol, login.usuario.cambiarClave, login.usuario.cedula, login.usuario.correo, login.usuario.telefono, login.usuario.ciudad], ['superadmin', true, datos.cedula, datos.correo, datos.telefono, 'Quito'])
  const token = env.ok('cambiar_clave', { actual: CEDULA_ROOT, nueva: NUEVA }, login.token).token
  const { empresa } = env.ok('configuracion_get', {}, token)
  assert.deepEqual([empresa.nombre, empresa.direccion, empresa.telefono, empresa.correo], ['Alarmas Norte', 'Quito', datos.telefono, datos.correo])

  // nombres repetidos o muy cortos
  assert.equal(env.ok('empresas_create', { data: datosEmpresa('Alarmas Sur', 81) }, root).usuario, 'alarmassur')
  assert.equal(env.ok('empresas_create', { data: datosEmpresa('Alarmas', 82) }, root).usuario, 'alarmas2')
  assert.equal(env.ok('empresas_create', { data: datosEmpresa('La Casa Segura', 83) }, root).usuario, 'lacasa')
})

test('sin la cédula del root no se crean empresas', () => {
  const env = crearEntorno()
  const t = env.ok('login', { usuario: 'superadmin', clave: CLAVE_INICIAL }).token
  const root = env.ok('cambiar_clave', { actual: CLAVE_INICIAL, nueva: NUEVA }, t).token
  assert.match(env.llamar('empresas_create', { data: datosEmpresa('X Uno', 1) }, root).error, /SUPERADMIN_CEDULA/)
  assert.equal(env.principal.getSheetByName('Empresas').filas.length, 1)
})

test('solo el root crea y administra empresas', () => {
  const { env, root, sup, sa, admin, tec, otra } = dosEmpresas()
  for (const token of [sup, sa, admin.token, tec.token, otra.token])
    for (const accion of ['empresas_list', 'empresas_create', 'empresas_update', 'empresas_admins', 'empresas_restablecer_admin'])
      assert.equal(env.llamar(accion, { id: otra.id, data: {} }, token).code, 'FORBIDDEN', accion)

  const lista = env.ok('empresas_list', {}, root)
  assert.equal(lista.length, 2)
  const norte = lista.find((x) => x.id === otra.id)
  assert.deepEqual([norte.nombre, norte.activa, norte.usuarios], ['Alarmas Norte', true, 4])
})

test('el root no personaliza empresas ni trabaja con sus datos', () => {
  const { env, root, tec, otra } = dosEmpresas()
  assert.equal(env.ok('visitas_list', {}, root).total, 0)
  assert.deepEqual(env.ok('tecnicos_list', {}, root), [])
  for (const accion of ['visitas_create', 'informes_create', 'clientes_list', 'usuarios_list', 'configuracion_update', 'empresas_config_update', 'empresas_config_get'])
    assert.equal(env.llamar(accion, { id: otra.id, data: {} }, root).code, 'FORBIDDEN', accion)
  assert.equal(env.llamar('empresas_update', { id: otra.id, data: { nombre: 'Cambiada' } }, root).code, 'FORBIDDEN')
  assert.equal(env.llamar('usuarios_update', { id: tec.id, data: { activo: false } }, root).code, 'FORBIDDEN')
})

test('el superadministrador solo personaliza su empresa y gestiona administradores', () => {
  const { env, sup, tec, admin } = dosEmpresas()
  for (const accion of ['visitas_create', 'visitas_get', 'informes_create', 'clientes_list', 'fotos_list'])
    assert.equal(env.llamar(accion, { id: 'x', data: {} }, sup).code, 'FORBIDDEN', accion)
  assert.deepEqual(env.ok('usuarios_list', {}, sup).map((u) => u.usuario).sort(), ['dueno', 'lucia', 'marta', 'servitec'])
  assert.match(env.llamar('usuarios_create', { data: datosUsuario('nuevo', 'tecnico', 95) }, sup).error, /administradores/)
  assert.equal(env.llamar('usuarios_update', { id: tec.id, data: { activo: false } }, sup).code, 'FORBIDDEN')
  assert.equal(env.llamar('usuarios_update', { id: admin.id, data: { activo: false } }, sup).ok, true)
  assert.equal(env.ok('dashboard_resumen', {}, sup).visitasHoy, 0)
})

test('nadie por debajo ve ni modifica a quien está por encima', () => {
  const { env, root, sup, sa } = dosEmpresas()
  const yoRoot = env.ok('me', {}, root)
  const yoSup = env.ok('me', {}, sup)
  for (const token of [sa, sup]) assert.ok(!env.ok('usuarios_list', {}, token).some((u) => u.rol === 'root'))
  assert.ok(!env.ok('usuarios_list', {}, sa).some((u) => u.rol === 'superadmin'))
  assert.ok(!env.ok('tecnicos_list', {}, sa).some((u) => ['superadmin', 'root'].includes(u.rol)))
  for (const [quien, objetivo] of [[sa, yoSup], [sa, yoRoot], [sup, yoRoot]])
    assert.equal(env.llamar('usuarios_update', { id: objetivo.id, data: { activo: false } }, quien).ok, false)
  for (const rol of ['superadmin', 'root']) assert.equal(env.llamar('usuarios_create', { data: datosUsuario('otro', rol, 90) }, sa).ok, false)
})

test('la cuenta del propietario solo la cambian él mismo y el superadministrador', () => {
  const { env, sup, sa, admin } = dosEmpresas()
  const dueno = env.ok('me', {}, sa)
  assert.equal(dueno.propietario, true)
  assert.equal(env.ok('usuarios_list', {}, sup).filter((u) => u.propietario).length, 1)
  for (const [accion, data] of [['usuarios_update', { activo: false }], ['usuarios_update', { clave: 'Restablecida-88' }], ['usuarios_delete', {}]])
    assert.match(env.llamar(accion, { id: dueno.id, data }, admin.token).error, /propietario/)
  assert.equal(env.llamar('usuarios_update', { id: dueno.id, data: { nombre: 'Dueño Real' } }, sa).ok, true)
  assert.equal(env.llamar('usuarios_update', { id: dueno.id, data: { activo: false } }, sup).ok, true)
})

test('el root ve usuario y clave temporal del superadministrador hasta que la cambia', () => {
  const { env, root, sa } = conEmpresa(crearEntorno())
  const r = env.ok('empresas_create', { data: datosEmpresa('Alarmas Norte', 70) }, root)
  const ver = () => env.ok('empresas_admins', { id: r.empresaId }, root)[0]
  assert.deepEqual([ver().usuario, ver().claveTemporal], ['alarmas', CEDULA_ROOT])
  const t = env.ok('login', { usuario: 'alarmas', clave: CEDULA_ROOT }).token
  const suyo = env.ok('cambiar_clave', { actual: CEDULA_ROOT, nueva: NUEVA }, t).token
  assert.equal(ver().claveTemporal, '')
  assert.ok(!JSON.stringify(ver()).includes(NUEVA))

  assert.deepEqual(env.ok('empresas_restablecer_admin', { id: ver().id }, root), { usuario: 'alarmas', clave: CEDULA_ROOT })
  assert.equal(env.llamar('me', {}, suyo).code, 'AUTH')
  assert.equal(env.ok('login', { usuario: 'alarmas', clave: CEDULA_ROOT }).usuario.cambiarClave, true)
  assert.equal(ver().claveTemporal, CEDULA_ROOT)
  assert.equal(env.llamar('me', {}, sa).ok, true)
})

test('una empresa con datos inválidos no deja nada a medias', () => {
  const { env, root } = entornoListo()
  const usuarios = env.hoja('Usuarios').filas.length
  const crear = (extra) => env.llamar('empresas_create', { data: datosEmpresa('Nueva', 80, extra) }, root)
  assert.match(crear({ nombre: '' }).error, /nombre de la empresa/)
  assert.match(crear({ cedula: '123' }).error, /10 dígitos/)
  assert.match(crear({ correo: 'mal' }).error, /correo no es válido/)
  assert.match(crear({ telefono: '1' }).error, /teléfono/)
  assert.match(crear({ ciudad: '' }).error, /ciudad/)
  assert.equal(env.hoja('Empresas').filas.length, 2)
  assert.equal(env.hoja('Usuarios').filas.length, usuarios)
})

test('el propietario puede repetir los datos de la empresa; los demás no', () => {
  const { env, root } = conEmpresa(crearEntorno())
  const sup = crearEmpresa(env, root, 'Alarmas Norte', 70).token
  const igual = datosEmpresa('x', 70)
  const iguales = { cedula: igual.cedula, correo: igual.correo, telefono: igual.telefono }
  const crear = (token, usuario, rol, extra) => env.llamar('usuarios_create', { data: datosUsuario(usuario, rol, 91, extra) }, token)

  assert.equal(crear(sup, 'propietario', 'admin', iguales).ok, true)
  assert.match(crear(sup, 'otroadmin', 'admin', iguales).error, /esa cédula/)
  const t = env.ok('login', { usuario: 'propietario', clave: igual.cedula }).token
  const dueno = env.ok('cambiar_clave', { actual: igual.cedula, nueva: NUEVA }, t).token
  assert.match(crear(dueno, 'tecuno', 'tecnico', iguales).error, /esa cédula/)
  const nuevos = { cedula: cedulaDe(92), correo: 'otro@ejemplo.ec', telefono: '0987654321' }
  assert.match(crear(dueno, 'tecuno', 'tecnico', { ...nuevos, correo: igual.correo.toUpperCase() }).error, /ese correo/)
  assert.match(crear(dueno, 'tecuno', 'tecnico', { ...nuevos, telefono: igual.telefono }).error, /ese teléfono/)
  assert.equal(crear(dueno, 'tecuno', 'tecnico', nuevos).ok, true)
})

test('ninguna empresa ve ni toca los datos de otra', () => {
  const { env, admin, tec, otra, adminB, tecB, jefeB } = dosEmpresas()
  const v = env.ok('visitas_create', { data: datosVisita() }, admin.token)
  env.ok('visitas_update', { id: v.id, data: { estado: 'Aceptada' } }, tec.token)
  const i = env.ok('informes_create', { data: datosInforme({ visitaId: v.id }) }, tec.token)
  const f = env.ok('fotos_upload', { visitaId: v.id, imagen: JPEG_B64, mini: MINI }, tec.token)
  const [c] = env.ok('clientes_list', {}, admin.token).items

  for (const token of [otra.token, adminB.token, tecB.token]) {
    assert.equal(env.ok('visitas_list', {}, token).total, 0)
    assert.equal(env.ok('informes_list', {}, token).total, 0)
    for (const [accion, p] of [['visitas_get', v], ['visitas_update', v], ['visitas_delete', v], ['informes_get', i], ['informes_delete', i], ['fotos_get', f], ['fotos_delete', f]])
      assert.equal(env.llamar(accion, { id: p.id, data: { notas: 'x' } }, token).ok, false, accion)
  }
  assert.equal(env.ok('clientes_list', {}, adminB.token).total, 0)
  assert.equal(env.llamar('clientes_update', { id: c.id, data: { nombre: 'Robado' } }, adminB.token).ok, false)
  assert.match(env.llamar('visitas_create', { data: datosVisita({ responsable: 'carlos' }) }, adminB.token).error, /Técnico inválido/)
  assert.equal(env.llamar('usuarios_update', { id: tec.id, data: { activo: false } }, adminB.token).ok, false)
  assert.deepEqual(env.ok('usuarios_list', {}, jefeB.token).map((u) => u.usuario).sort(), ['nora', 'pablo', 'sofia'])
  assert.equal(env.ok('dashboard_resumen', {}, adminB.token).clientes, 0)
})

test('cada empresa registra sus datos, su número de informe y su catálogo de clientes', () => {
  const { env, admin, adminB, otra } = dosEmpresas()
  const a = env.ok('visitas_create', { data: datosVisita({ empresaId: otra.id }) }, admin.token) // no puede elegir empresa
  const b = env.ok('visitas_create', { data: datosVisita({ responsable: 'sofia' }) }, adminB.token)
  assert.notEqual(a.empresaId, otra.id)
  assert.equal(b.empresaId, otra.id)
  assert.notEqual(a.clienteId, b.clienteId) // mismo nombre, clientes distintos
  env.ok('visitas_update', { id: b.id, data: { empresaId: a.empresaId, clienteId: a.clienteId } }, adminB.token)
  const guardada = env.ok('visitas_get', { id: b.id }, adminB.token)
  assert.deepEqual([guardada.empresaId, guardada.clienteId], [otra.id, b.clienteId])

  const n1 = env.ok('informes_create', { data: datosInforme() }, admin.token).numero
  const n2 = env.ok('informes_create', { data: datosInforme() }, adminB.token).numero
  assert.equal(n1, n2) // cada empresa numera desde 0001
})

test('solo el superadministrador de cada empresa la personaliza', () => {
  const { env, root, sup, sa, admin, tec, otra, jefeB } = dosEmpresas()
  for (const token of [root, sa, admin.token, tec.token, jefeB.token]) {
    assert.equal(env.llamar('configuracion_update', { seccion: 'empresa', data: { nombre: 'Otra' } }, token).code, 'FORBIDDEN')
    assert.equal(env.llamar('configuracion_update', { seccion: 'logo', restablecer: true }, token).code, 'FORBIDDEN')
  }
  env.ok('configuracion_update', { seccion: 'empresa', data: { nombre: 'Norte SA' } }, otra.token)
  env.ok('configuracion_update', { seccion: 'informes', data: { prefijo: 'NOR' } }, otra.token)
  assert.deepEqual([env.ok('configuracion_get', {}, jefeB.token).empresa.nombre, env.ok('configuracion_get', {}, jefeB.token).informes.prefijo], ['Norte SA', 'NOR'])
  assert.deepEqual([env.ok('configuracion_get', {}, sup).empresa.nombre, env.ok('configuracion_get', {}, sup).informes.prefijo], ['ServiTec', 'INF'])
  assert.ok(env.ok('empresas_list', {}, root).some((x) => x.nombre === 'Norte SA')) // el root ve el nombre actualizado
})

test('un administrador corrige o elimina informes finalizados y elimina clientes sin visitas; el técnico no', () => {
  const { env, admin, tec } = entornoListo()
  const i = env.ok('informes_create', { data: datosInforme({ estado: 'Finalizado', checklist: checklistCompleto }) }, tec.token)
  assert.equal(env.llamar('informes_update', { id: i.id, data: { titulo: 'x' } }, tec.token).code, 'FORBIDDEN')
  assert.equal(env.llamar('informes_delete', { id: i.id }, tec.token).code, 'FORBIDDEN')
  assert.equal(env.llamar('informes_update', { id: i.id, data: { titulo: 'Corregido' } }, admin.token).ok, true)
  assert.equal(env.llamar('informes_delete', { id: i.id }, admin.token).ok, true)
  const c = env.ok('clientes_create', { data: { nombre: 'Sin visitas' } }, admin.token)
  assert.equal(env.llamar('clientes_delete', { id: c.id }, tec.token).code, 'FORBIDDEN')
  assert.equal(env.llamar('clientes_delete', { id: c.id }, admin.token).ok, true)
})

test('el superadministrador activa y desactiva empresas: desactivada, nadie de ella entra', () => {
  const { env, root, otra, tecB } = dosEmpresas()
  env.ok('empresas_update', { id: otra.id, data: { activa: false } }, root)
  assert.equal(env.llamar('me', {}, tecB.token).code, 'AUTH')
  assert.match(env.llamar('login', { usuario: 'alarmas', clave: NUEVA }).error, /desactivada/)
  env.ok('empresas_update', { id: otra.id, data: { activa: true } }, root)
  assert.equal(env.llamar('me', {}, tecB.token).ok, true)
})

test('el inicio del root resume las empresas', () => {
  const { env, root, otra } = dosEmpresas()
  const r = env.ok('dashboard_resumen', {}, root)
  assert.deepEqual([r.plataforma.empresas, r.plataforma.activas, r.plataforma.usuarios, r.visitasHoy], [2, 2, 10, 0])
  assert.equal(env.ok('dashboard_resumen', {}, otra.token).plataforma, undefined)
})

test('cada empresa tiene su carpeta en Drive con su hoja de cálculo y sus fotos', () => {
  const { env, admin, otra, adminB } = dosEmpresas()
  const empresas = env.hoja('Empresas').filas.slice(1)
  assert.equal(new Set(empresas.map((f) => f[8])).size, 2) // dos hojas de cálculo distintas
  const carpetas = env.drive.raices[0].hijos
  assert.equal(carpetas.length, 2)
  for (const f of empresas) {
    const archivo = env.drive.hojasDeCalculo.get(f[8])
    assert.equal(archivo.carpeta.getId(), f[9]) // la hoja está dentro de la carpeta de su empresa
    assert.deepEqual([...env.libros.get(f[8]).hojas.keys()].sort(), ['Bitácora', 'Clientes', 'Configuración', 'Envíos WhatsApp', 'Fotos', 'Informes', 'Notificaciones', 'Plantillas WhatsApp', 'Visitas'])
  }
  // la principal solo tiene el índice de empresas y usuarios (y la bitácora de lo que no es de ninguna empresa)
  assert.ok([...env.principal.hojas.keys()].every((n) => ['Empresas', 'Usuarios', 'Bitácora'].includes(n)))

  const a = env.ok('visitas_create', { data: datosVisita({ cliente: 'Solo A' }) }, admin.token)
  const b = env.ok('visitas_create', { data: datosVisita({ cliente: 'Solo B', responsable: 'sofia' }) }, adminB.token)
  env.ok('fotos_upload', { visitaId: b.id, imagen: JPEG_B64, mini: MINI }, adminB.token)
  const clientes = (id) => env.hoja('Visitas', id).filas.slice(1).map((f) => f[3])
  assert.deepEqual(clientes(a.empresaId), ['Solo A'])
  assert.deepEqual(clientes(otra.id), ['Solo B'])
  assert.equal(env.hoja('Fotos', otra.id).filas.length, 2)
  assert.equal(env.hoja('Fotos', a.empresaId).filas.length, 1)
  const conFotos = carpetas.filter((c) => c.hijos.length)
  assert.deepEqual(conFotos.map((c) => c.nombre), ['Alarmas Norte'])
  assert.deepEqual(conFotos[0].hijos.map((c) => c.nombre), ['PABLO PRUEBA (pablo)'])
  assert.match(conFotos[0].hijos[0].hijos[0].nombre, /^\d{4}-\d{2}$/)
  assert.ok(env.hoja('Bitácora', otra.id).filas.every((f) => f[2] !== 'lucia'))
})

test('una versión anterior: el dueño pasa a root y los datos van a la hoja de la primera empresa', () => {
  const env = crearEntorno()
  const t = env.tablas
  const anterior = (nombre, tabla, columnas, filas) => {
    const h = env.principal.insertSheet(nombre)
    h.filas = [tabla.slice(0, columnas), ...filas]
  }
  // el dueño era un superadmin marcado como plataforma, con una empresa ya creada
  env.ok('login', { usuario: 'superadmin', clave: CLAVE_INICIAL })
  const usuarios = env.hoja('Usuarios')
  const col = (n) => t.USUARIOS.headers.indexOf(n)
  usuarios.filas[1][col('rol')] = 'superadmin'
  usuarios.filas[1][col('plataforma')] = true
  anterior('Visitas', [...t.VISITAS.headers], 16, [['v1', '2026-11-20', '09:00', 'Banco', 'Calle', '', 'Otro', 'superadmin', 'Programada', '- nota', 'superadmin', '2026-11-01T10:00:00', 'superadmin', '2026-11-01T10:00:00', '', '']])
  anterior('Configuración', ['clave', 'valor', 'modificadoPor', 'actualizado'], 4, [['empresa', JSON.stringify({ nombre: 'Ferrisel' }), 'superadmin', '']])
  env.avanzar(100000)
  env.propiedades.set('SUPERADMIN_CEDULA', CEDULA_ROOT)

  const { token, usuario } = env.ok('login', { usuario: 'superadmin', clave: CLAVE_INICIAL })
  assert.deepEqual([usuario.rol, usuario.empresaId], ['root', ''])
  const root = env.ok('cambiar_clave', { actual: CLAVE_INICIAL, nueva: NUEVA }, token).token
  const [empresa] = env.ok('empresas_list', {}, root)
  assert.equal(empresa.nombre, 'Ferrisel')
  assert.equal(env.principal.getSheetByName('Visitas').filas.length, 2) // el original sigue intacto

  // la empresa quedó sin superadministrador: el root lo crea
  assert.deepEqual(env.ok('empresas_admins', { id: empresa.id }, root), [])
  const r = env.ok('empresas_create_admin', { id: empresa.id, data: datosEmpresa('Ferrisel', 60) }, root)
  assert.equal(r.usuario, 'ferrisel')
  assert.match(env.llamar('empresas_create_admin', { id: empresa.id, data: datosEmpresa('Ferrisel', 62) }, root).error, /ya tiene/)
  const entrada = env.ok('login', { usuario: r.usuario, clave: r.clave }).token
  const sup = env.ok('cambiar_clave', { actual: r.clave, nueva: NUEVA }, entrada).token
  const sa = persona(env, sup, 'duenaferrisel', 'admin', 61).token
  const [v] = env.ok('visitas_list', {}, sa).items
  assert.deepEqual([v.id, v.notas, v.empresaId], ['v1', '- nota', empresa.id])
})

test('al cambiar el nombre de la empresa, su carpeta y su hoja lo toman', () => {
  const { env, otra } = dosEmpresas()
  env.ok('configuracion_update', { seccion: 'empresa', data: { nombre: 'Norte SA' } }, otra.token)
  const fila = env.hoja('Empresas').filas.slice(1).find((f) => f[0] === otra.id)
  assert.equal(env.drive.hojasDeCalculo.get(fila[8]).nombre, 'ServiTec - Norte SA')
  assert.ok(env.drive.raices[0].hijos.some((c) => c.nombre === 'Norte SA' && c.getId() === fila[9]))
})

test('los recordatorios y la limpieza recorren todas las empresas', () => {
  const { env, admin, adminB } = dosEmpresas()
  const d = new Date(Date.now() + 86400000)
  const manana = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  env.ok('visitas_create', { data: datosVisita({ fecha: manana }) }, admin.token)
  env.ok('visitas_create', { data: datosVisita({ fecha: manana, responsable: 'sofia' }) }, adminB.token)
  env.ejecutar('enviarRecordatorios')
  for (const f of env.hoja('Empresas').filas.slice(1)) assert.ok(env.hoja('Notificaciones', f[0]).filas.some((n) => n[2] === 'recordatorio'))
  env.ejecutar('limpiarNotificaciones')
  env.ejecutar('aplicarFormatos')
  env.ejecutar('registrarClientesExistentes')
})
