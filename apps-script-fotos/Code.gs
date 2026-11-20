/**
 * ServiTec SaaS: servicio de fotos en Google Drive.
 *
 * Es un Apps Script aparte, publicado como aplicación web (ejecutar como: tú; acceso: cualquier persona).
 * No guarda datos: cada llamada trae el token de sesión de Supabase del usuario y el script lo reenvía a la base,
 * así que es la base (RLS) quien decide quién puede subir, ver o borrar. El script solo mueve archivos en Drive.
 *
 * Estructura en Drive:  ServiTec Fotos / <Empresa (id)> / <usuario> / <AAAA-MM> / archivo.jpg
 *
 * Propiedades de la secuencia de comandos (Configuración del proyecto > Propiedades):
 *   SUPABASE_URL        https://xxxx.supabase.co
 *   SUPABASE_ANON_KEY   clave pública (anon) del proyecto
 *   RAIZ_ID             (opcional) id de la carpeta raíz; si falta se crea "ServiTec Fotos" en tu Drive
 *
 * Acciones (POST, cuerpo JSON en text/plain): subir, obtener, eliminar, eliminar_de_visita. Todas llevan { token }.
 */
const MAX_BYTES = 8 * 1024 * 1024 // tope de una foto (ya comprimida por la app)

function doGet() {
  return salida_({ ok: true, data: 'ServiTec fotos' })
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents)
    if (!req.token) throw fallo_('Sesión expirada', 'AUTH')
    const acciones = { subir: subir_, obtener: obtener_, eliminar: eliminar_, eliminar_de_visita: eliminarDeVisita_ }
    if (!acciones[req.action]) throw fallo_('Acción inválida')
    return salida_({ ok: true, data: acciones[req.action](req) })
  } catch (err) {
    return salida_({ ok: false, error: err.message || String(err), code: err.code || '' })
  }
}

function salida_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)
}
function fallo_(msg, code) {
  const e = new Error(msg)
  e.code = code || ''
  return e
}

// ---------------------------------------------------------------- Supabase (con el token del usuario)

function prop_(clave) {
  const v = PropertiesService.getScriptProperties().getProperty(clave)
  if (!v) throw fallo_('Falta configurar ' + clave + ' en el servicio de fotos')
  return v
}

// Llamada a PostgREST con el token del usuario. Devuelve el JSON (o null si no hay cuerpo).
function db_(token, metodo, ruta, cuerpo) {
  const res = UrlFetchApp.fetch(prop_('SUPABASE_URL') + '/rest/v1/' + ruta, {
    method: metodo,
    contentType: 'application/json',
    headers: { apikey: prop_('SUPABASE_ANON_KEY'), Authorization: 'Bearer ' + token, Prefer: 'return=representation' },
    payload: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    muteHttpExceptions: true,
  })
  const codigo = res.getResponseCode()
  const texto = res.getContentText()
  const json = texto ? JSON.parse(texto) : null
  if (codigo === 401 || (json && (json.code === 'PGRST301' || json.code === 'PGRST303'))) throw fallo_('Sesión expirada', 'AUTH')
  if (codigo >= 400) throw fallo_((json && json.message) || 'Error de la base de datos', codigo === 403 ? 'FORBIDDEN' : '')
  return json
}

// ---------------------------------------------------------------- Drive

function raiz_() {
  const props = PropertiesService.getScriptProperties()
  const id = props.getProperty('RAIZ_ID')
  if (id) return DriveApp.getFolderById(id)
  const it = DriveApp.getFoldersByName('ServiTec Fotos')
  const carpeta = it.hasNext() ? it.next() : DriveApp.createFolder('ServiTec Fotos')
  props.setProperty('RAIZ_ID', carpeta.getId())
  return carpeta
}

// Una carpeta guardada en la base solo se acepta si realmente cuelga de la esperada: así nadie puede
// apuntar la subida a una carpeta ajena de tu Drive escribiendo un id en su perfil.
function carpetaValida_(id, padre) {
  if (!id) return null
  try {
    const c = DriveApp.getFolderById(id)
    if (c.isTrashed()) return null
    const padres = c.getParents()
    while (padres.hasNext()) if (padres.next().getId() === padre.getId()) return c
  } catch (e) {
    /* carpeta borrada o sin acceso: se vuelve a crear */
  }
  return null
}

function subcarpeta_(padre, nombre) {
  const it = padre.getFoldersByName(nombre)
  return it.hasNext() ? it.next() : padre.createFolder(nombre)
}

