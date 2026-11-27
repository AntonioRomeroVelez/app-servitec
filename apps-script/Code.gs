/**
 * Backend de ServiTec (visitas e informes técnicos): Google Apps Script vinculado a una hoja de cálculo.
 * Publicar como Web App (Ejecutar como: Yo, Acceso: Cualquier persona).
 * El frontend envía POST con Content-Type text/plain para evitar preflight CORS.
 *
 * Hojas (se crean solas): "Empresas", "Usuarios", "Visitas", "Informes", "Fotos", "Clientes", entre otras.
 *
 * VARIAS EMPRESAS, cada una con SU hoja de cálculo y SU carpeta en Drive:
 *   ServiTec - Empresas / Nombre de la empresa / "ServiTec - Nombre" (hoja con Visitas, Informes, Fotos, Clientes,
 *   Notificaciones, Bitácora y Configuración) y, al lado, las fotos: Nombre (usuario) / AAAA-MM.
 * La hoja donde está este script es la PRINCIPAL: solo guarda "Empresas" y "Usuarios" (para poder iniciar sesión).
 * Nadie ve datos de otra empresa.
 * Roles (de arriba abajo):
 *  - root: dueño del sistema, sin empresa. Solo crea empresas, las habilita o deshabilita y ve a sus superadministradores.
 *  - superadmin: uno por empresa (se crea con ella; es el soporte). Es el ÚNICO que cambia datos, logo, colores, informes y
 *    tipos de visita de esa empresa, y crea al administrador dueño. No trabaja con visitas ni informes.
 *  - admin: el propietario de la empresa (el primero que crea el superadmin, cuenta protegida) y los que él cree. Gestionan
 *    visitas, informes y clientes, y crean, desactivan o eliminan administradores y técnicos. No ven a los superadmins.
 *  - tecnico: ve las visitas que le asignaron, cambia su estado y crea informes.
 *
 * RENDIMIENTO (pensado para muchos registros):
 *  - Las columnas pesadas (descripcion, checklist, firma, mini) van AL FINAL de cada hoja y los listados no las leen
 *    (`ligeras` = cuántas columnas iniciales son livianas). Solo se leen al abrir un registro (`*_get`).
 *  - Buscar por id lee solo la columna id y después una fila; nunca la hoja completa.
 *  - Los informes se paginan y filtran en el servidor; las visitas se piden por ventana de fechas.
 *  - La tabla de usuarios se guarda en caché (se invalida al modificarla).
 *  - Solo las escrituras toman el lock del script.
 *
 * NOTIFICACIONES: avisos en la app (hoja Notificaciones) y por correo (MailApp) ante asignaciones, cambios de estado,
 * informes finalizados y un recordatorio diario. Ejecutar instalarTriggers() una vez desde el editor.
 * IDEMPOTENCIA: los clientes pueden enviar el id de visitas, informes y fotos; repetir la creación no duplica.
 */
const FORMATO_FECHA = 'dd-MM-yyyy' // cómo se ve la fecha en el Sheet: 19-11-2026
const FORMATO_FECHA_HORA = 'dd-MM-yyyy HH:mm' // y fecha con hora: 19-11-2026 14:13

const VISITAS = {
  name: 'Visitas',
  headers: ['id', 'fecha', 'hora', 'cliente', 'direccion', 'telefono', 'tipo', 'responsable', 'estado', 'notas', 'autor', 'creado', 'modificadoPor', 'actualizado', 'motivo', 'clienteId', 'empresaId'],
  texto: ['hora', 'telefono'], // columnas en formato texto para que Sheets no las convierta
  formatos: { fecha: FORMATO_FECHA, creado: FORMATO_FECHA_HORA, actualizado: FORMATO_FECHA_HORA }, // fechas reales con formato legible
  ligeras: 17,
}
const INFORMES = {
  name: 'Informes',
  headers: ['id', 'fecha', 'cliente', 'titulo', 'tipo', 'estado', 'responsable', 'autor', 'creado', 'modificadoPor', 'actualizado', 'visitaId', 'numero', 'firmante', 'descripcion', 'checklist', 'firma', 'empresaId'],
  texto: ['numero'],
  formatos: { fecha: FORMATO_FECHA, creado: FORMATO_FECHA_HORA, actualizado: FORMATO_FECHA_HORA },
  ligeras: 14, // hasta 'firmante'; descripcion, checklist y firma son pesadas
}
const FOTOS = {
  name: 'Fotos',
  headers: ['id', 'visitaId', 'driveId', 'nombre', 'autor', 'creado', 'mini', 'empresaId'],
  formatos: { creado: FORMATO_FECHA_HORA },
  ligeras: 6, // 'mini' (miniatura en base64) es pesada
}
// Las columnas nuevas van SIEMPRE al final: en una hoja que ya tenía usuarios se agregan solas (completarColumnas_)
const USUARIOS = {
  name: 'Usuarios',
  global: true,
  headers: ['id', 'usuario', 'nombre', 'rol', 'salt', 'hash', 'activo', 'cambiarClave', 'sesion', 'correo', 'cedula', 'telefono', 'ciudad', 'direccion', 'cargo', 'autor', 'creado', 'modificadoPor', 'actualizado', 'empresaId', 'plataforma', 'eliminado', 'propietario'],
  texto: ['cedula', 'telefono'], // como texto: una cédula puede empezar con 0
  formatos: { creado: 'dd-MM-yyyy HH:mm', actualizado: 'dd-MM-yyyy HH:mm' },
}
const EMPRESAS = {
  name: 'Empresas',
  global: true,
  headers: ['id', 'nombre', 'plan', 'activa', 'autor', 'creado', 'modificadoPor', 'actualizado', 'hojaId', 'carpetaId'],
  formatos: { creado: 'dd-MM-yyyy HH:mm', actualizado: 'dd-MM-yyyy HH:mm' },
}
const PLANES = ['prueba', 'basico', 'pro']
const CAMPOS_PERSONA = ['nombre', 'cedula', 'correo', 'telefono', 'ciudad', 'direccion', 'cargo']
const CARPETA_RAIZ = 'ServiTec - Empresas' // se crea en el Drive de quien publica el script
const MAX_FOTOS_VISITA = 25
const MAX_BYTES_IMAGEN = 3 * 1024 * 1024 // la app envía ~0.2-0.5 MB; esto es solo un tope de seguridad
const RECURSOS = { informes: INFORMES, visitas: VISITAS }
const ROLES = ['tecnico', 'admin', 'superadmin'] // roles dentro de una empresa; 'root' no se asigna desde la app
const ROLES_DE_TRABAJO = ['tecnico', 'admin'] // quienes atienden visitas; lo que un administrador gestiona
const esRoot_ = (u) => u.rol === 'root'
// Un usuario eliminado conserva su fila (su nombre de usuario sigue en las visitas e informes y no se puede reutilizar)
const vigente_ = (u) => !esTrue_(u.eliminado)
const ESTADOS_VISITA = ['Programada', 'Aceptada', 'En curso', 'Realizada', 'Cancelada']
// Cambios de estado que puede hacer un técnico (un administrador puede poner cualquiera)
const TRANSICIONES_TECNICO = { Programada: ['Aceptada', 'Cancelada'], Aceptada: ['En curso', 'Cancelada'], 'En curso': ['Realizada', 'Cancelada'] }
const ESTADOS_CON_INFORME = ['Aceptada', 'En curso', 'Realizada'] // el técnico crea informes solo desde estos estados
const MAX_TOKEN = 100 // los de esta app miden 72 caracteres
const TOKEN_TTL = 21600 // segundos (máximo de CacheService: 6 h)
const USUARIOS_TTL = 300 // caché de la tabla de usuarios (se invalida al modificarla)

// Seguridad del login
const MAX_INTENTOS = 5 // fallos seguidos por usuario antes de bloquear
const BLOQUEO_SEG = 900 // 15 min (se renueva con cada nuevo fallo)
const HASH_RONDAS = 600 // rondas de SHA-256 por clave: encarece los ataques de fuerza bruta si se filtra la hoja

// Se usa SOLO para crear el primer superadmin cuando la hoja Usuarios está vacía. Es una clave temporal.
const SUPERADMIN_INICIAL = { usuario: 'superadmin', nombre: 'Super Admin', clave: 'Ferisel2026!' }

// ---------- utilidades ----------
function fail_(msg, code) {
  const e = new Error(msg)
  e.code = code || ''
  return e
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)
}

let EMPRESA_ACTUAL = '' // empresa cuyos datos se están leyendo o escribiendo (la de la sesión)
const LIBROS = {} // hojas de cálculo ya abiertas en esta ejecución, por id de empresa

function enEmpresa_(empresaId, fn) {
  const previa = EMPRESA_ACTUAL
  EMPRESA_ACTUAL = empresaId
  try {
    return fn()
  } finally {
    EMPRESA_ACTUAL = previa
  }
}

// Hoja de cálculo donde vive una tabla: Empresas y Usuarios en la principal; el resto, en la de la empresa actual
function libro_(t) {
  if (t.global || (t.sinEmpresa && !EMPRESA_ACTUAL)) return SpreadsheetApp.getActiveSpreadsheet()
  if (!EMPRESA_ACTUAL) throw fail_('No se indicó la empresa de los datos')
  if (!LIBROS[EMPRESA_ACTUAL]) {
    const empresa = empresaPorId_(EMPRESA_ACTUAL)
    if (!empresa || !empresa.hojaId) throw fail_('La empresa no tiene hoja de datos')
    LIBROS[EMPRESA_ACTUAL] = SpreadsheetApp.openById(empresa.hojaId)
  }
  return LIBROS[EMPRESA_ACTUAL]
}

function tabla_(t, libro) {
  const ss = libro || libro_(t)
  let sh = ss.getSheetByName(t.name)
  if (!sh) {
    sh = ss.insertSheet(t.name)
    ss.setSpreadsheetTimeZone(Session.getScriptTimeZone()) // la hoja muestra las horas en la misma zona que el script
    sh.appendRow(t.headers)
    sh.setFrozenRows(1)
    ;(t.texto || []).forEach((h) => sh.getRange(1, t.headers.indexOf(h) + 1, sh.getMaxRows(), 1).setNumberFormat('@'))
    Object.keys(t.formatos || {}).forEach((h) => sh.getRange(1, t.headers.indexOf(h) + 1, sh.getMaxRows(), 1).setNumberFormat(t.formatos[h]))
  }
  return sh
}

// Agrega al final de una hoja ya existente los encabezados que le falten. Nunca pisa un encabezado distinto.
function completarColumnas_(t) {
  const sh = tabla_(t)
  const actuales = sh.getRange(1, 1, 1, t.headers.length).getValues()[0]
  t.headers.forEach((h, i) => {
    if (actuales[i] === h) return
    if (actuales[i] !== '') throw fail_('La hoja ' + t.name + ' tiene la columna "' + actuales[i] + '" donde se esperaba "' + h + '". Muévela al final o elimínala.')
    const formato = (t.texto || []).indexOf(h) >= 0 ? '@' : (t.formatos || {})[h]
    if (formato) sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat(formato)
    sh.getRange(1, i + 1, 1, 1).setValue(h)
  })
}

function aObjeto_(t, valores, fila, n, tz) {
  const o = { _row: fila }
  for (let j = 0; j < n; j++) {
    const h = t.headers[j]
    let v = valores[j]
    if (v instanceof Date) {
      const fmt = h === 'fecha' ? 'yyyy-MM-dd' : h === 'hora' ? 'HH:mm' : "yyyy-MM-dd'T'HH:mm:ss"
      v = Utilities.formatDate(v, tz, fmt)
    }
    o[h] = v
  }
  return o
}

// Lee la tabla. Con `ligero` solo las columnas livianas (las primeras `t.ligeras`): es lo que usan los listados.
function leer_(t, ligero) {
  const sh = tabla_(t)
  const last = sh.getLastRow()
  if (last < 2) return []
  const n = ligero ? t.ligeras || t.headers.length : t.headers.length
  const tz = Session.getScriptTimeZone()
  const filas = sh.getRange(2, 1, last - 1, n).getValues().map((r, i) => aObjeto_(t, r, i + 2, n, tz))
  // En las tablas con columnas pesadas `empresaId` queda detrás de ellas: se lee aparte (hace falta para filtrar)
  const e = t.headers.indexOf('empresaId')
  if (e >= n) sh.getRange(2, e + 1, last - 1, 1).getValues().forEach((r, i) => (filas[i].empresaId = r[0]))
  return filas
}

// Valores de una sola columna (filas 2..última)
function columna_(t, nombre) {
  const sh = tabla_(t)
  const last = sh.getLastRow()
  if (last < 2) return []
  return sh.getRange(2, t.headers.indexOf(nombre) + 1, last - 1, 1).getValues().map((r) => r[0])
}

// Una fila completa (con las columnas pesadas)
function leerFila_(t, fila) {
  const n = t.headers.length
  return aObjeto_(t, tabla_(t).getRange(fila, 1, 1, n).getValues()[0], fila, n, Session.getScriptTimeZone())
}

// Busca por id leyendo solo la columna id; devuelve la fila completa o null
function filaPorId_(t, id) {
  const i = columna_(t, 'id').indexOf(String(id))
  return i < 0 ? null : leerFila_(t, i + 2)
}