const limpiarNombre_ = (s) => String(s || '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 80) || 'sin nombre'

// Devuelve la carpeta del mes del usuario, creando (y registrando en la base) lo que falte
function carpetaDestino_(token, ctx) {
  const base = raiz_()
  let emp = carpetaValida_(ctx.carpetaEmpresa, base)
  if (!emp) {
    emp = subcarpeta_(base, limpiarNombre_(ctx.empresaNombre) + ' (' + String(ctx.empresaId).slice(0, 8) + ')')
    db_(token, 'POST', 'rpc/guardar_carpeta_drive', { p_nivel: 'empresa', p_drive_id: emp.getId() })
  }
  let usu = carpetaValida_(ctx.carpetaUsuario, emp)
  if (!usu) {
    usu = subcarpeta_(emp, limpiarNombre_(ctx.usuario))
    db_(token, 'POST', 'rpc/guardar_carpeta_drive', { p_nivel: 'usuario', p_drive_id: usu.getId() })
  }
  let mes = carpetaValida_(ctx.carpetaMes, usu)
  if (!mes) {
    mes = subcarpeta_(usu, ctx.mes)
    db_(token, 'POST', 'rpc/guardar_carpeta_drive', { p_nivel: 'mes', p_drive_id: mes.getId(), p_mes: ctx.mes })
  }
  return mes
}

const aFoto_ = (f) => ({ id: f.id, visitaId: f.visita_id, nombre: f.nombre, mini: f.mini, autor: f.autor, creado: f.creado })

// ---------------------------------------------------------------- acciones

// subir { token, id, visitaId, imagen (base64 JPEG), mini }
function subir_(req) {
  const token = req.token
  if (!req.id || !req.visitaId || !req.imagen) throw fallo_('Faltan datos de la foto')
  if (String(req.imagen).length * 0.75 > MAX_BYTES) throw fallo_('La foto es demasiado grande')
  // Reintento de una subida ya hecha: se devuelve la foto existente sin duplicar el archivo
  const previa = db_(token, 'GET', 'fotos?select=*&id=eq.' + encodeURIComponent(req.id))
  if (previa && previa.length) return aFoto_(previa[0])

  const ctx = db_(token, 'POST', 'rpc/foto_contexto', { p_visita_id: req.visitaId }) // valida permisos, estado y límite
  const carpeta = carpetaDestino_(token, ctx)
  const nombre = limpiarNombre_(ctx.fecha + '_' + ctx.cliente) + '_' + String(req.id).slice(0, 8) + '.jpg'
  const archivo = carpeta.createFile(Utilities.newBlob(Utilities.base64Decode(req.imagen), 'image/jpeg', nombre))
  try {
    const filas = db_(token, 'POST', 'fotos', { id: req.id, visita_id: req.visitaId, drive_id: archivo.getId(), nombre: nombre, mini: req.mini || '', mes: ctx.mes })
    return aFoto_(filas[0])
  } catch (e) {
    archivo.setTrashed(true) // la base rechazó la foto: no queda un archivo huérfano
    throw e
  }
}

// obtener { token, id } -> { dataUrl }
function obtener_(req) {
  const f = db_(req.token, 'GET', 'fotos?select=drive_id&id=eq.' + encodeURIComponent(req.id))
  if (!f || !f.length) throw fallo_('Foto no encontrada')
  const bytes = DriveApp.getFileById(f[0].drive_id).getBlob().getBytes()
  return { dataUrl: 'data:image/jpeg;base64,' + Utilities.base64Encode(bytes) }
}

// eliminar { token, id }: la base decide si puede (gestor o autor); el archivo va a la papelera de Drive
function eliminar_(req) {
  const borradas = db_(req.token, 'DELETE', 'fotos?id=eq.' + encodeURIComponent(req.id) + '&select=drive_id')
  if (!borradas || !borradas.length) throw fallo_('No encontrado')
  papelera_(borradas[0].drive_id)
  return true
}

// eliminar_de_visita { token, visitaId }: antes de borrar una visita, sus fotos van a la papelera de Drive
function eliminarDeVisita_(req) {
  const ids = db_(req.token, 'POST', 'rpc/fotos_de_visita', { p_visita_id: req.visitaId }) || []
  ids.forEach(papelera_)
  return ids.length
}

function papelera_(driveId) {
  try {
    DriveApp.getFileById(driveId).setTrashed(true)
  } catch (e) {
    /* ya no existe en Drive */
  }
}