// Las columnas con formato de fecha se escriben como fechas reales (así Sheets las muestra como 19-11-2026 14:13 y se pueden
// ordenar y filtrar). Al leer, aObjeto_ las devuelve como texto 'yyyy-MM-dd' / 'yyyy-MM-ddTHH:mm:ss', igual que antes.
function celda_(t, h, v) {
  if (v === undefined || v === null) return ''
  // Un texto que empieza con = + - o ' se guarda con apóstrofo (Sheets no lo muestra): así no se convierte en fórmula
  if (typeof v === 'string' && /^[=+\-']/.test(v) && (t.texto || []).indexOf(h) < 0) return "'" + v
  const formato = t.formatos && t.formatos[h]
  if (!formato || v === '' || typeof v !== 'string') return v
  if (formato.indexOf('HH') >= 0) {
    const d = new Date(v) // ISO con o sin zona; sin zona se interpreta en la zona del script
    return isNaN(d.getTime()) ? v : d
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : v
}

function escribir_(t, fila, obj) {
  tabla_(t).getRange(fila, 1, 1, t.headers.length).setValues([t.headers.map((h) => celda_(t, h, obj[h]))])
}

function agregar_(t, obj) {
  tabla_(t).appendRow(t.headers.map((h) => celda_(t, h, obj[h])))
}

// Formato "v2:<hex>": SHA-256 con sal propia del usuario, repetido HASH_RONDAS veces
function hash_(salt, clave) {
  const base = Utilities.newBlob(salt + clave).getBytes()
  let h = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, base)
  for (let i = 0; i < HASH_RONDAS; i++) h = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h.concat(base))
  return 'v2:' + h.map((b) => ('0' + (b & 0xff).toString(16)).slice(-2)).join('')
}

// Comparación en tiempo constante. Con usuario inexistente se hace el mismo trabajo para no revelar si existe.
function claveCorrecta_(u, clave) {
  const hash = hash_(u ? u.salt : 'sin-usuario', clave)
  const esperado = u ? String(u.hash) : 'v2:'
  let dif = hash.length ^ esperado.length
  for (let i = 0; i < hash.length; i++) dif |= hash.charCodeAt(i) ^ (esperado.charCodeAt(i) || 0)
  return !!u && dif === 0
}

// Política de claves: mínimo 10 caracteres, con letras y números, sin contener el usuario
function validarClave_(clave, usuario) {
  const c = String(clave || '')
  if (c.length < 10) throw fail_('La clave debe tener al menos 10 caracteres')
  if (!/[A-Za-z]/.test(c) || !/[0-9]/.test(c)) throw fail_('La clave debe incluir letras y números')
  if (usuario && c.toLowerCase().indexOf(String(usuario).toLowerCase()) >= 0) throw fail_('La clave no debe contener el nombre de usuario')
}

const limpiar_ = (o) => {
  const c = Object.assign({}, o)
  delete c._row
  return c
}
const publico_ = (u) => {
  const c = limpiar_(u)
  delete c.salt
  delete c.hash
  delete c.sesion
  c.cambiarClave = esTrue_(u.cambiarClave)
  c.propietario = esTrue_(u.propietario)
  c.plataforma = esRoot_(u) // la app muestra la sección Empresas a quien tiene esta marca
  return c
}
const esTrue_ = (v) => v === true || v === 'TRUE' || v === 'true'
const esActivo_ = (u) => esTrue_(u.activo)
// Versión de sesión: al cambiar/restablecer la clave sube y los tokens anteriores dejan de valer
const sesion_ = (u) => Number(u.sesion) || 0

// `actor` es quien crea la cuenta: queda en las columnas autor y modificadoPor
function nuevoUsuario_(d, actor) {
  const salt = Utilities.getUuid()
  const ahora = new Date().toISOString()
  // cambiarClave: la clave inicial/temporal debe cambiarse en el primer ingreso
  const u = { id: Utilities.getUuid(), usuario: d.usuario, rol: d.rol, salt: salt, hash: hash_(salt, d.clave), activo: true, cambiarClave: true, sesion: 0 }
  CAMPOS_PERSONA.forEach((c) => (u[c] = d[c] || ''))
  return Object.assign(u, { autor: actor, creado: ahora, modificadoPor: actor, actualizado: ahora, empresaId: d.empresaId || '', plataforma: !!d.plataforma, propietario: !!d.propietario })
}

// ---------- Usuarios (con caché) ----------
// Se consulta en CADA petición (para validar la sesión), por eso se guarda en CacheService. Toda escritura la invalida.
const olvidarUsuarios_ = () => CacheService.getScriptCache().remove('usuarios')

function escribirUsuario_(fila, u) {
  escribir_(USUARIOS, fila, u)
  olvidarUsuarios_()
}

function agregarUsuario_(u) {
  agregar_(USUARIOS, u)
  olvidarUsuarios_()
}

// Si la hoja está vacía crea el superadmin inicial (con su propio lock, antes del lock de escritura)
function usuarios_() {
  const cache = CacheService.getScriptCache()
  const guardado = cache.get('usuarios')
  if (guardado) {
    try {
      return JSON.parse(guardado)
    } catch (e) {}
  }
  completarColumnas_(USUARIOS)
  let us = leer_(USUARIOS)
  const falta = () =>
    !us.length || (!us.some(esRoot_) && us.some((u) => u.rol === 'superadmin')) || us.some((u) => !esRoot_(u) && !u.empresaId)
  if (falta()) {
    const lock = LockService.getScriptLock()
    lock.waitLock(10000)
    try {
      us = leer_(USUARIOS)
      if (falta()) {
        migrarEmpresas_()
        if (!leer_(USUARIOS).length) {
          const cedula = String(PropertiesService.getScriptProperties().getProperty('SUPERADMIN_CEDULA') || '').trim()
          agregarUsuario_(nuevoUsuario_(Object.assign({ rol: 'root', cedula: cedula }, SUPERADMIN_INICIAL), 'Sistema'))
          registrar_('Sistema', '', 'Usuario inicial creado', SUPERADMIN_INICIAL.usuario + ' (root, clave temporal)', 'usuario:' + SUPERADMIN_INICIAL.usuario)
        }
        us = leer_(USUARIOS)
      }
    } finally {
      lock.releaseLock()
    }
  }
  const texto = JSON.stringify(us)
  if (texto.length < 90000) cache.put('usuarios', texto, USUARIOS_TTL) // CacheService admite 100 KB por clave
  return us
}

// ---------- Empresas ----------
function empresas_() {
  const cache = CacheService.getScriptCache()
  const guardado = cache.get('empresas')
  if (guardado) {
    try {
      return JSON.parse(guardado)
    } catch (e) {}
  }
  const lista = leer_(EMPRESAS)
  const texto = JSON.stringify(lista)
  if (texto.length < 90000) cache.put('empresas', texto, USUARIOS_TTL)
  return lista
}
const olvidarEmpresas_ = () => CacheService.getScriptCache().remove('empresas')
const empresaPorId_ = (id) => empresas_().filter((e) => e.id === id)[0]
const empresaActiva_ = (id) => {
  const e = empresaPorId_(id)
  return !!e && esTrue_(e.activa)
}

const TABLAS_DE_EMPRESA = () => [VISITAS, INFORMES, FOTOS, CLIENTES, NOTIFICACIONES, BITACORA, CONFIGURACION]

// Crea la carpeta de la empresa en Drive y, dentro, su hoja de cálculo con todas las pestañas
function crearLibroEmpresa_(nombre) {
  const carpeta = carpetaRaiz_().createFolder(nombre)
  const libro = SpreadsheetApp.create('ServiTec - ' + nombre)
  DriveApp.getFileById(libro.getId()).moveTo(carpeta)
  const iniciales = libro.getSheets()
  TABLAS_DE_EMPRESA().forEach((t) => tabla_(t, libro))
  iniciales.forEach((sh) => libro.deleteSheet(sh)) // la pestaña vacía con la que nace toda hoja nueva
  return { libro: libro, carpetaId: carpeta.getId() }
}

// `preparar(libro, id)` carga datos en la hoja nueva ANTES de registrar la empresa: si algo falla, no queda a medias
function agregarEmpresa_(nombre, plan, actor, preparar) {
  const ahora = new Date().toISOString()
  const id = Utilities.getUuid()
  const creada = crearLibroEmpresa_(nombre)
  if (preparar) preparar(creada.libro, id)
  const empresa = { id: id, nombre: nombre, plan: plan, activa: true, autor: actor, creado: ahora, modificadoPor: actor, actualizado: ahora, hojaId: creada.libro.getId(), carpetaId: creada.carpetaId }
  agregar_(EMPRESAS, empresa)
  olvidarEmpresas_()
  return empresa
}

// Copia a la hoja de la primera empresa los datos que una versión anterior guardaba en la principal. No borra el original.
function copiarDatosAnteriores_(libro, empresaId) {
  const principal = SpreadsheetApp.getActiveSpreadsheet()
  const tz = Session.getScriptTimeZone()
  TABLAS_DE_EMPRESA().forEach((t) => {
    const origen = principal.getSheetByName(t.name)
    if (!origen || origen.getLastRow() < 2) return
    const n = t.headers.length
    const filas = origen.getRange(2, 1, origen.getLastRow() - 1, n).getValues().map((fila) =>
      t.headers.map((h, j) => {
        if (h === 'empresaId') return empresaId
        // las fechas se copian tal cual; el texto pasa por celda_ para que no se convierta en fórmula
        return fila[j] instanceof Date ? fila[j] : celda_(t, h, fila[j])
      }),
    )
    const destino = tabla_(t, libro)
    const faltan = filas.length + 1 - destino.getMaxRows()
    if (faltan > 0) destino.insertRowsAfter(destino.getMaxRows(), faltan)
    destino.getRange(2, 1, filas.length, n).setValues(filas)
  })
}

// ¿La hoja principal tiene datos de una versión que guardaba todo junto?
const hayDatosAnteriores_ = () =>
  [VISITAS, INFORMES, CLIENTES].some((t) => {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(t.name)
    return !!sh && sh.getLastRow() > 1
  })

/**
 * Prepara la hoja principal (se llama con el lock tomado; repetirla no duplica nada):
 *  - si no hay root, convierte en root al dueño anterior (marca `plataforma`), al de SUPERADMIN_USUARIO o al primer superadmin;
 *  - si quedan usuarios sin empresa o datos de una versión anterior, crea la primera empresa (con su hoja y su carpeta),
 *    copia allí esos datos y le asigna esos usuarios.
 */
function migrarEmpresas_() {
  completarColumnas_(USUARIOS)
  completarColumnas_(EMPRESAS)
  const celda = (fila, columna) => tabla_(USUARIOS).getRange(fila, USUARIOS.headers.indexOf(columna) + 1, 1, 1)
  let us = leer_(USUARIOS)
  if (us.length && !us.some(esRoot_)) {
    const preferido = String(PropertiesService.getScriptProperties().getProperty('SUPERADMIN_USUARIO') || '').trim().toLowerCase()
    const supers = us.filter((u) => u.rol === 'superadmin')
    const dueno = supers.filter((u) => esTrue_(u.plataforma))[0] || supers.filter((u) => u.usuario === preferido)[0] || supers[0]
    if (dueno) {
      celda(dueno._row, 'rol').setValue('root')
      celda(dueno._row, 'empresaId').setValue('')
    }
    us = leer_(USUARIOS)
  }
  const sinEmpresa = us.filter((u) => !esRoot_(u) && !u.empresaId)
  let empresa = leer_(EMPRESAS)[0]
  if (!empresa && (sinEmpresa.length || hayDatosAnteriores_())) {
    let nombre = String(PropertiesService.getScriptProperties().getProperty('SUPERADMIN_EMPRESA') || '').trim()
    const anterior = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIGURACION.name)
    if (!nombre && anterior && anterior.getLastRow() > 1) {
      anterior.getRange(2, 1, anterior.getLastRow() - 1, 2).getValues().forEach((f) => {
        if (f[0] !== 'empresa') return
        try {
          nombre = JSON.parse(f[1]).nombre
        } catch (e) {}
      })
    }
    empresa = agregarEmpresa_(nombre || CONFIG_DEFECTO.empresa.nombre, 'prueba', 'Sistema', copiarDatosAnteriores_)
  }
  sinEmpresa.forEach((u) => celda(u._row, 'empresaId').setValue(empresa.id))
  olvidarUsuarios_()
}

// ---------- Visibilidad por rol ----------
// Nadie ve datos de otra empresa. Dentro de la suya:
//  - admin: todas las visitas e informes.
//  - técnico: las visitas que tiene asignadas (responsable = su usuario) y los informes que creó.
const esGestor_ = (u) => u.rol === 'admin'

function puedeVer_(recurso, item, yo) {
  if (item.empresaId !== yo.empresaId) return false
  if (esGestor_(yo)) return true
  return recurso === 'visitas' ? item.responsable === yo.usuario : item.autor === yo.usuario
}

function visitaAccesible_(id, yo) {
  const v = filaPorId_(VISITAS, id)
  if (!v || !puedeVer_('visitas', v, yo)) throw fail_('Visita no encontrada')
  return v
}

// ---------- Fotos (Drive) ----------
// Estructura: <CARPETA_RAIZ> / <Nombre de la empresa> / <Nombre (usuario)> / <AAAA-MM de la visita> / <fecha_cliente_xxxxxx.jpg>
// Los archivos quedan privados en Drive; la app los lee a través de este script (fotos_get) con control de permisos.
function carpetaRaiz_() {
  const props = PropertiesService.getScriptProperties()
  const id = props.getProperty('CARPETA_EMPRESAS_ID')
  if (id) {
    try {
      const f = DriveApp.getFolderById(id)
      if (!f.isTrashed()) return f
    } catch (e) {}
  }
  const it = DriveApp.getFoldersByName(CARPETA_RAIZ)
  const f = it.hasNext() ? it.next() : DriveApp.createFolder(CARPETA_RAIZ)
  props.setProperty('CARPETA_EMPRESAS_ID', f.getId())
  return f
}

function subcarpeta_(padre, nombre) {
  const it = padre.getFoldersByName(nombre)
  return it.hasNext() ? it.next() : padre.createFolder(nombre)
}

// Dentro de la carpeta de la empresa, una por usuario (quien sube la foto). Se identifica por el sufijo "(usuario)": renombrar no duplica.
function carpetaUsuario_(yo) {
  const empresa = DriveApp.getFolderById(empresaPorId_(yo.empresaId).carpetaId)
  const sufijo = '(' + yo.usuario + ')'
  const it = empresa.getFolders()
  while (it.hasNext()) {
    const f = it.next()
    if (f.getName().slice(-sufijo.length) === sufijo) return f
  }
  return empresa.createFolder(yo.nombre + ' ' + sufijo)
}

const slug_ = (s) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'visita'

const fotoPublica_ = (f) => ({ id: f.id, visitaId: f.visitaId, nombre: f.nombre, mini: f.mini, autor: f.autor, creado: f.creado })

// Números de fila de las fotos de una visita (lee solo la columna visitaId)
function filasFotos_(visitaId) {
  const filas = []
  columna_(FOTOS, 'visitaId').forEach((v, i) => {
    if (v === visitaId) filas.push(i + 2)
  })
  return filas
}

function fotos_(op, req, yo) {
  if (op === 'list') {
    visitaAccesible_(req.visitaId, yo)
    return filasFotos_(req.visitaId).map((f) => fotoPublica_(leerFila_(FOTOS, f)))
  }

  if (op === 'upload') {
    // El cliente genera el id de la foto: si una subida se repite (se perdió la respuesta, modo sin conexión) no se duplica
    const idFoto = UUID_RE.test(String(req.id || '')) ? String(req.id) : ''
    if (idFoto) {
      const previa = filaPorId_(FOTOS, idFoto)
      if (previa) {
        if (previa.autor !== yo.usuario) throw fail_('Identificador en uso')
        return fotoPublica_(previa)
      }
    }
    const v = visitaAccesible_(req.visitaId, yo)
    if (yo.rol === 'tecnico' && ESTADOS_CON_INFORME.indexOf(v.estado) < 0) throw fail_('Acepta la visita antes de cargar fotos')
    if (filasFotos_(v.id).length >= MAX_FOTOS_VISITA) throw fail_('Máximo ' + MAX_FOTOS_VISITA + ' fotos por visita')

    const b64 = String(req.imagen || '')
    if (b64.indexOf('/9j/') !== 0) throw fail_('La imagen debe ser JPEG') // firma de archivo JPEG en base64
    if (b64.length > (MAX_BYTES_IMAGEN * 4) / 3) throw fail_('La imagen es demasiado grande')
    const mini = String(req.mini || '')
    if (mini.indexOf('data:image/jpeg;base64,') !== 0 || mini.length > 45000) throw fail_('Miniatura inválida')

    const carpeta = subcarpeta_(carpetaUsuario_(yo), String(v.fecha).slice(0, 7))
    const nombre = v.fecha + '_' + slug_(v.cliente) + '_' + Utilities.getUuid().slice(0, 6) + '.jpg'
    const archivo = carpeta.createFile(Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg', nombre))
    const foto = { id: idFoto || Utilities.getUuid(), visitaId: v.id, driveId: archivo.getId(), nombre: nombre, mini: mini, autor: yo.usuario, creado: new Date().toISOString(), empresaId: yo.empresaId }
    agregar_(FOTOS, foto)
    registrar_(yo.usuario, yo.rol, 'Foto subida', v.cliente + ' (' + fechaCorta_(v.fecha) + ')', 'visita:' + v.id)
    return fotoPublica_(foto)
  }

  const f = filaPorId_(FOTOS, req.id)
  if (!f) throw fail_('Foto no encontrada')
  visitaAccesible_(f.visitaId, yo)

  if (op === 'get') {
    const bytes = DriveApp.getFileById(f.driveId).getBlob().getBytes()
    return { dataUrl: 'data:image/jpeg;base64,' + Utilities.base64Encode(bytes) }
  }

  // delete: quien la subió o un administrador de la empresa
  if (!esGestor_(yo) && f.autor !== yo.usuario) throw fail_('Sin permisos', 'FORBIDDEN')
  try {
    DriveApp.getFileById(f.driveId).setTrashed(true) // va a la papelera de Drive (recuperable)
  } catch (e) {}
  tabla_(FOTOS).deleteRow(f._row)
  registrar_(yo.usuario, yo.rol, 'Foto eliminada', f.nombre, 'visita:' + f.visitaId)
  return true
}

// Al eliminar una visita: sus fotos van a la papelera de Drive y se borran sus registros
function eliminarFotosDeVisita_(visitaId) {
  const sh = tabla_(FOTOS)
  const filas = filasFotos_(visitaId)
  const colDrive = FOTOS.headers.indexOf('driveId') + 1
  filas.forEach((r) => {
    try {
      DriveApp.getFileById(sh.getRange(r, colDrive, 1, 1).getValues()[0][0]).setTrashed(true)
    } catch (e) {} // si el archivo ya no existe, se sigue con el registro
  })
  filas.sort((a, b) => b - a).forEach((r) => sh.deleteRow(r))
}

// ---------- Bitácora y formatos de fecha ----------
// Cada acción deja un registro en la hoja "Bitácora": fecha (19-11-2026), hora (14:13), usuario, rol, acción y detalle.
// Además cada registro guarda quién lo creó (autor) y quién lo modificó por última vez (modificadoPor). Las fechas y horas
// son fechas reales de Sheets mostradas como 19-11-2026 14:13 (se pueden ordenar y filtrar), no texto.
const BITACORA = { name: 'Bitácora', sinEmpresa: true, headers: ['fecha', 'hora', 'usuario', 'rol', 'accion', 'detalle', 'ref', 'empresaId'], formatos: { fecha: FORMATO_FECHA }, texto: ['hora'] }

// La bitácora nunca debe impedir la operación que registra
function registrar_(usuario, rol, accion, detalle, ref, empresaId) {
  try {
    const ahora = new Date()
    const tz = Session.getScriptTimeZone()
    const destino = empresaId || EMPRESA_ACTUAL
    enEmpresa_(destino, () =>
      agregar_(BITACORA, {
        fecha: Utilities.formatDate(ahora, tz, 'yyyy-MM-dd'),
        hora: Utilities.formatDate(ahora, tz, 'HH:mm'),
        usuario: usuario,
        rol: rol || '',
        accion: accion,
        detalle: String(detalle || '').slice(0, 500),
        ref: ref || '',
        empresaId: destino,
      }),
    )
  } catch (e) {}
}

const CAMPOS_REGISTRO = {
  visitas: { fecha: 'Fecha', hora: 'Hora', cliente: 'Cliente', direccion: 'Dirección', telefono: 'Teléfono', tipo: 'Tipo', responsable: 'Técnico', estado: 'Estado', notas: 'Notas', motivo: 'Motivo' },
  informes: { fecha: 'Fecha', cliente: 'Cliente', titulo: 'Título', tipo: 'Tipo', estado: 'Estado', responsable: 'Responsable', firmante: 'Firmante' },
  clientes: { nombre: 'Nombre', direccion: 'Dirección', telefono: 'Teléfono' },
}
const CAMPOS_LARGOS = { informes: { descripcion: 'observaciones', checklist: 'checklist', firma: 'firma' } }

// "Estado: de Programada a Aceptada; Hora: de 09:00 a 15:30" (campos largos: solo se indica que cambiaron)
function cambios_(nombre, cur, item) {
  const out = []
  const ver = (c, v) => {
    const s = v === undefined || v === null || v === '' ? '—' : String(v)
    return c === 'fecha' ? fechaCorta_(s) : s
  }
  Object.keys(CAMPOS_REGISTRO[nombre]).forEach((c) => {
    if (String(cur[c] || '') !== String(item[c] || '')) out.push(CAMPOS_REGISTRO[nombre][c] + ': de ' + ver(c, cur[c]) + ' a ' + ver(c, item[c]))
  })
  const largos = CAMPOS_LARGOS[nombre] || {}
  const modificados = Object.keys(largos).filter((c) => String(cur[c] || '') !== String(item[c] || '')).map((c) => largos[c])
  if (modificados.length) out.push('Cambió: ' + modificados.join(', '))
  return out.join('; ')
}

const etiquetaRegistro_ = (nombre, r) =>
  nombre === 'visitas' ? r.cliente + ' (' + fechaCorta_(r.fecha) + ' ' + r.hora + ')' : (r.numero || 'sin número') + ' · ' + r.cliente

// Ejecutar UNA vez desde el editor si ya había hojas creadas: aplica el formato 19-11-2026 14:13, convierte el texto que ya
// hubiera en esas columnas a fechas reales y deja la hoja en la misma zona horaria que el script.
function aplicarFormatos() {
  const tz = Session.getScriptTimeZone()
  let columnas = 0
  const aplicar = (t) => {
    if (t !== NOTIFICACIONES) completarColumnas_(t)
    const sh = tabla_(t)
    const ultima = sh.getLastRow()
    Object.keys(t.formatos || {}).forEach((h) => {
      const col = t.headers.indexOf(h) + 1
      sh.getRange(1, col, sh.getMaxRows(), 1).setNumberFormat(t.formatos[h])
      if (ultima >= 2) {
        const rango = sh.getRange(2, col, ultima - 1, 1)
        rango.setValues(rango.getValues().map((v) => [celda_(t, h, v[0])]))
      }
      columnas++
    })
  }
  olvidarUsuarios_()
  usuarios_() // prepara la hoja principal si viene de una versión anterior
  SpreadsheetApp.getActiveSpreadsheet().setSpreadsheetTimeZone(tz)
  ;[EMPRESAS, USUARIOS].forEach(aplicar)
  empresas_().forEach((e) =>
    enEmpresa_(e.id, () => {
      libro_(VISITAS).setSpreadsheetTimeZone(tz)
      TABLAS_DE_EMPRESA().forEach(aplicar)
    }),
  )
  olvidarUsuarios_()
  olvidarEmpresas_()
  Logger.log('Formatos de fecha aplicados a ' + columnas + ' columnas. Zona horaria de las hojas: ' + tz)
}

// ---------- Configuración (personalización por el superadministrador del sistema) ----------
// Cada empresa tiene la suya y solo el superadministrador del sistema la cambia: datos de la empresa, colores, logo, prefijo del número de informe, qué se imprime en el
// PDF y los tipos de visita con su checklist. Se guarda en la hoja "Configuración" (una fila por empresa y sección). Antes de
// iniciar sesión, la pantalla de ingreso recibe la marca de la empresa que indique el dispositivo (ver marcaPublica_).
const CONFIGURACION = { name: 'Configuración', headers: ['clave', 'valor', 'modificadoPor', 'actualizado', 'empresaId'], texto: ['valor'], formatos: { actualizado: FORMATO_FECHA_HORA } }
const HEX_RE = /^#[0-9a-f]{6}$/
const MAX_LOGO = 45000 // caracteres del data URL (una celda de Sheets admite 50.000)
const IMAGENES_CONFIG = ['logo', 'logoClaro', 'fondoImagen'] // secciones que guardan una imagen (data URL) tal cual
const FONDOS_INGRESO = ['degradado', 'solido', 'foto']
const NOMBRES_CONFIG = { empresa: 'Datos de la empresa', tema: 'Colores', logo: 'Logo', logoClaro: 'Logo para fondos oscuros', fondoImagen: 'Foto de ingreso', informes: 'Informes', tipos: 'Tipos de visita y checklists' }

// Mismos valores que src/configuracion.js (hay una prueba que comprueba que no se desincronicen)
const CONFIG_DEFECTO = {
  empresa: { nombre: 'ServiTec', subtitulo: '', ruc: '', direccion: '', telefono: '', correo: '', web: '', pie: '' },
  tema: { primario: '#1565d8', acento: '#f6c915', encabezado: '', fondo: 'degradado' },
  logo: '',
  logoClaro: '',
  fondoImagen: '',
  informes: { prefijo: 'INF', pdfChecklist: true, pdfFotos: true, pdfFirma: true, pdfObservaciones: true },
  tipos: [
    { nombre: 'Visita técnica', checklist: ['Estado general de las cámaras', 'Imagen y enfoque de cada cámara', 'Estado del grabador (DVR/NVR)', 'Almacenamiento y grabaciones', 'Cableado y conectores', 'Alimentación eléctrica / UPS', 'Acceso remoto (app / red)'] },
    { nombre: 'Inspección', checklist: ['Cobertura de cámaras y puntos ciegos', 'Estado de sensores y alarmas', 'Panel de control y sirena', 'Iluminación en zonas vigiladas', 'Señalización de seguridad'] },
    { nombre: 'Mantenimiento', checklist: ['Limpieza de lentes y carcasas', 'Revisión de fijaciones y soportes', 'Prueba de grabación y reproducción', 'Actualización de firmware', 'Prueba de alarma y notificaciones', 'Respaldo de configuración'] },
    { nombre: 'Incidente', checklist: ['Evento verificado con el cliente', 'Grabaciones del evento revisadas', 'Equipos afectados identificados', 'Acción correctiva realizada', 'Cliente informado'] },
    { nombre: 'Otro', checklist: [] },
  ],
}

// Contraste WCAG entre dos colores #rrggbb (4,5 o más = texto legible)
function luminancia_(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
function contraste_(a, b) {
  const l1 = luminancia_(a)
  const l2 = luminancia_(b)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

// Configuración vigente de una empresa = valores por defecto + lo guardado. En caché porque se pide en cada carga de la app.
function configuracion_(empresaId) {
  const cfg = JSON.parse(JSON.stringify(CONFIG_DEFECTO))
  if (!empresaId) return cfg
  const cache = CacheService.getScriptCache()
  const guardada = cache.get('config_' + empresaId)
  if (guardada) {
    try {
      return JSON.parse(guardada)
    } catch (e) {}
  }
  enEmpresa_(empresaId, () => leer_(CONFIGURACION)).forEach((f) => {
    if (f.empresaId !== empresaId) return
    try {
      if (IMAGENES_CONFIG.indexOf(f.clave) >= 0) cfg[f.clave] = String(f.valor || '')
      else if (f.clave === 'tipos') cfg.tipos = JSON.parse(f.valor)
      else if (CONFIG_DEFECTO[f.clave]) cfg[f.clave] = Object.assign({}, CONFIG_DEFECTO[f.clave], JSON.parse(f.valor))
    } catch (e) {} // una fila dañada se ignora y queda el valor por defecto
  })
  const texto = JSON.stringify(cfg)
  if (texto.length < 95000) cache.put('config_' + empresaId, texto, 300) // CacheService admite 100 KB por clave
  return cfg
}

// Valida una sección y devuelve el texto que se guarda en la hoja
function validarConfig_(seccion, d) {
  const txt = (v, max, nombre) => {
    const s = String(v === undefined || v === null ? '' : v).trim()
    if (s.length > max) throw fail_(nombre + ' es demasiado largo (máximo ' + max + ' caracteres)')
    return s
  }

  if (seccion === 'empresa') {
    const e = {
      nombre: txt(d.nombre, 60, 'El nombre'),
      subtitulo: txt(d.subtitulo, 60, 'El subtítulo'),
      ruc: txt(d.ruc, 30, 'El RUC'),
      direccion: txt(d.direccion, 160, 'La dirección'),
      telefono: txt(d.telefono, 40, 'El teléfono'),
      correo: txt(d.correo, 120, 'El correo'),
      web: txt(d.web, 120, 'El sitio web'),
      pie: txt(d.pie, 300, 'El pie de página'),
    }
    if (!e.nombre) throw fail_('Escribe el nombre de la empresa')
    if (e.correo && !CORREO_RE.test(e.correo)) throw fail_('Correo inválido')
    return JSON.stringify(e)
  }

  if (seccion === 'tema') {
    const t = { primario: String(d.primario || '').trim().toLowerCase(), acento: String(d.acento || '').trim().toLowerCase() }
    if (!HEX_RE.test(t.primario) || !HEX_RE.test(t.acento)) throw fail_('Los colores deben tener el formato #RRGGBB')
    if (contraste_(t.primario, '#ffffff') < 4.5) throw fail_('El color principal es demasiado claro: el texto blanco no se leería. Elige uno más oscuro.')
    t.encabezado = String(d.encabezado || '').trim().toLowerCase() // vacío = se calcula del color principal
    if (t.encabezado && !HEX_RE.test(t.encabezado)) throw fail_('Los colores deben tener el formato #RRGGBB')
    if (t.encabezado && contraste_(t.encabezado, '#ffffff') < 4.5) throw fail_('El color del encabezado es demasiado claro: el texto blanco no se leería. Elige uno más oscuro.')
    t.fondo = d.fondo || 'degradado'
    if (FONDOS_INGRESO.indexOf(t.fondo) < 0) throw fail_('Fondo de ingreso inválido')
    return JSON.stringify(t)
  }

  if (IMAGENES_CONFIG.indexOf(seccion) >= 0) {
    const imagen = String(d[seccion] || '')
    const nombre = seccion === 'fondoImagen' ? 'La foto' : 'El logo'
    if (imagen && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/.test(imagen)) throw fail_(nombre + ' debe ser una imagen PNG, JPG o WebP')
    if (imagen.length > MAX_LOGO) throw fail_(nombre + ' es demasiado ' + (seccion === 'fondoImagen' ? 'pesada' : 'pesado'))
    return imagen
  }

  if (seccion === 'informes') {
    const i = {
      prefijo: String(d.prefijo || '').trim().toUpperCase(),
      pdfChecklist: !!d.pdfChecklist,
      pdfFotos: !!d.pdfFotos,
      pdfFirma: !!d.pdfFirma,
      pdfObservaciones: !!d.pdfObservaciones,
    }
    if (!/^[A-Z0-9]{2,6}$/.test(i.prefijo)) throw fail_('El prefijo del número debe tener de 2 a 6 letras o números (por ejemplo INF)')
    return JSON.stringify(i)
  }

  // tipos
  const tipos = Array.isArray(d.tipos) ? d.tipos : []
  if (tipos.length < 1 || tipos.length > 12) throw fail_('Debe haber entre 1 y 12 tipos de visita')
  const vistos = {}
  const limpios = tipos.map((t) => {
    const nombre = txt(t && t.nombre, 40, 'El nombre del tipo')
    if (!nombre) throw fail_('Cada tipo de visita necesita un nombre')
    const clave = normalizar_(nombre)
    if (vistos[clave]) throw fail_('Tipo de visita repetido: ' + nombre)
    vistos[clave] = true
    const lista = Array.isArray(t.checklist) ? t.checklist : []
    if (lista.length > 30) throw fail_('Máximo 30 ítems por checklist')
    return { nombre: nombre, checklist: lista.map((x) => txt(x, 100, 'Un ítem del checklist')).filter((x) => x) }
  })
  const texto = JSON.stringify(limpios)
  if (texto.length > MAX_LOGO) throw fail_('Los checklists son demasiado largos')
  return texto
}

// Lo único público de una empresa activa: sus datos, colores e imágenes de marca. El resto son los valores por defecto.
function marcaPublica_(empresaId) {
  const base = configuracion_('')
  if (!empresaId || !empresaActiva_(empresaId)) return base
  const c = configuracion_(empresaId)
  return Object.assign(base, { empresa: c.empresa, tema: c.tema, logo: c.logo, logoClaro: c.logoClaro, fondoImagen: c.fondoImagen })
}

// Escribe (o borra, con valor null) la fila de una sección en la hoja de una empresa
function escribirSeccion_(empresaId, seccion, valor, actor) {
  enEmpresa_(empresaId, () => {
    const i = columna_(CONFIGURACION, 'clave').indexOf(seccion)
    if (valor === null) {
      if (i >= 0) tabla_(CONFIGURACION).deleteRow(i + 2)
    } else {
      const registro = { clave: seccion, valor: valor, modificadoPor: actor, actualizado: new Date().toISOString(), empresaId: empresaId }
      if (i >= 0) escribir_(CONFIGURACION, i + 2, registro)
      else agregar_(CONFIGURACION, registro)
    }
  })
  CacheService.getScriptCache().remove('config_' + empresaId)
}

function renombrarEmpresa_(empresaId, nombre, actor) {
  const fila = columna_(EMPRESAS, 'id').indexOf(empresaId) + 2
  const empresa = leerFila_(EMPRESAS, fila)
  if (empresa.nombre === nombre) return
  escribir_(EMPRESAS, fila, Object.assign({}, empresa, { nombre: nombre, modificadoPor: actor, actualizado: new Date().toISOString() }))
  olvidarEmpresas_()
  try {
    // su carpeta y su hoja en Drive toman el nombre nuevo (los ids no cambian)
    DriveApp.getFolderById(empresa.carpetaId).setName(nombre)
    DriveApp.getFileById(empresa.hojaId).setName('ServiTec - ' + nombre)
  } catch (e) {} // un fallo de Drive no impide guardar los datos
}

// Guarda (o restablece a los valores por defecto) una sección. Devuelve la configuración completa de esa empresa.
function guardarConfig_(empresaId, seccion, req, yo) {
  if (!NOMBRES_CONFIG[seccion]) throw fail_('Sección inválida')
  const valor = req.restablecer ? null : validarConfig_(seccion, req.data || {})
  escribirSeccion_(empresaId, seccion, valor, yo.usuario)
  if (seccion === 'empresa' && valor) renombrarEmpresa_(empresaId, JSON.parse(valor).nombre, yo.usuario)
  registrar_(yo.usuario, yo.rol, req.restablecer ? 'Configuración restablecida' : 'Configuración modificada', NOMBRES_CONFIG[seccion], 'configuracion:' + seccion, empresaId)
  return configuracion_(empresaId)
}

// ---------- Clientes (catálogo) ----------
// Al registrar una visita el cliente se registra solo, sin duplicarlo por mayúsculas, tildes o espacios de más.
// Cada empresa tiene su catálogo. Lo ven y administran los administradores (el técnico no); solo se eliminan clientes sin visitas.
const CLIENTES = {
  name: 'Clientes',
  headers: ['id', 'clave', 'nombre', 'direccion', 'telefono', 'autor', 'creado', 'modificadoPor', 'actualizado', 'empresaId'],
  texto: ['telefono'],
  formatos: { creado: FORMATO_FECHA_HORA, actualizado: FORMATO_FECHA_HORA },
  ligeras: 10,
}

// "Banco  del Sur " y "banco del sur" y "BANCO DEL SÚR" son el mismo cliente
const normalizar_ = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// Posición (desde 0, sin la cabecera) del cliente de una empresa con esa clave; -1 si no existe
function posicionCliente_(empresaId, clave) {
  const claves = columna_(CLIENTES, 'clave')
  const empresas = columna_(CLIENTES, 'empresaId')
  return claves.findIndex((c, i) => c === clave && empresas[i] === empresaId)
}

// Devuelve el id del cliente de una visita, registrándolo si no existía. Si ya existía, solo completa dirección y teléfono vacíos.
function asegurarCliente_(v, actor, rol) {
  const clave = normalizar_(v.cliente)
  if (!clave) return ''
  const now = new Date().toISOString()
  const i = posicionCliente_(v.empresaId, clave)
  if (i >= 0) {
    const c = leerFila_(CLIENTES, i + 2)
    const faltan = {}
    if (!c.direccion && v.direccion) faltan.direccion = String(v.direccion).slice(0, 200)
    if (!c.telefono && v.telefono) faltan.telefono = String(v.telefono).slice(0, 30)
    if (Object.keys(faltan).length) escribir_(CLIENTES, c._row, Object.assign({}, c, faltan, { modificadoPor: actor, actualizado: now }))
    return c.id
  }
  const nuevo = {
    id: Utilities.getUuid(),
    clave: clave,
    nombre: String(v.cliente).trim().slice(0, 120),
    direccion: String(v.direccion || '').slice(0, 200),
    telefono: String(v.telefono || '').slice(0, 30),
    autor: actor,
    creado: now,
    modificadoPor: actor,
    actualizado: now,
    empresaId: v.empresaId,
  }
  agregar_(CLIENTES, nuevo)
  registrar_(actor, rol || '', 'Cliente registrado', nuevo.nombre + ' (desde una visita)', 'cliente:' + nuevo.id, v.empresaId)
  return nuevo.id
}

function datosCliente_(d) {
  const nombre = String(d.nombre || '').trim()
  const direccion = String(d.direccion || '').trim()
  const telefono = String(d.telefono || '').trim()
  if (!nombre) throw fail_('Escribe el nombre del cliente')
  if (nombre.length > 120) throw fail_('El nombre es demasiado largo')
  if (direccion.length > 200 || telefono.length > 30) throw fail_('La dirección o el teléfono son demasiado largos')
  return { nombre: nombre, direccion: direccion, telefono: telefono, clave: normalizar_(nombre) }
}

const clientePublico_ = (c) => {
  const o = limpiar_(c)
  delete o.clave
  return o
}

/**
 * clientes_list { q, limit (50, máx. 100), offset } -> { items, total, hasMore }   por nombre; q busca en nombre, teléfono y dirección
 * clientes_create { data: { nombre, direccion, telefono } } / clientes_update { id, data } / clientes_delete { id }
 */
function clientes_(op, req, yo) {
  if (yo.rol === 'tecnico') throw fail_('Sin permisos', 'FORBIDDEN')
  const now = new Date().toISOString()

  if (op === 'list') {
    const q = normalizar_(req.q).slice(0, 60)
    const limite = entero_(req.limit, 50, 1, 100)
    const offset = entero_(req.offset, 0, 0, 1000000)
    const items = leer_(CLIENTES, true)
      .filter((c) => c.empresaId === yo.empresaId && (!q || c.clave.indexOf(q) >= 0 || normalizar_(c.direccion).indexOf(q) >= 0 || normalizar_(c.telefono).indexOf(q) >= 0))
      .sort((a, b) => menorQue_(a.clave, b.clave))
    return { items: items.slice(offset, offset + limite).map(clientePublico_), total: items.length, hasMore: offset + limite < items.length }
  }

  if (op === 'create') {
    const d = datosCliente_(req.data || {})
    if (posicionCliente_(yo.empresaId, d.clave) >= 0) throw fail_('Ya existe un cliente con ese nombre')
    const c = Object.assign({ id: Utilities.getUuid(), autor: yo.usuario, creado: now, modificadoPor: yo.usuario, actualizado: now, empresaId: yo.empresaId }, d)
    agregar_(CLIENTES, c)
    registrar_(yo.usuario, yo.rol, 'Cliente creado', c.nombre, 'cliente:' + c.id)
    return clientePublico_(c)
  }

  const cur = filaPorId_(CLIENTES, req.id)
  if (!cur || cur.empresaId !== yo.empresaId) throw fail_('No encontrado')

  if (op === 'update') {
    // Cambiar el nombre no reescribe las visitas ya registradas: conservan el nombre con que se agendaron
    const d = datosCliente_(Object.assign({}, cur, req.data))
    if (d.clave !== cur.clave && posicionCliente_(yo.empresaId, d.clave) >= 0) throw fail_('Ya existe un cliente con ese nombre')
    const c = Object.assign({}, cur, d, { modificadoPor: yo.usuario, actualizado: now })
    escribir_(CLIENTES, cur._row, c)
    registrar_(yo.usuario, yo.rol, 'Cliente modificado', cur.nombre + ' — ' + (cambios_('clientes', cur, c) || 'sin cambios'), 'cliente:' + cur.id)
    return clientePublico_(c)
  }

  // delete (el técnico ya quedó fuera al principio)
  if (columna_(VISITAS, 'clienteId').indexOf(cur.id) >= 0) throw fail_('El cliente tiene visitas registradas y no se puede eliminar')
  tabla_(CLIENTES).deleteRow(cur._row)
  registrar_(yo.usuario, yo.rol, 'Cliente eliminado', cur.nombre, 'cliente:' + cur.id)
  return true
}

// Ejecutar UNA vez desde el editor si ya había visitas antes de existir el catálogo: registra sus clientes y las vincula.
function registrarClientesExistentes() {
  usuarios_()
  const lock = LockService.getScriptLock()
  lock.waitLock(20000)
  let vinculadas = 0
  try {
    empresas_().forEach((e) =>
      enEmpresa_(e.id, () => {
        const sh = tabla_(VISITAS)
        const col = VISITAS.headers.indexOf('clienteId') + 1
        leer_(VISITAS, true).forEach((v) => {
          if (v.clienteId) return
          const id = asegurarCliente_(v, v.autor)
          if (id) {
            sh.getRange(v._row, col).setValue(id)
            vinculadas++
          }
        })
      }),
    )
  } finally {
    lock.releaseLock()
  }
  Logger.log('Visitas vinculadas a un cliente: ' + vinculadas)
}

// ---------- Notificaciones (en la app y por correo) ----------
// Cada aviso se guarda en la hoja "Notificaciones" (la campana de la app) y, si el usuario tiene correo, se envía por mail.
// Los correos se envían al terminar la petición, ya liberado el lock, y un fallo de correo nunca rompe la operación.
const NOTIFICACIONES = { name: 'Notificaciones', headers: ['id', 'usuario', 'tipo', 'titulo', 'mensaje', 'ref', 'creado', 'leida'], formatos: { creado: FORMATO_FECHA_HORA }, ligeras: 8 }
const APP_URL = '' // URL pública de la app: si se completa, los correos incluyen un botón "Abrir la app"
const MAX_FILAS_NOTIF = 500 // se leen solo las últimas filas de la hoja (los avisos recientes son los que importan)
const DIAS_NOTIF = 60 // los avisos más antiguos se borran con el trigger diario
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
let COLA_CORREOS = []

const fechaCorta_ = (f) => {
  const p = String(f).split('-')
  return p.length === 3 ? p[2] + '-' + p[1] + '-' + p[0] : String(f) // 2026-11-19 -> 19-11-2026
}

const resumenVisita_ = (v) => v.cliente + '\n' + fechaCorta_(v.fecha) + ' ' + v.hora + (v.direccion ? '\n' + v.direccion : '')

function plantillaCorreo_(marca, titulo, mensaje) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const enlace = APP_URL
    ? '<p style="margin:16px 0 0"><a href="' + esc(APP_URL) + '" style="background:' + marca.tema.acento + ';color:' + (contraste_(marca.tema.acento, '#06173a') >= 4.5 ? '#06173a' : '#ffffff') + ';padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">Abrir la app</a></p>'
    : ''
  return (
    '<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;border:1px solid #dbeafe;border-radius:12px;overflow:hidden">' +
    '<div style="background:' + marca.tema.primario + ';color:#fff;padding:14px 18px;font-weight:bold;letter-spacing:1px">' + esc(marca.empresa.nombre) + ' <span style="color:' + marca.tema.acento + ';font-size:11px">' + esc(marca.empresa.subtitulo) + '</span></div>' +
    '<div style="padding:18px"><h2 style="margin:0 0 8px;color:#0a2a5e;font-size:18px">' + esc(titulo) + '</h2>' +
    '<p style="margin:0;color:#111827;white-space:pre-line">' + esc(mensaje) + '</p>' + enlace + '</div></div>'
  )
}

// Crea el aviso para cada usuario de la lista (por nombre de usuario), salvo quien hizo la acción
function notificar_(us, usuarios, n, actor) {
  try {
    const vistos = {}
    usuarios.forEach((nombre) => {
      if (!nombre || nombre === actor || vistos[nombre]) return
      vistos[nombre] = true
      const u = us.filter((x) => x.usuario === nombre && esActivo_(x))[0]
      if (!u) return
      agregar_(NOTIFICACIONES, { id: Utilities.getUuid(), usuario: u.usuario, tipo: n.tipo, titulo: n.titulo, mensaje: n.mensaje, ref: n.ref || '', creado: new Date().toISOString(), leida: false })
      if (!u.correo) return
      const marca = configuracion_(u.empresaId)
      COLA_CORREOS.push({ para: u.correo, asunto: '[' + marca.empresa.nombre + '] ' + n.titulo, html: plantillaCorreo_(marca, n.titulo, n.mensaje), remitente: marca.empresa.nombre })
    })
  } catch (e) {} // un aviso fallido nunca debe impedir la operación principal
}

function enviarCorreos_() {
  const cola = COLA_CORREOS
  COLA_CORREOS = []
  if (!cola.length) return
  let cupo = 0
  try {
    cupo = MailApp.getRemainingDailyQuota()
  } catch (e) {
    return
  }
  cola.slice(0, cupo).forEach((c) => {
    try {
      MailApp.sendEmail({ to: c.para, subject: c.asunto, htmlBody: c.html, name: c.remitente || 'ServiTec' })
    } catch (e) {}
  })
}

function avisarInformeFinalizado_(item, us, yo) {
  if (!item.visitaId) return
  const v = filaPorId_(VISITAS, item.visitaId)
  if (!v) return
  notificar_(us, [v.autor], { tipo: 'informe_finalizado', titulo: 'Informe finalizado', mensaje: item.numero + ' · ' + item.cliente + '\nElaborado por ' + item.autor, ref: 'informe:' + item.id }, yo.usuario)
}

// Avisos por cambios en una visita: asignación, reasignación, reprogramación y cambios de estado
function avisarCambiosVisita_(cur, item, us, yo) {
  if (item.responsable !== cur.responsable) {
    if (item.responsable) notificar_(us, [item.responsable], { tipo: 'visita_asignada', titulo: 'Nueva visita asignada', mensaje: resumenVisita_(item), ref: 'visita:' + item.id }, yo.usuario)
    if (cur.responsable) notificar_(us, [cur.responsable], { tipo: 'visita_reasignada', titulo: 'Visita reasignada', mensaje: 'La visita de ' + cur.cliente + ' (' + fechaCorta_(cur.fecha) + ' ' + cur.hora + ') ya no está asignada a ti.', ref: '' }, yo.usuario)
  } else if (item.responsable && (cur.fecha !== item.fecha || cur.hora !== item.hora || cur.direccion !== item.direccion)) {
    notificar_(us, [item.responsable], { tipo: 'visita_reprogramada', titulo: 'Visita reprogramada', mensaje: resumenVisita_(item), ref: 'visita:' + item.id }, yo.usuario)
  }

  if (item.estado !== cur.estado) {
    const motivo = item.estado === 'Cancelada' && item.motivo ? '\nMotivo: ' + item.motivo : ''
    if (yo.rol === 'tecnico' || item.responsable === yo.usuario) {
      const titulo = item.estado === 'Cancelada' && cur.estado === 'Programada' ? 'Visita rechazada' : 'Visita ' + String(item.estado).toLowerCase()
      notificar_(us, [cur.autor], { tipo: 'visita_estado', titulo: titulo, mensaje: yo.nombre + '\n' + resumenVisita_(item) + motivo, ref: 'visita:' + item.id }, yo.usuario)
    } else if (item.estado === 'Cancelada' && item.responsable) {
      notificar_(us, [item.responsable], { tipo: 'visita_cancelada', titulo: 'Visita cancelada', mensaje: resumenVisita_(item) + motivo, ref: 'visita:' + item.id }, yo.usuario)
    }
  }
}

function ultimasNotificaciones_() {
  const sh = tabla_(NOTIFICACIONES)
  const ultima = sh.getLastRow()
  if (ultima < 2) return []
  const desde = Math.max(2, ultima - MAX_FILAS_NOTIF + 1)
  const tz = Session.getScriptTimeZone()
  const n = NOTIFICACIONES.headers.length
  return sh.getRange(desde, 1, ultima - desde + 1, n).getValues().map((r, i) => aObjeto_(NOTIFICACIONES, r, desde + i, n, tz))
}

/**
 * notificaciones_list { resumen? } -> { items (50 más recientes), noLeidas }   (con resumen: solo { noLeidas }, barato para el sondeo)
 * notificaciones_leer { ids: [...] } o { todas: true }
 */
function notificaciones_(op, req, yo) {
  const mias = ultimasNotificaciones_().filter((n) => n.usuario === yo.usuario)
  const noLeidas = mias.filter((n) => !esTrue_(n.leida)).length

  if (op === 'list') {
    if (req.resumen) return { noLeidas: noLeidas }
    const items = mias
      .sort((a, b) => menorQue_(String(b.creado), String(a.creado)))
      .slice(0, 50)
      .map((n) => {
        const c = limpiar_(n)
        c.leida = esTrue_(n.leida)
        return c
      })
    return { items: items, noLeidas: noLeidas }
  }

  const ids = req.todas ? null : Array.isArray(req.ids) ? req.ids.map(String) : []
  const sh = tabla_(NOTIFICACIONES)
  const col = NOTIFICACIONES.headers.indexOf('leida') + 1
  mias.filter((n) => !esTrue_(n.leida) && (ids === null || ids.indexOf(n.id) >= 0)).forEach((n) => sh.getRange(n._row, col).setValue(true))
  return true
}

// ---- Triggers (se instalan una vez con instalarTriggers desde el editor de Apps Script) ----

// Cada tarde: aviso de las visitas de mañana al técnico (y al que agendó, si quedó sin técnico)
function enviarRecordatorios() {
  const manana = Utilities.formatDate(new Date(Date.now() + 86400000), Session.getScriptTimeZone(), 'yyyy-MM-dd')
  const us = usuarios_() // primero: prepara la hoja principal si viene de una versión anterior
  const lock = LockService.getScriptLock()
  lock.waitLock(20000)
  try {
    empresas_()
      .filter((e) => esTrue_(e.activa))
      .forEach((e) => enEmpresa_(e.id, () => recordarVisitas_(us, manana)))
  } finally {
    lock.releaseLock()
  }
  enviarCorreos_()
}

// Recordatorios de la empresa actual
function recordarVisitas_(us, manana) {
  const visitas = leer_(VISITAS, true).filter((v) => v.fecha === manana && v.estado !== 'Cancelada' && v.estado !== 'Realizada')
  if (!visitas.length) return
  const porTecnico = {}
  const sinTecnico = {}
  visitas.forEach((v) => {
    const grupo = v.responsable ? porTecnico : sinTecnico
    const clave = v.responsable || v.autor
    ;(grupo[clave] = grupo[clave] || []).push(v)
  })
  const lista = (vs) =>
    vs
      .sort((a, b) => menorQue_(String(a.hora), String(b.hora)))
      .map((v) => v.hora + ' · ' + v.cliente + (v.direccion ? ' · ' + v.direccion : '') + (v.estado === 'Programada' ? ' (sin aceptar)' : ''))
      .join('\n')
  Object.keys(porTecnico).forEach((t) => {
    const n = porTecnico[t].length
    notificar_(us, [t], { tipo: 'recordatorio', titulo: 'Mañana tienes ' + n + (n === 1 ? ' visita' : ' visitas'), mensaje: lista(porTecnico[t]), ref: '' }, '')
  })
  Object.keys(sinTecnico).forEach((a) => {
    notificar_(us, [a], { tipo: 'recordatorio', titulo: 'Visitas de mañana sin técnico', mensaje: lista(sinTecnico[a]), ref: '' }, '')
  })
  registrar_('Sistema', '', 'Recordatorios enviados', visitas.length + ' visita(s) del ' + fechaCorta_(manana), '')
}

// Cada madrugada: borra los avisos más antiguos (las filas se agregan en orden cronológico, así que están arriba)
function limpiarNotificaciones() {
  const limite = new Date(Date.now() - DIAS_NOTIF * 86400000).toISOString()
  usuarios_()
  const lock = LockService.getScriptLock()
  lock.waitLock(20000)
  try {
    empresas_().forEach((e) =>
      enEmpresa_(e.id, () => {
        const fechas = columna_(NOTIFICACIONES, 'creado')
        let viejas = 0
        while (viejas < fechas.length && (fechas[viejas] instanceof Date ? fechas[viejas].toISOString() : String(fechas[viejas])) < limite) viejas++
        if (viejas > 0) {
          tabla_(NOTIFICACIONES).deleteRows(2, viejas)
          registrar_('Sistema', '', 'Avisos antiguos eliminados', viejas + ' aviso(s) de más de ' + DIAS_NOTIF + ' días', '')
        }
      }),
    )
  } finally {
    lock.releaseLock()
  }
}

// Ejecutar UNA vez desde el editor de Apps Script (pide autorización). Repetirla no duplica los triggers.
function instalarTriggers() {
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (['enviarRecordatorios', 'limpiarNotificaciones'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t)
  })
  ScriptApp.newTrigger('enviarRecordatorios').timeBased().everyDays(1).atHour(18).create()
  ScriptApp.newTrigger('limpiarNotificaciones').timeBased().everyDays(1).atHour(3).create()
}

// Datos del superadmin a crear: se leen de las PROPIEDADES DE LA SECUENCIA DE COMANDOS (Apps Script > Configuración del
// proyecto > Propiedades de la secuencia de comandos), así ningún usuario ni clave queda escrito en el código ni en el repositorio:
//   SUPERADMIN_USUARIO y SUPERADMIN_CLAVE (obligatorias; la clave es temporal), SUPERADMIN_CEDULA (obligatoria: es la clave
//   temporal de los administradores de las empresas nuevas) y SUPERADMIN_NOMBRE (opcional)
function datosSuperadmin_() {
  const p = PropertiesService.getScriptProperties()
  const usuario = String(p.getProperty('SUPERADMIN_USUARIO') || '').trim().toLowerCase()
  const clave = p.getProperty('SUPERADMIN_CLAVE')
  if (!usuario || !clave) {
    throw new Error('Define las propiedades de la secuencia de comandos SUPERADMIN_USUARIO y SUPERADMIN_CLAVE (y opcionalmente SUPERADMIN_NOMBRE) y vuelve a ejecutar.')
  }
  if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) throw new Error('SUPERADMIN_USUARIO inválido: 3 a 30 caracteres (letras minúsculas, números, . _ -).')
  const cedula = String(p.getProperty('SUPERADMIN_CEDULA') || '').trim()
  const motivo = motivoCedulaInvalida_(cedula)
  if (motivo) throw new Error('Revisa la propiedad SUPERADMIN_CEDULA: ' + motivo)
  return { usuario: usuario, nombre: p.getProperty('SUPERADMIN_NOMBRE') || usuario, rol: 'root', clave: String(clave), cedula: cedula, correo: '' }
}

// Crea el usuario ROOT (el dueño del sistema, que crea las empresas) directamente en la hoja Usuarios. Se ejecuta UNA vez desde el editor de Apps Script (seleccionar
// "crearSuperadmin" y pulsar Ejecutar), con las propiedades de arriba ya definidas. La clave es temporal: la app obliga a
// cambiarla en el primer ingreso y ahí se aplica la política de claves. Si la hoja estaba vacía, así NO se crea el superadmin
// genérico (superadmin / Ferisel2026!). Al terminar se borra SUPERADMIN_CLAVE de las propiedades.
function crearSuperadmin() {
  const d = datosSuperadmin_()
  const lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
    if (leer_(USUARIOS).some((u) => u.usuario === d.usuario)) throw new Error('El usuario ya existe: ' + d.usuario)
    agregarUsuario_(nuevoUsuario_(d, 'Apps Script')) // nuevoUsuario_ marca cambiarClave: true
    migrarEmpresas_()
    registrar_('Apps Script', '', 'Usuario creado', d.usuario + ' (root) desde el editor', 'usuario:' + d.usuario)
  } finally {
    lock.releaseLock()
  }
  PropertiesService.getScriptProperties().deleteProperty('SUPERADMIN_CLAVE') // la clave no queda guardada en ningún lado
  Logger.log('Superadministrador del sistema creado: ' + d.usuario + '. Debe cambiar la clave al ingresar.')
}

// Solo lectura. Ejecutar desde el editor y abrir "Registro de ejecución" para ver por qué no entra un usuario: muestra los
// encabezados y usuarios de la hoja y, si SUPERADMIN_CLAVE está definida, si coincide con el hash guardado (sin mostrar claves).
function diagnosticoUsuarios() {
  const p = PropertiesService.getScriptProperties()
  const usuario = String(p.getProperty('SUPERADMIN_USUARIO') || '').trim().toLowerCase()
  const clave = p.getProperty('SUPERADMIN_CLAVE')
  const sh = tabla_(USUARIOS)
  const us = leer_(USUARIOS)
  Logger.log('Encabezados de la hoja Usuarios: ' + sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].join(', '))
  Logger.log('Usuarios en la hoja (' + us.length + '): ' + us.map((u) => u.usuario + ' [' + u.rol + ', activo=' + u.activo + ']').join(' | '))
  if (!usuario) return Logger.log('Para revisar un usuario concreto define la propiedad SUPERADMIN_USUARIO (y SUPERADMIN_CLAVE si quieres comprobar su clave temporal).')
  const u = us.filter((x) => x.usuario === usuario)[0]
  if (!u) return Logger.log('RESULTADO: el usuario ' + usuario + ' NO existe en la hoja. Ejecuta crearSuperadmin.')
  Logger.log('Hash en formato v2: ' + (String(u.hash).indexOf('v2:') === 0) + ' | cambiarClave=' + u.cambiarClave + ' | activo=' + u.activo)
  Logger.log('Bloqueado por intentos fallidos: ' + bloqueado_(CacheService.getScriptCache(), usuario))
  if (!clave) return Logger.log('RESULTADO: el usuario existe. No se comprobó su clave porque SUPERADMIN_CLAVE no está definida.')
  const coincide = claveCorrecta_(u, String(clave))
  Logger.log('La clave temporal coincide con el hash guardado (con este código): ' + coincide)
  Logger.log(
    coincide
      ? 'RESULTADO: el usuario está bien. Si la app igual rechaza el ingreso, la implementación publicada es una versión anterior: Implementar > Administrar implementaciones > editar > Versión: Nueva versión.'
      : 'RESULTADO: el usuario existe pero la clave no coincide (¿se editó la fila a mano, o se creó con otra versión del código?). Borra la fila de ' + usuario + ' y ejecuta crearSuperadmin de nuevo.',
  )
}

// ---------- HTTP ----------
function doGet() {
  return json_({ ok: true, servicio: 'ServiTec' })
}

// Acciones que no modifican hojas: no toman el lock, así un login o una consulta no esperan a una subida de fotos
const ES_LECTURA = /^(login|logout|me|configuracion_get|tecnicos_list|usuarios_list|(informes|visitas)_(list|get)|fotos_(list|get)|clientes_list|notificaciones_list|usuarios_(sugerir|disponible)|dashboard_resumen|empresas_(list|admins|config_get))$/

function doPost(e) {
  let lock = null
  COLA_CORREOS = []
  EMPRESA_ACTUAL = ''
  try {
    const req = JSON.parse(e.postData.contents)
    let us = usuarios_()
    if (!ES_LECTURA.test(String(req.action))) {
      lock = LockService.getScriptLock()
      lock.waitLock(10000)
      us = usuarios_() // relectura ya con el lock: evita decidir con datos desactualizados
    }
    return json_({ ok: true, data: handle_(req, us) })
  } catch (err) {
    return json_({ ok: false, error: err.message, code: err.code || '' })
  } finally {
    if (lock) lock.releaseLock()
    enviarCorreos_() // los correos salen con el lock ya liberado
  }
}

function validarResponsable_(r, us) {
  // El responsable puede ser un técnico o un administrador (atiende visitas cuando no hay técnicos)
  if (r && !us.some((x) => x.usuario === r && esActivo_(x) && ROLES_DE_TRABAJO.indexOf(x.rol) >= 0)) throw fail_('Técnico inválido')
}

// ---------- Informes: validación, numeración y cierre ----------
const MAX_CELDA = 45000 // las celdas de Sheets admiten 50.000 caracteres

function validarInforme_(d) {
  if (d.checklist) {
    if (String(d.checklist).length > MAX_CELDA) throw fail_('El checklist es demasiado largo')
    let c
    try {
      c = JSON.parse(d.checklist)
    } catch (e) {
      throw fail_('Checklist inválido')
    }
    if (!Array.isArray(c)) throw fail_('Checklist inválido')
  }
  if (d.firma && (String(d.firma).indexOf('data:image/png;base64,') !== 0 || String(d.firma).length > MAX_CELDA)) throw fail_('Firma inválida')
  if (d.descripcion && String(d.descripcion).length > MAX_CELDA) throw fail_('Las observaciones son demasiado largas')
}

// Para finalizar: cada actividad con su descripción y su resultado
function checklistCompleta_(texto) {
  if (!texto) return true
  const c = JSON.parse(texto)
  return c.every((i) => String(i.item || '').trim() && i.resultado)
}

// INF-AAAA-0001, correlativo por empresa y año (se llama con el lock del script tomado). Lee solo la columna 'numero'.
function siguienteNumero_(empresaId) {
  const anio = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy')
  const prefijo = configuracion_(empresaId).informes.prefijo + '-' + anio + '-'
  const empresas = columna_(INFORMES, 'empresaId')
  const max = columna_(INFORMES, 'numero').reduce((m, v, i) => {
    const n = empresas[i] === empresaId ? String(v) : ''
    return n.indexOf(prefijo) === 0 ? Math.max(m, parseInt(n.slice(prefijo.length), 10) || 0) : m
  }, 0)
  return prefijo + ('000' + (max + 1)).slice(-4)
}

// ---------- Listados: filtros y paginación en el servidor ----------
const entero_ = (v, def, min, max) => {
  const n = parseInt(v, 10)
  return isNaN(n) ? def : Math.min(max, Math.max(min, n))
}
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
const menorQue_ = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * informes_list: { q, estado, visitaId, limit (50, máx. 100), offset } -> { items, total, hasMore }
 *   Más recientes primero. Los items NO traen descripcion, checklist ni firma (usar informes_get).
 * visitas_list: { desde, hasta, q, orden: 'asc'|'desc', limit (500, máx. 500), offset } -> { items, total, hasMore, antes }
 *   `antes` = cuántas visitas visibles hay con fecha anterior a `desde` (para ofrecer "cargar anteriores").
 */
function listar_(nombre, req, yo) {
  const t = RECURSOS[nombre]
  const esInformes = nombre === 'informes'
  const limite = entero_(req.limit, esInformes ? 50 : 500, 1, esInformes ? 100 : 500)
  const offset = entero_(req.offset, 0, 0, 1000000)
  const filas = leer_(t, true)
  let items
  let antes = 0

  if (esInformes) {
    const q = String(req.q || '').trim().toLowerCase().slice(0, 60)
    items = filas.filter(
      (i) =>
        puedeVer_('informes', i, yo) &&
        (!req.visitaId || i.visitaId === req.visitaId) &&
        (!req.estado || i.estado === req.estado) &&
        (!q || [i.titulo, i.cliente, i.numero, i.responsable].some((c) => String(c || '').toLowerCase().indexOf(q) >= 0)),
    )
    items.sort((a, b) => menorQue_(b.fecha, a.fecha) || menorQue_(String(b.creado), String(a.creado)))
  } else {
    const desde = FECHA_RE.test(req.desde) ? req.desde : ''
    const hasta = FECHA_RE.test(req.hasta) ? req.hasta : ''
    const visibles = filas.filter((v) => puedeVer_('visitas', v, yo))
    if (desde) antes = visibles.filter((v) => v.fecha < desde).length
    const q = String(req.q || '').trim().toLowerCase().slice(0, 60)
    items = visibles.filter(
      (v) =>
        (!desde || v.fecha >= desde) && (!hasta || v.fecha <= hasta) && (!req.clienteId || v.clienteId === req.clienteId) &&
        (!q || [v.cliente, v.direccion, v.tipo].some((c) => String(c || '').toLowerCase().indexOf(q) >= 0)),
    )
    const signo = req.orden === 'desc' ? -1 : 1
    items.sort((a, b) => signo * menorQue_(a.fecha + ' ' + a.hora, b.fecha + ' ' + b.hora))
  }

  return { items: items.slice(offset, offset + limite).map(limpiar_), total: items.length, hasMore: offset + limite < items.length, antes: antes }
}

// CRUD común de visitas e informes
function recurso_(nombre, op, req, yo, us) {
  const t = RECURSOS[nombre]
  const now = new Date().toISOString()

  if (op === 'list') return listar_(nombre, req, yo)

  // El técnico solo puede actualizar visitas (estado y notas); no las crea ni las elimina
  if (nombre === 'visitas' && yo.rol === 'tecnico' && op !== 'update' && op !== 'get') throw fail_('Sin permisos', 'FORBIDDEN')

  if (op === 'create') {
    const d = req.data || {}
    // Idempotencia: el cliente puede enviar el id del registro; repetir la misma creación devuelve el registro ya creado
    const idCliente = UUID_RE.test(String(d.id || '')) ? String(d.id) : ''
    if (idCliente) {
      const previo = filaPorId_(t, idCliente)
      if (previo) {
        if (previo.autor !== yo.usuario) throw fail_('Identificador en uso')
        return limpiar_(previo)
      }
    }
    if (nombre === 'visitas') validarResponsable_(d.responsable, us)
    if (nombre === 'informes' && d.visitaId) {
      const v = visitaAccesible_(d.visitaId, yo)
      if (yo.rol === 'tecnico' && ESTADOS_CON_INFORME.indexOf(v.estado) < 0) throw fail_('Acepta la visita antes de crear su informe')
    }
    const item = Object.assign({}, d, { id: idCliente || Utilities.getUuid(), autor: yo.usuario, creado: now, modificadoPor: yo.usuario, actualizado: now, empresaId: yo.empresaId })
    if (nombre === 'informes') {
      validarInforme_(item)
      if (item.estado === 'Finalizado' && !checklistCompleta_(item.checklist)) throw fail_('Para finalizar, cada actividad necesita su descripción y su resultado')
      item.numero = siguienteNumero_(yo.empresaId)
    }
    if (nombre === 'visitas') item.clienteId = asegurarCliente_(item, yo.usuario, yo.rol) // el cliente queda registrado
    agregar_(t, item)
    if (nombre === 'visitas' && item.responsable) {
      notificar_(us, [item.responsable], { tipo: 'visita_asignada', titulo: 'Nueva visita asignada', mensaje: resumenVisita_(item), ref: 'visita:' + item.id }, yo.usuario)
    }
    if (nombre === 'informes' && item.estado === 'Finalizado') avisarInformeFinalizado_(item, us, yo)
    registrar_(yo.usuario, yo.rol, nombre === 'visitas' ? 'Visita creada' : item.estado === 'Finalizado' ? 'Informe finalizado' : 'Informe creado', etiquetaRegistro_(nombre, item), (nombre === 'visitas' ? 'visita:' : 'informe:') + item.id)
    return item
  }

  const cur = filaPorId_(t, req.id)
  if (!cur || !puedeVer_(nombre, cur, yo)) throw fail_('No encontrado')

  if (op === 'get') return limpiar_(cur)

  if (op === 'update') {
    let d = Object.assign({}, req.data)
    delete d.clienteId // lo decide el servidor
    if (nombre === 'visitas') {
      if (yo.rol === 'tecnico') {
        d = {
          estado: d.estado === undefined ? cur.estado : d.estado,
          notas: d.notas === undefined ? cur.notas : d.notas,
          motivo: d.motivo === undefined ? cur.motivo : d.motivo,
        }
        if (d.estado !== cur.estado && (TRANSICIONES_TECNICO[cur.estado] || []).indexOf(d.estado) < 0) throw fail_('Cambio de estado no permitido')
      }
      if (d.estado !== undefined && ESTADOS_VISITA.indexOf(d.estado) < 0) throw fail_('Estado inválido')
      const estadoFinal = d.estado === undefined ? cur.estado : d.estado
      const motivoFinal = d.motivo === undefined ? cur.motivo : d.motivo
      if (estadoFinal === 'Cancelada' && !String(motivoFinal || '').trim()) throw fail_('Indica el motivo de la cancelación')
      if (d.responsable !== undefined && d.responsable !== cur.responsable) validarResponsable_(d.responsable, us)
    }
    if (nombre === 'informes') {
      delete d.visitaId // el vínculo con la visita no se cambia
      delete d.numero
      // Un informe finalizado queda cerrado: solo un administrador puede modificarlo
      if (cur.estado === 'Finalizado' && !esGestor_(yo)) throw fail_('Informe finalizado: solo un administrador puede modificarlo', 'FORBIDDEN')
      validarInforme_(d)
    }
    const item = Object.assign({}, limpiar_(cur), d, { id: cur.id, autor: cur.autor, creado: cur.creado, modificadoPor: yo.usuario, actualizado: now, empresaId: cur.empresaId })
    if (nombre === 'informes') {
      if (item.estado === 'Finalizado' && !checklistCompleta_(item.checklist)) throw fail_('Para finalizar, cada actividad necesita su descripción y su resultado')
      item.numero = cur.numero
    }
    if (nombre === 'visitas' && yo.rol !== 'tecnico' && (!item.clienteId || normalizar_(item.cliente) !== normalizar_(cur.cliente))) {
      item.clienteId = asegurarCliente_(item, yo.usuario, yo.rol) // cambió el cliente (o la visita es anterior al catálogo)
    }
    escribir_(t, cur._row, item)
    if (nombre === 'visitas') avisarCambiosVisita_(cur, item, us, yo)
    if (nombre === 'informes' && item.estado === 'Finalizado' && cur.estado !== 'Finalizado') avisarInformeFinalizado_(item, us, yo)
    const accion = nombre === 'visitas' ? 'Visita modificada' : item.estado === 'Finalizado' && cur.estado !== 'Finalizado' ? 'Informe finalizado' : 'Informe modificado'
    registrar_(yo.usuario, yo.rol, accion, etiquetaRegistro_(nombre, cur) + ' — ' + (cambios_(nombre, cur, item) || 'sin cambios'), (nombre === 'visitas' ? 'visita:' : 'informe:') + cur.id)
    return item
  }

  // delete: los informes solo los borra su autor (si no está finalizado) o un administrador
  if (nombre === 'informes' && !esGestor_(yo) && (cur.autor !== yo.usuario || cur.estado === 'Finalizado')) throw fail_('Sin permisos', 'FORBIDDEN')
  tabla_(t).deleteRow(cur._row)
  if (nombre === 'visitas') eliminarFotosDeVisita_(cur.id)
  registrar_(yo.usuario, yo.rol, nombre === 'visitas' ? 'Visita eliminada' : 'Informe eliminado', etiquetaRegistro_(nombre, cur), (nombre === 'visitas' ? 'visita:' : 'informe:') + cur.id)
  return true
}

// ---------- Sesión y claves ----------
// Fallos de login/clave actual: se cuentan por usuario (existente o no, para no revelar cuáles existen)
function bloqueado_(cache, usuario) {
  return parseInt(cache.get('f_' + usuario) || '0', 10) >= MAX_INTENTOS
}

function errorBloqueo_() {
  return fail_('Demasiados intentos fallidos. Intenta de nuevo en 15 minutos.', 'LOCKED')
}

function registrarFallo_(cache, usuario, mensaje) {
  const n = parseInt(cache.get('f_' + usuario) || '0', 10) + 1
  cache.put('f_' + usuario, String(n), BLOQUEO_SEG)
  if (n >= MAX_INTENTOS) {
    registrar_(usuario, '', 'Bloqueo por intentos fallidos', n + ' intentos seguidos', '') // una vez por bloqueo, no por cada intento
    return errorBloqueo_()
  }
  return fail_(mensaje)
}

function nuevoToken_(cache, u) {
  const token = Utilities.getUuid() + Utilities.getUuid()
  cache.put('t_' + token, u.id + ':' + sesion_(u), TOKEN_TTL)
  return token
}

// Cambio de clave propio: exige la clave actual, aplica la política y cierra las demás sesiones
function cambiarClave_(req, yo, cache) {
  if (bloqueado_(cache, yo.usuario)) throw errorBloqueo_()
  if (!claveCorrecta_(yo, String(req.actual || ''))) throw registrarFallo_(cache, yo.usuario, 'La clave actual no es correcta')
  validarClave_(req.nueva, yo.usuario)
  if (String(req.nueva) === String(req.actual)) throw fail_('La nueva clave debe ser distinta a la actual')

  cache.remove('f_' + yo.usuario)
  const salt = Utilities.getUuid()
  const u = Object.assign({}, yo, { salt: salt, hash: hash_(salt, String(req.nueva)), cambiarClave: false, sesion: sesion_(yo) + 1, modificadoPor: yo.usuario, actualizado: new Date().toISOString() })
  escribirUsuario_(yo._row, u)
  registrar_(yo.usuario, yo.rol, 'Cambio de clave', '', 'usuario:' + yo.usuario)
  cache.remove('t_' + req.token)
  return { token: nuevoToken_(cache, u), usuario: publico_(u) }
}

function handle_(req, us) {
  const cache = CacheService.getScriptCache()
  // Un token ajeno (p. ej. la sesión larga que el navegador guardó de otra versión) se descarta: CacheService no admite
  // claves de más de 250 caracteres y fallaría hasta el inicio de sesión.
  if (String(req.token || '').length > MAX_TOKEN) req.token = ''

  if (req.action === 'logout') {
    if (req.token) cache.remove('t_' + req.token) // el token deja de valer en el servidor, no solo en el navegador
    return true
  }

  // Sesión del token ("idUsuario:versiónDeSesión"). Una empresa desactivada deja sin acceso a sus usuarios.
  const valor = req.token ? String(cache.get('t_' + req.token) || '') : ''
  const partes = valor.split(':')
  const yo = partes.length === 2 ? us.filter((x) => x.id === partes[0] && esActivo_(x) && sesion_(x) === Number(partes[1]) && (esRoot_(x) || empresaActiva_(x.empresaId)))[0] : null
  if (yo) EMPRESA_ACTUAL = yo.empresaId

  // Configuración de la empresa de la sesión. Sin sesión (pantalla de ingreso) solo la marca de la empresa indicada.
  if (req.action === 'configuracion_get') return yo ? configuracion_(yo.empresaId) : marcaPublica_(String(req.empresa || ''))

  if (req.action === 'login') {
    const nombre = String(req.usuario || '').trim().toLowerCase().slice(0, 40)
    if (bloqueado_(cache, nombre)) throw errorBloqueo_()
    const u = us.filter((x) => x.usuario === nombre)[0]
    if (u) EMPRESA_ACTUAL = u.empresaId
    if (!claveCorrecta_(u, String(req.clave || '')) || !esActivo_(u)) throw registrarFallo_(cache, nombre, 'Usuario o clave incorrectos')
    cache.remove('f_' + nombre)
    if (!esRoot_(u) && !empresaActiva_(u.empresaId)) throw fail_('Tu empresa está desactivada. Comunícate con el administrador de la plataforma.')
    registrar_(u.usuario, u.rol, 'Inicio de sesión', '', 'usuario:' + u.usuario, u.empresaId)
    return { token: nuevoToken_(cache, u), usuario: publico_(u) }
  }

  // --- a partir de aquí se exige sesión ---
  if (!yo) throw fail_('Sesión expirada', 'AUTH')
  if (req.action === 'me') return publico_(yo)
  if (req.action === 'cambiar_clave') return cambiarClave_(req, yo, cache)

  // Mientras la clave sea temporal, nada más funciona (se exige aquí, no solo en la pantalla)
  if (esTrue_(yo.cambiarClave)) throw fail_('Debes cambiar tu clave para continuar', 'CAMBIAR_CLAVE')

  if (esRoot_(yo)) return accionesRoot_(req, yo, us, cache)
  if (/^empresas_/.test(String(req.action))) throw fail_('Sin permisos', 'FORBIDDEN')

  const equipo = us.filter((x) => x.empresaId === yo.empresaId && vigente_(x)) // todo lo que sigue trabaja solo con su empresa

  if (yo.rol === 'superadmin') return accionesSuperadmin_(req, yo, us, cache)

  // Posibles responsables de una visita: administradores y técnicos de la empresa
  if (req.action === 'tecnicos_list') {
    return equipo
      .filter((x) => esActivo_(x) && ROLES_DE_TRABAJO.indexOf(x.rol) >= 0)
      .map((x) => ({ usuario: x.usuario, nombre: x.nombre, rol: x.rol }))
  }

  if (req.action === 'dashboard_resumen') return resumen_(yo, equipo)

  const m = /^(informes|visitas)_(list|get|create|update|delete)$/.exec(String(req.action))
  if (m) return recurso_(m[1], m[2], req, yo, equipo)

  const mf = /^fotos_(list|upload|get|delete)$/.exec(String(req.action))
  if (mf) return fotos_(mf[1], req, yo)

  const mc = /^clientes_(list|create|update|delete)$/.exec(String(req.action))
  if (mc) return clientes_(mc[1], req, yo)

  const mn = /^notificaciones_(list|leer)$/.exec(String(req.action))
  if (mn) return notificaciones_(mn[1], req, yo)

  const mu = /^usuarios_(list|sugerir|disponible|create|update|delete)$/.exec(String(req.action))
  if (mu) return gestionUsuarios_(mu[1], req, yo, us, cache)

  // Los datos y la personalización de la empresa solo los cambia su superadministrador
  if (req.action === 'configuracion_update') throw fail_('Solo el superadministrador puede cambiar los ajustes de la empresa', 'FORBIDDEN')

  throw fail_('Acción inválida')
}

// ---------- Usuarios: datos de la persona, usuario sugerido y permisos ----------
// Mismas reglas que src/persona.js y src/utils.js (hay pruebas que comprueban que coincidan).
const TELEFONO_RE = /^[+\d][\d\s()-]*$/
const CORREO_PERSONA_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const USUARIO_RE = /^[a-z0-9._-]{3,30}$/

function motivoCedulaInvalida_(c) {
  if (!c) return 'Escribe la cédula'
  if (!/^\d+$/.test(c)) return 'La cédula solo lleva números'
  if (c.length !== 10) return 'La cédula tiene 10 dígitos (tiene ' + c.length + ')'
  const provincia = Number(c.slice(0, 2))
  if (!((provincia >= 1 && provincia <= 24) || provincia === 30)) return 'Los dos primeros dígitos (provincia) no son válidos: van del 01 al 24 o 30'
  if (Number(c[2]) >= 6) return 'El tercer dígito de la cédula debe ser menor a 6'
  const suma = [2, 1, 2, 1, 2, 1, 2, 1, 2].reduce((s, k, i) => {
    const p = Number(c[i]) * k
    return s + (p > 9 ? p - 9 : p)
  }, 0)
  if ((10 - (suma % 10)) % 10 !== Number(c[9])) return 'El último dígito de la cédula (verificador) no corresponde: revisa el número'
  return ''
}

const limpiarPersona_ = (d) => CAMPOS_PERSONA.reduce((p, c) => Object.assign(p, { [c]: String(d[c] === undefined || d[c] === null ? '' : d[c]).trim() }), {})

function validarPersona_(p) {
  if (p.nombre.split(/\s+/).filter(Boolean).length < 2) throw fail_('Escribe los nombres completos (nombres y apellidos)')
  const motivo = motivoCedulaInvalida_(p.cedula)
  if (motivo) throw fail_(motivo)
  if (!CORREO_PERSONA_RE.test(p.correo) || p.correo.length > 120) throw fail_('El correo no es válido')
  const digitos = p.telefono.replace(/\D/g, '').length
  if (!TELEFONO_RE.test(p.telefono) || digitos < 7 || digitos > 15) throw fail_('El teléfono no es válido (de 7 a 15 dígitos)')
  if (!p.ciudad) throw fail_('Escribe la ciudad')
  if (p.nombre.length > 120 || p.ciudad.length > 80 || p.direccion.length > 200 || p.cargo.length > 80) throw fail_('Alguno de los datos es demasiado largo')
}

// Primer nombre + últimos 4 dígitos de la cédula; si está ocupado, letras del apellido y después un número
function generarUsuario_(nombre, cedula, existentes) {
  const particulas = ['de', 'del', 'la', 'las', 'los', 'san', 'santa', 'y']
  const limpio = String(nombre || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, ' ')
  const palabras = []
  let prefijo = ''
  limpio.split(/\s+/).filter(Boolean).forEach((t) => {
    if (particulas.indexOf(t) >= 0) prefijo += t
    else {
      palabras.push(prefijo + t)
      prefijo = ''
    }
  })
  const digitos = String(cedula || '').replace(/\D/g, '')
  if (!palabras.length || digitos.length < 4) return ''
  const apellido = palabras.length >= 4 ? palabras[2] : palabras.length >= 2 ? palabras[palabras.length - 1] : ''
  const base = palabras[0].slice(0, 20) + digitos.slice(-4)
  const libre = (u) => existentes.indexOf(u) < 0
  if (libre(base)) return base
  for (let k = 1; k <= apellido.length; k++) {
    const candidato = (base + apellido.slice(0, k)).slice(0, 30)
    if (libre(candidato)) return candidato
  }
  const raiz = (base + apellido).slice(0, 26)
  for (let n = 2; ; n++) if (libre(raiz + n)) return raiz + n
}

/**
 * El administrador gestiona administradores y técnicos; el superadmin, a los administradores. Cada quien puede editar
 * sus propios datos. La cuenta del propietario solo la cambian él mismo y el superadmin.
 * usuarios_create { data: { usuario?, rol, nombre, cedula, correo, telefono, ciudad, direccion?, cargo? } }
 *   La clave temporal es la cédula y se debe cambiar en el primer ingreso.
 * usuarios_update { id, data }: con data.clave se restablece; data.temporal indica que la clave es la cédula.
 * usuarios_delete { id }: no se puede eliminar a uno mismo ni a quien tiene visitas pendientes.
 */
function gestionUsuarios_(op, req, yo, us, cache) {
  const esSuper = yo.rol === 'superadmin'
  if (!esSuper && !esGestor_(yo)) throw fail_('Sin permisos', 'FORBIDDEN')
  const permitidos = esSuper ? ['admin'] : ROLES_DE_TRABAJO
  const nombres = us.map((x) => String(x.usuario)) // el usuario de ingreso es único en toda la plataforma
  const equipo = us.filter((x) => x.empresaId === yo.empresaId && vigente_(x))

  if (op === 'list') return equipo.filter((x) => x.id === yo.id || permitidos.indexOf(x.rol) >= 0).map(publico_)
  if (op === 'sugerir') {
    const sugerido = generarUsuario_(req.nombre, req.cedula, nombres)
    if (!sugerido) throw fail_('Escribe los nombres completos y la cédula')
    return sugerido
  }
  if (op === 'disponible') {
    const u = String(req.usuario || '').trim().toLowerCase()
    return USUARIO_RE.test(u) && nombres.indexOf(u) < 0
  }

  const d = req.data || {}

  if (op === 'create') {
    if (ROLES.indexOf(d.rol) < 0) throw fail_('Elige el rol del usuario')
    if (permitidos.indexOf(d.rol) < 0) throw fail_(esSuper ? 'Solo puedes crear administradores' : 'Solo puedes crear administradores y técnicos', 'FORBIDDEN')
    const p = limpiarPersona_(d)
    validarPersona_(p)
    // El primer administrador que crea el superadmin es el propietario de la empresa
    const propietario = esSuper && !equipo.some((x) => esTrue_(x.propietario))
    sinDatosRepetidos_(equipo, p, null, { rol: d.rol, propietario: propietario })
    const usuario = usuarioParaAlta_(d, p, nombres)
    const nuevo = nuevoUsuario_(Object.assign(p, { usuario: usuario, rol: d.rol, clave: p.cedula, empresaId: yo.empresaId, propietario: propietario }), yo.usuario)
    agregarUsuario_(nuevo)
    registrar_(yo.usuario, yo.rol, 'Usuario creado', nuevo.usuario + ' (' + nuevo.rol + ')', 'usuario:' + nuevo.usuario)
    return publico_(nuevo)
  }

  const cur = equipo.filter((x) => x.id === req.id)[0]
  if (!cur) throw fail_('No encontrado')
  if (cur.id !== yo.id) {
    if (permitidos.indexOf(cur.rol) < 0) throw fail_('Sin permisos', 'FORBIDDEN')
    if (esTrue_(cur.propietario) && !esSuper) throw fail_('La cuenta del propietario de la empresa solo la puede cambiar él mismo', 'FORBIDDEN')
  }
  if (op === 'delete') return eliminarUsuario_(cur, yo, cache)

  const rol = d.rol === undefined ? cur.rol : d.rol
  const activo = d.activo === undefined ? esActivo_(cur) : !!d.activo
  if (ROLES.indexOf(rol) < 0 || (cur.id !== yo.id && permitidos.indexOf(rol) < 0)) throw fail_('Rol inválido')
  if (cur.id === yo.id && (!activo || rol !== yo.rol)) throw fail_('No puedes quitarte tu propio acceso')

  const u = Object.assign({}, cur, { rol: rol, activo: activo, modificadoPor: yo.usuario, actualizado: new Date().toISOString() })
  // Edición de la ficha (la app la envía completa, con la cédula) o cambio suelto del nombre o el correo
  if (d.cedula !== undefined) {
    const p = limpiarPersona_(Object.assign({}, cur, d))
    validarPersona_(p)
    sinDatosRepetidos_(equipo, p, cur, { rol: rol, propietario: esTrue_(cur.propietario) })
    Object.assign(u, p)
  } else {
    if (d.nombre) u.nombre = String(d.nombre).trim()
    if (d.correo !== undefined) {
      const correo = String(d.correo).trim()
      if (correo && (!CORREO_RE.test(correo) || correo.length > 120)) throw fail_('Correo inválido')
      u.correo = correo
    }
  }
  if (d.clave) ponerClaveTemporal_(u, cur, d, cache)
  const cambios = []
  if (u.rol !== cur.rol) cambios.push('Rol: de ' + cur.rol + ' a ' + u.rol)
  if (esActivo_(u) !== esActivo_(cur)) cambios.push(esActivo_(u) ? 'Activado' : 'Desactivado')
  if (u.nombre !== cur.nombre) cambios.push('Nombre: de ' + cur.nombre + ' a ' + u.nombre)
  const otros = CAMPOS_PERSONA.filter((c) => c !== 'nombre' && String(u[c] || '') !== String(cur[c] || ''))
  if (otros.length) cambios.push('Cambió: ' + otros.join(', '))
  escribirUsuario_(cur._row, u)
  registrar_(yo.usuario, yo.rol, d.clave ? 'Clave restablecida' : 'Usuario modificado', cur.usuario + (cambios.length ? ' — ' + cambios.join('; ') : ''), 'usuario:' + cur.usuario)
  return publico_(u)
}

function eliminarUsuario_(cur, yo, cache) {
  if (cur.id === yo.id) throw fail_('No puedes eliminar tu propia cuenta')
  const estados = columna_(VISITAS, 'estado')
  const pendientes = columna_(VISITAS, 'responsable').filter((r, i) => r === cur.usuario && ['Programada', 'Aceptada', 'En curso'].indexOf(estados[i]) >= 0).length
  if (pendientes) throw fail_(cur.nombre + ' tiene ' + pendientes + ' visita(s) pendiente(s): asígnalas a otra persona antes de eliminar')
  escribirUsuario_(cur._row, Object.assign({}, cur, { activo: false, eliminado: true, sesion: sesion_(cur) + 1, modificadoPor: yo.usuario, actualizado: new Date().toISOString() }))
  cache.remove('f_' + cur.usuario)
  registrar_(yo.usuario, yo.rol, 'Usuario eliminado', cur.usuario + ' (' + cur.rol + ')', 'usuario:' + cur.usuario)
  return true
}

// Dentro de una empresa no se repiten cédula, correo ni teléfono. Excepción: el propietario puede tener los mismos datos
// que el superadmin (son los que se dieron al crear la empresa). Al editar solo se revisa lo que cambia.
const DATOS_UNICOS = [
  ['cedula', 'esa cédula', (v) => String(v || '')],
  ['correo', 'ese correo', (v) => String(v || '').toLowerCase()],
  ['telefono', 'ese teléfono', (v) => String(v || '').replace(/\D/g, '')],
]
function sinDatosRepetidos_(equipo, persona, actual, cuenta) {
  const excepcion = (a, b) => a.rol === 'superadmin' && esTrue_(b.propietario)
  DATOS_UNICOS.forEach((regla) => {
    const campo = regla[0]
    const valor = regla[2](persona[campo])
    if (!valor || (actual && regla[2](actual[campo]) === valor)) return
    const choca = equipo.some((x) => !(actual && x.id === actual.id) && regla[2](x[campo]) === valor && !excepcion(x, cuenta) && !excepcion(cuenta, x))
    if (choca) throw fail_('Ya existe un usuario con ' + regla[1])
  })
}

// El indicado (si es válido y está libre) o el sugerido
function usuarioParaAlta_(d, persona, nombres) {
  const usuario = String(d.usuario || '').trim().toLowerCase() || generarUsuario_(persona.nombre, persona.cedula, nombres)
  if (!USUARIO_RE.test(usuario)) throw fail_('Usuario inválido: de 3 a 30 caracteres (letras minúsculas, números, punto, guion o guion bajo)')
  if (nombres.indexOf(usuario) >= 0) throw fail_('Ese usuario ya está en uso')
  return usuario
}

// Restablecer: la clave temporal es la cédula o una que cumpla la política; cambio obligatorio y cierre de sesiones
function ponerClaveTemporal_(u, cur, d, cache) {
  const esCedula = !!d.temporal && !!cur.cedula && String(d.clave) === String(cur.cedula)
  if (!esCedula) validarClave_(d.clave, cur.usuario)
  u.salt = Utilities.getUuid()
  u.hash = hash_(u.salt, String(d.clave))
  u.cambiarClave = true
  u.sesion = sesion_(cur) + 1
  cache.remove('f_' + cur.usuario)
}

// ---------- Superadministrador de una empresa ----------
// Solo personaliza su empresa y gestiona a sus administradores. Las listas de trabajo se le responden vacías.
function accionesSuperadmin_(req, yo, us, cache) {
  const accion = String(req.action)
  if (accion === 'configuracion_update') return guardarConfig_(yo.empresaId, String(req.seccion || ''), req, yo)
  const mu = /^usuarios_(list|sugerir|disponible|create|update|delete)$/.exec(accion)
  if (mu) return gestionUsuarios_(mu[1], req, yo, us, cache)
  if (accion === 'dashboard_resumen') return resumenVacio_()
  if (accion === 'notificaciones_list') return { items: [], noLeidas: 0 }
  if (accion === 'notificaciones_leer') return true
  if (accion === 'tecnicos_list') return []
  if (/^(visitas|informes)_list$/.test(accion)) return { items: [], total: 0, hasMore: false, antes: 0 }
  throw fail_('Sin permisos', 'FORBIDDEN')
}

// ---------- Root: empresas y sus superadministradores ----------
// Lo único que puede hacer el root. Las listas de una empresa se responden vacías porque no pertenece a ninguna.
function accionesRoot_(req, yo, us, cache) {
  const accion = String(req.action)
  const me = /^empresas_(list|create|update|admins|create_admin|restablecer_admin)$/.exec(accion)
  if (me) return gestionEmpresas_(me[1], req, yo, us, cache)
  if (accion === 'dashboard_resumen') return resumenRoot_(us)
  if (accion === 'notificaciones_list') return { items: [], noLeidas: 0 }
  if (accion === 'notificaciones_leer') return true
  if (accion === 'tecnicos_list') return []
  if (/^(visitas|informes)_list$/.test(accion)) return { items: [], total: 0, hasMore: false, antes: 0 }
  throw fail_('Sin permisos', 'FORBIDDEN')
}

// La cédula del root es la clave temporal de los superadministradores que crea
function cedulaRoot_(yo) {
  const cedula = String(yo.cedula || PropertiesService.getScriptProperties().getProperty('SUPERADMIN_CEDULA') || '').trim()
  if (motivoCedulaInvalida_(cedula)) throw fail_('Falta la cédula del root: agrega la propiedad SUPERADMIN_CEDULA en Apps Script (Configuración del proyecto)')
  return cedula
}

// Usuario del superadministrador: la primera palabra del nombre de la empresa ("Alarmas Norte" -> alarmas). Si es muy
// corta se le unen las siguientes; si ya está en uso se agregan palabras y después un número.
function usuarioDeEmpresa_(nombre, existentes) {
  const palabras = normalizar_(nombre).split(' ').filter(Boolean)
  let base = ''
  let i = 0
  while (base.length < 3 && i < palabras.length) base += palabras[i++]
  if (base.length < 3) base = 'empresa' + base
  base = base.slice(0, 30)
  const libre = (u) => existentes.indexOf(u) < 0
  if (libre(base)) return base
  while (i < palabras.length) {
    base = (base + palabras[i++]).slice(0, 30)
    if (libre(base)) return base
  }
  for (let n = 2; ; n++) if (libre(base.slice(0, 26) + n)) return base.slice(0, 26) + n
}

// Datos que se piden de una empresa nueva: son los de su superadministrador (y puede repetirlos el propietario)
function datosDueno_(d, nombreEmpresa) {
  const p = limpiarPersona_(Object.assign({}, d, { nombre: nombreEmpresa, direccion: '', cargo: 'Superadministrador' }))
  const motivo = motivoCedulaInvalida_(p.cedula)
  if (motivo) throw fail_(motivo)
  if (!CORREO_PERSONA_RE.test(p.correo) || p.correo.length > 120) throw fail_('El correo no es válido')
  const digitos = p.telefono.replace(/\D/g, '').length
  if (!TELEFONO_RE.test(p.telefono) || digitos < 7 || digitos > 15 || p.telefono.length > 40) throw fail_('El teléfono no es válido (de 7 a 15 dígitos)')
  if (!p.ciudad || p.ciudad.length > 80) throw fail_('Escribe la ciudad')
  return p
}

function crearSuperadminDeEmpresa_(empresaId, persona, usuario, clave, yo) {
  agregarUsuario_(nuevoUsuario_(Object.assign({}, persona, { usuario: usuario, rol: 'superadmin', clave: clave, empresaId: empresaId }), yo.usuario))
  registrar_(yo.usuario, yo.rol, 'Superadministrador creado', usuario, 'usuario:' + usuario, empresaId)
}

/**
 * empresas_list
 * empresas_create { data: { nombre, ciudad, cedula, correo, telefono } } -> { empresaId, usuario, clave }
 * empresas_create_admin { id, data: { ciudad, cedula, correo, telefono } }   solo si la empresa no tiene superadministrador
 * empresas_update { id, data: { activa } }                                  habilitar o deshabilitar
 * empresas_admins { id } -> superadministradores, con su clave temporal si todavía no la cambiaron
 * empresas_restablecer_admin { id (del usuario) }                            vuelve a la clave temporal
 */
function gestionEmpresas_(op, req, yo, us, cache) {
  const d = req.data || {}
  const nombres = us.map((u) => String(u.usuario))

  if (op === 'list') {
    return empresas_()
      .map((e) => ({
        id: e.id,
        nombre: e.nombre,
        plan: e.plan,
        activa: esTrue_(e.activa),
        creado: e.creado,
        usuarios: us.filter((u) => u.empresaId === e.id && vigente_(u)).length,
        datos: configuracion_(e.id).empresa,
      }))
      .sort((a, b) => menorQue_(String(b.creado), String(a.creado)))
  }

  if (op === 'create') {
    const nombre = String(d.nombre || '').trim()
    if (!nombre) throw fail_('Escribe el nombre de la empresa')
    const p = datosDueno_(d, nombre)
    const datos = validarConfig_('empresa', Object.assign({}, CONFIG_DEFECTO.empresa, { nombre: nombre, direccion: p.ciudad, telefono: p.telefono, correo: p.correo }))
    const clave = cedulaRoot_(yo)
    const usuario = usuarioDeEmpresa_(nombre, nombres)
    // todo validado: recién entonces se escribe
    const empresa = agregarEmpresa_(nombre, 'prueba', yo.usuario)
    escribirSeccion_(empresa.id, 'empresa', datos, yo.usuario)
    crearSuperadminDeEmpresa_(empresa.id, p, usuario, clave, yo)
    registrar_(yo.usuario, yo.rol, 'Empresa creada', nombre, 'empresa:' + empresa.id, empresa.id)
    return { empresaId: empresa.id, usuario: usuario, clave: clave }
  }

  if (op === 'restablecer_admin') {
    const cur = us.filter((u) => u.id === req.id && u.rol === 'superadmin' && vigente_(u))[0]
    if (!cur) throw fail_('No encontrado')
    const clave = cedulaRoot_(yo)
    const u = Object.assign({}, cur, { modificadoPor: yo.usuario, actualizado: new Date().toISOString() })
    u.salt = Utilities.getUuid()
    u.hash = hash_(u.salt, clave)
    u.cambiarClave = true
    u.sesion = sesion_(cur) + 1
    cache.remove('f_' + cur.usuario)
    escribirUsuario_(cur._row, u)
    registrar_(yo.usuario, yo.rol, 'Clave restablecida', cur.usuario + ' (superadministrador)', 'usuario:' + cur.usuario, cur.empresaId)
    return { usuario: cur.usuario, clave: clave }
  }

  const empresa = empresaPorId_(req.id)
  if (!empresa) throw fail_('No encontrado')
  const supers = us.filter((u) => u.empresaId === empresa.id && u.rol === 'superadmin' && vigente_(u))

  if (op === 'admins') {
    let temporal = ''
    try {
      temporal = cedulaRoot_(yo)
    } catch (e) {}
    // Las claves se guardan cifradas: solo se puede mostrar la temporal mientras no la hayan cambiado
    return supers.map((u) => ({
      id: u.id,
      usuario: u.usuario,
      nombre: u.nombre,
      correo: u.correo || '',
      cedula: u.cedula || '',
      activo: esActivo_(u),
      claveTemporal: temporal && esTrue_(u.cambiarClave) && claveCorrecta_(u, temporal) ? temporal : '',
    }))
  }
  if (op === 'create_admin') {
    if (supers.length) throw fail_('La empresa ya tiene superadministrador')
    const p = datosDueno_(d, empresa.nombre)
    const clave = cedulaRoot_(yo)
    const usuario = usuarioDeEmpresa_(empresa.nombre, nombres)
    crearSuperadminDeEmpresa_(empresa.id, p, usuario, clave, yo)
    return { empresaId: empresa.id, usuario: usuario, clave: clave }
  }
  // update: el root solo habilita o deshabilita; los datos los cambia el superadministrador de la empresa
  if (d.activa === undefined) throw fail_('Solo puedes habilitar o deshabilitar la empresa', 'FORBIDDEN')
  const activa = !!d.activa
  const fila = columna_(EMPRESAS, 'id').indexOf(empresa.id) + 2
  escribir_(EMPRESAS, fila, Object.assign({}, leerFila_(EMPRESAS, fila), { activa: activa, modificadoPor: yo.usuario, actualizado: new Date().toISOString() }))
  olvidarEmpresas_()
  registrar_(yo.usuario, yo.rol, activa ? 'Empresa activada' : 'Empresa desactivada', empresa.nombre, 'empresa:' + empresa.id, empresa.id)
  return true
}

// ---------- Inicio (dashboard): cifras según lo que cada rol puede ver ----------
// El inicio del root solo resume las empresas
function resumenRoot_(us) {
  const hoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')
  const lista = empresas_()
  const contar = (l, f) => l.filter(f).length
  return Object.assign(resumenVacio_(), {
    plataforma: {
      empresas: lista.length,
      activas: contar(lista, (e) => esTrue_(e.activa)),
      usuarios: contar(us, (u) => !esRoot_(u) && esActivo_(u)),
      nuevasMes: contar(lista, (e) => String(e.creado) >= hoy.slice(0, 7) + '-01'),
      porPlan: lista.reduce((r, e) => Object.assign(r, { [e.plan]: (r[e.plan] || 0) + 1 }), {}),
    },
  })
}

const resumenVacio_ = () => ({
  hoy: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
  visitasHoy: 0, proximas: 0, porAceptar: 0, enCurso: 0, realizadasMes: 0, atrasadas: 0,
  informesBorrador: 0, informesFinalizadosMes: 0, clientes: 0, tecnicos: 0, porDia: [], proximasLista: [], ultimosInformes: [],
})

function resumen_(yo, equipo) {
  const tz = Session.getScriptTimeZone()
  const dia = (n) => Utilities.formatDate(new Date(Date.now() + n * 86400000), tz, 'yyyy-MM-dd')
  const hoy = dia(0)
  const mesIni = hoy.slice(0, 7) + '-01'
  const vv = leer_(VISITAS, true).filter((v) => puedeVer_('visitas', v, yo))
  const ii = leer_(INFORMES, true).filter((i) => puedeVer_('informes', i, yo))
  const contar = (lista, f) => lista.filter(f).length
  const abierta = (v) => ['Programada', 'Aceptada', 'En curso'].indexOf(v.estado) >= 0
  const momento = (v) => v.fecha + ' ' + v.hora
  const elegir = (campos) => (o) => campos.reduce((r, c) => Object.assign(r, { [c]: o[c] }), {})

  return {
    hoy: hoy,
    visitasHoy: contar(vv, (v) => v.fecha === hoy && v.estado !== 'Cancelada'),
    proximas: contar(vv, (v) => v.fecha > hoy && (v.estado === 'Programada' || v.estado === 'Aceptada')),
    porAceptar: contar(vv, (v) => v.estado === 'Programada' && v.fecha >= hoy),
    enCurso: contar(vv, (v) => v.estado === 'En curso'),
    realizadasMes: contar(vv, (v) => v.estado === 'Realizada' && v.fecha >= mesIni),
    atrasadas: contar(vv, (v) => v.fecha < hoy && abierta(v)),
    informesBorrador: contar(ii, (i) => i.estado === 'Borrador'),
    informesFinalizadosMes: contar(ii, (i) => i.estado === 'Finalizado' && i.fecha >= mesIni),
    clientes: yo.rol === 'tecnico' ? 0 : contar(columna_(CLIENTES, 'empresaId'), (e) => e === yo.empresaId),
    tecnicos: contar(equipo, (u) => u.rol === 'tecnico' && esActivo_(u)),
    porDia: Array.from({ length: 14 }, (_, k) => {
      const fecha = dia(k - 6)
      return { fecha: fecha, total: contar(vv, (v) => v.fecha === fecha && v.estado !== 'Cancelada') }
    }),
    proximasLista: vv
      .filter((v) => v.fecha >= hoy && abierta(v))
      .sort((a, b) => menorQue_(momento(a), momento(b)))
      .slice(0, 5)
      .map(elegir(['id', 'fecha', 'hora', 'cliente', 'tipo', 'estado'])),
    ultimosInformes: ii
      .sort((a, b) => menorQue_(String(b.creado), String(a.creado)))
      .slice(0, 5)
      .map(elegir(['id', 'numero', 'titulo', 'cliente', 'estado', 'fecha'])),
  }

}
