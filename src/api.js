// Capa de transporte: Google Apps Script (producción) o localStorage (modo demo, sin VITE_SCRIPT_URL).
import { validarClave, normalizar } from './utils'
import { combinar } from './configuracion'
import { valorSeccion, SECCIONES } from './validarConfig'
import { crearCapaOffline } from './offline/capa.js'
import { iniciarConexion } from './offline/conexion.js'
import { estado } from './offline/estado.js'
import { crearTransporte } from './supabase/transporte.js'

// Prioridad: Supabase (SaaS) > Google Apps Script (heredado) > modo demo (localStorage)
const SCRIPT_URL = import.meta.env.VITE_SCRIPT_URL
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
export const modoSupabase = !!SUPABASE_URL
export const modoDemo = !SCRIPT_URL && !modoSupabase
const supabase = modoSupabase ? crearTransporte({ url: SUPABASE_URL, anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY, fotosUrl: import.meta.env.VITE_FOTOS_URL }) : null
export const SESION_KEY = 'ferisel-sesion'

let onAuthError = () => {}
export const setAuthHandler = (fn) => (onAuthError = fn)
let onClaveObligatoria = () => {}
export const setClaveHandler = (fn) => (onClaveObligatoria = fn)

const sesionLocal = () => {
  try {
    return JSON.parse(localStorage.getItem(SESION_KEY))
  } catch {
    return null
  }
}
const tokenActual = () => sesionLocal()?.token

function error(msg, code = '') {
  const e = new Error(msg)
  e.code = code
  return e
}

// Una petición al backend. Un fallo de conexión (sin red, tiempo agotado, respuesta ilegible) se señala con code 'RED';
// un error que responde el servidor conserva el code del servidor (AUTH, FORBIDDEN, ...).
async function llamarRed(action, payload) {
  if (supabase) return supabase.call(action, payload)
  const control = new AbortController()
  const limite = setTimeout(() => control.abort(), action === 'fotos_upload' ? 90000 : 25000)
  let res
  try {
    res = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita preflight CORS
      body: JSON.stringify({ action, token: tokenActual(), ...payload }),
      signal: control.signal,
    })
  } catch {
    throw error('Sin conexión con el servidor', 'RED')
  } finally {
    clearTimeout(limite)
  }
  let json
  try {
    json = await res.json()
  } catch {
    throw error('El servidor no respondió correctamente', 'RED') // p. ej. error 5xx de Google: se reintenta luego
  }
  if (!json.ok) throw error(json.error || 'Error del servidor', json.code)
  return json.data
}

// Modo sin conexión: lecturas con copia local, cambios en cola y reintentos (ver src/offline). No aplica al modo demo.
export const offline = modoDemo
  ? null
  : crearCapaOffline({
      red: llamarRed,
      sesion: () => {
        const s = sesionLocal()
        return s?.usuario ? { usuarioId: s.usuario.id, usuario: s.usuario.usuario } : null
      },
    })
if (offline) {
  estado.enLinea = typeof navigator === 'undefined' || navigator.onLine !== false
  offline.ganchos.alExpirarSesion = (codigo) => (codigo === 'AUTH' ? onAuthError() : onClaveObligatoria())
}

/** Vigila la conexión y envía los cambios en cola. Devuelve la función que lo detiene. */
export const iniciarSincronizacion = (opciones) => (offline ? iniciarConexion(offline, opciones) : () => {})

/** Al cerrar sesión: borra las copias de lectura (pueden ser datos de clientes). Los cambios pendientes se conservan. */
export const limpiarDatosLocales = () => offline?.limpiarLecturas()

export async function call(action, payload = {}) {
  try {
    if (modoDemo) return await demo(action, payload, tokenActual())
    return await offline.call(action, payload)
  } catch (e) {
    if (e.code === 'AUTH' && action !== 'login') onAuthError()
    if (e.code === 'CAMBIAR_CLAVE') onClaveObligatoria()
    throw e
  }
}

// ---------------- Modo demo (espejo de apps-script/Code.gs) ----------------
const LS_U = 'ferisel-demo-usuarios'
const LS_F = 'ferisel-demo-fotos'
const LS_N = 'ferisel-demo-notificaciones'
const LS_C = 'ferisel-demo-clientes'
const LS_CFG = 'ferisel-demo-config'
const RECURSOS = { informes: 'ferisel-demo-informes', visitas: 'ferisel-demo-visitas' }
const leer = (k, def) => JSON.parse(localStorage.getItem(k) || JSON.stringify(def))
const escribir = (k, v) => localStorage.setItem(k, JSON.stringify(v))
const publico = ({ clave, ...u }) => ({ ...u, cambiarClave: !!u.cambiarClave })

// Bloqueo por intentos fallidos (misma regla que Code.gs: 5 fallos = 15 min)
const LS_INT = 'ferisel-demo-intentos'
const MAX_INTENTOS = 5
const BLOQUEO_MS = 15 * 60 * 1000
const MSG_BLOQUEO = 'Demasiados intentos fallidos. Intenta de nuevo en 15 minutos.'
const bloqueadoDemo = (nombre) => {
  const r = leer(LS_INT, {})[nombre]
  return !!r && r.n >= MAX_INTENTOS && r.hasta > Date.now()
}
function falloDemo(nombre, mensaje) {
  const t = leer(LS_INT, {})
  const n = (t[nombre] && t[nombre].hasta > Date.now() ? t[nombre].n : 0) + 1
  t[nombre] = { n, hasta: Date.now() + BLOQUEO_MS }
  escribir(LS_INT, t)
  return n >= MAX_INTENTOS ? error(MSG_BLOQUEO, 'LOCKED') : error(mensaje)
}
function limpiarFallos(nombre) {
  const t = leer(LS_INT, {})
  delete t[nombre]
  escribir(LS_INT, t)
}

function usuariosDemo() {
  let u = leer(LS_U, null)
  if (!u) {
    u = [
      { id: 'u1', usuario: 'superadmin', nombre: 'Super Admin', rol: 'superadmin', clave: 'superadmin123', activo: true },
      { id: 'u2', usuario: 'admin', nombre: 'Administrador', rol: 'admin', clave: 'admin123', activo: true },
    ]
  }
  if (!u.some((x) => x.rol === 'tecnico')) {
    u.push({ id: 'u3', usuario: 'tecnico', nombre: 'Técnico Demo', rol: 'tecnico', clave: 'tecnico123', activo: true })
  }
  escribir(LS_U, u)
  return u
}

// Visibilidad por rol (mismas reglas que puedeVer_ en Code.gs)
function puedeVer(recurso, item, yo, idsVisitasPropias) {
  if (yo.rol === 'superadmin') return true
  if (recurso === 'visitas') return yo.rol === 'tecnico' ? item.responsable === yo.usuario : item.autor === yo.usuario
  if (item.autor === yo.usuario) return true
  return yo.rol === 'admin' && !!item.visitaId && idsVisitasPropias.includes(item.visitaId)
}

const ESTADOS_VISITA = ['Programada', 'Aceptada', 'En curso', 'Realizada', 'Cancelada']
const TRANSICIONES_TECNICO = { Programada: ['Aceptada', 'Cancelada'], Aceptada: ['En curso', 'Cancelada'], 'En curso': ['Realizada', 'Cancelada'] }
const ESTADOS_CON_INFORME = ['Aceptada', 'En curso', 'Realizada']

const checklistCompleta = (texto) => !texto || JSON.parse(texto).every((i) => i.resultado && (i.resultado !== 'falla' || String(i.obs || '').trim()))

function siguienteNumero(informes) {
  const prefijo = `${configDemo().informes.prefijo}-${new Date().getFullYear()}-`
  const max = informes.reduce((m, i) => (String(i.numero).startsWith(prefijo) ? Math.max(m, parseInt(String(i.numero).slice(prefijo.length), 10) || 0) : m), 0)
  return `${prefijo}${String(max + 1).padStart(4, '0')}`
}

// Listados paginados y livianos (mismo contrato que listar_ en Code.gs):
//  informes_list { q, estado, visitaId, limit, offset } -> { items, total, hasMore }  (sin descripcion/checklist/firma)
//  visitas_list  { desde, hasta, orden, limit, offset } -> { items, total, hasMore, antes }
function listarDemo(nombre, p, lista, ver) {
  const esInformes = nombre === 'informes'
  const tope = esInformes ? 100 : 500
  const limite = Math.min(tope, Math.max(1, parseInt(p.limit, 10) || (esInformes ? 50 : 500)))
  const offset = Math.max(0, parseInt(p.offset, 10) || 0)
  let items = lista.filter(ver)
  let antes = 0

  if (esInformes) {
    const q = String(p.q || '').trim().toLowerCase().slice(0, 60)
    items = items.filter(
      (i) =>
        (!p.visitaId || i.visitaId === p.visitaId) &&
        (!p.estado || i.estado === p.estado) &&
        (!q || [i.titulo, i.cliente, i.numero, i.responsable].some((c) => String(c || '').toLowerCase().includes(q))),
    )
    items.sort((a, b) => (b.fecha > a.fecha ? 1 : b.fecha < a.fecha ? -1 : String(b.creado) > String(a.creado) ? 1 : -1))
    // eslint-disable-next-line no-unused-vars
    items = items.map(({ descripcion, checklist, firma, ...liviano }) => liviano)
  } else {
    const esFecha = /^\d{4}-\d{2}-\d{2}$/
    const desde = esFecha.test(p.desde) ? p.desde : ''
    const hasta = esFecha.test(p.hasta) ? p.hasta : ''
    if (desde) antes = items.filter((v) => v.fecha < desde).length
    const q = String(p.q || '').trim().toLowerCase().slice(0, 60)
    items = items.filter(
      (v) =>
        (!desde || v.fecha >= desde) && (!hasta || v.fecha <= hasta) && (!p.clienteId || v.clienteId === p.clienteId) &&
        (!q || [v.cliente, v.direccion, v.tipo].some((c) => String(c || '').toLowerCase().includes(q))),
    )
    const signo = p.orden === 'desc' ? -1 : 1
    items.sort((a, b) => {
      const x = `${a.fecha} ${a.hora}`
      const y = `${b.fecha} ${b.hora}`
      return signo * (x < y ? -1 : x > y ? 1 : 0)
    })
  }
  return { items: items.slice(offset, offset + limite), total: items.length, hasMore: offset + limite < items.length, antes }
}

// Avisos en modo demo: asignación, cambios de estado y informe finalizado (Code.gs avisa además reprogramaciones y recordatorios)
function avisarDemo(usuarios, n, actor) {
  const todas = leer(LS_N, [])
  for (const usuario of new Set(usuarios)) {
    if (usuario && usuario !== actor) todas.push({ id: crypto.randomUUID(), usuario, ref: '', ...n, creado: new Date().toISOString(), leida: false })
  }
  escribir(LS_N, todas)
}

// Catálogo de clientes en modo demo (misma idea que Code.gs: el cliente se registra solo al agendar una visita)
function asegurarClienteDemo(v, actor) {
  const clave = normalizar(v.cliente)
  if (!clave) return ''
  const cs = leer(LS_C, [])
  const c = cs.find((x) => x.clave === clave)
  if (c) {
    if (!c.direccion && v.direccion) c.direccion = v.direccion
    if (!c.telefono && v.telefono) c.telefono = v.telefono
    escribir(LS_C, cs)
    return c.id
  }
  const ahora = new Date().toISOString()
  const nuevo = { id: crypto.randomUUID(), clave, nombre: String(v.cliente).trim(), direccion: v.direccion || '', telefono: v.telefono || '', autor: actor, creado: ahora, modificadoPor: actor, actualizado: ahora }
  escribir(LS_C, [...cs, nuevo])
  return nuevo.id
}

// Configuración (marca, informes, tipos) en modo demo: misma validación que guardarConfig_ en Code.gs
function configDemo() {
  return combinar(leer(LS_CFG, null))
}

function guardarConfigDemo(seccion, p) {
  const actual = leer(LS_CFG, {})
  if (p.restablecer) {
    if (!SECCIONES.includes(seccion)) throw error('Sección inválida')
    delete actual[seccion]
  } else {
    try {
      actual[seccion] = valorSeccion(seccion, p.data)
    } catch (e) {
      throw error(e.message)
    }
  }
  escribir(LS_CFG, actual)
  return configDemo()
}

function validarResponsable(r, us) {
  if (r && !us.some((x) => x.usuario === r && x.activo && x.rol === 'tecnico')) throw error('Técnico inválido')
}

async function demo(action, p, token) {
  const us = usuariosDemo()
  if (action === 'login') {
    const nombre = String(p.usuario || '').trim().toLowerCase().slice(0, 40)
    if (bloqueadoDemo(nombre)) throw error(MSG_BLOQUEO, 'LOCKED')
    const u = us.find((x) => x.usuario === nombre)
    if (!u || u.clave !== p.clave || !u.activo) throw falloDemo(nombre, 'Usuario o clave incorrectos')
    limpiarFallos(nombre)
    return { token: u.id, usuario: publico(u) }
  }
  if (action === 'logout') return true
  if (action === 'configuracion_get') return configDemo() // pública, como en Code.gs
  const yo = us.find((x) => x.id === token && x.activo)
  if (!yo) throw error('Sesión expirada', 'AUTH')
  const esSuper = yo.rol === 'superadmin'
  const ahora = new Date().toISOString()

  if (action === 'me') return publico(yo)
  if (action === 'cambiar_clave') {
    if (bloqueadoDemo(yo.usuario)) throw error(MSG_BLOQUEO, 'LOCKED')
    if (yo.clave !== p.actual) throw falloDemo(yo.usuario, 'La clave actual no es correcta')
    const msg = validarClave(p.nueva, yo.usuario)
    if (msg) throw error(msg)
    if (p.nueva === p.actual) throw error('La nueva clave debe ser distinta a la actual')
    limpiarFallos(yo.usuario)
    const i = us.findIndex((x) => x.id === yo.id)
    us[i] = { ...us[i], clave: p.nueva, cambiarClave: false }
    escribir(LS_U, us)
    return { token: yo.id, usuario: publico(us[i]) }
  }
  // Mientras la clave sea temporal, nada más funciona
  if (yo.cambiarClave) throw error('Debes cambiar tu clave para continuar', 'CAMBIAR_CLAVE')
  if (action === 'tecnicos_list') return us.filter((x) => x.rol === 'tecnico' && x.activo).map((x) => ({ usuario: x.usuario, nombre: x.nombre }))

  if (action === 'notificaciones_list') {
    const mias = leer(LS_N, []).filter((n) => n.usuario === yo.usuario)
    const noLeidas = mias.filter((n) => !n.leida).length
    if (p.resumen) return { noLeidas }
    return { items: mias.sort((a, b) => (a.creado < b.creado ? 1 : -1)).slice(0, 50), noLeidas }
  }
  if (action === 'notificaciones_leer') {
    const todas = leer(LS_N, []).map((n) => (n.usuario === yo.usuario && (p.todas || (p.ids || []).includes(n.id)) ? { ...n, leida: true } : n))
    escribir(LS_N, todas)
    return true
  }

  if (action.startsWith('clientes_')) {
    if (yo.rol === 'tecnico') throw error('Sin permisos', 'FORBIDDEN')
    const cs = leer(LS_C, [])
    const publicoC = ({ clave, ...c }) => c
    const op = action.slice('clientes_'.length)
    const datos = (d) => {
      const nombre = String(d.nombre || '').trim()
      if (!nombre) throw error('Escribe el nombre del cliente')
      return { nombre, direccion: String(d.direccion || '').trim(), telefono: String(d.telefono || '').trim(), clave: normalizar(nombre) }
    }
    if (op === 'list') {
      const q = normalizar(p.q)
      const items = cs.filter((c) => !q || c.clave.includes(q) || normalizar(c.direccion).includes(q) || normalizar(c.telefono).includes(q)).sort((a, b) => (a.clave < b.clave ? -1 : 1))
      const limite = Math.min(100, Math.max(1, parseInt(p.limit, 10) || 50))
      const offset = Math.max(0, parseInt(p.offset, 10) || 0)
      return { items: items.slice(offset, offset + limite).map(publicoC), total: items.length, hasMore: offset + limite < items.length }
    }
    const ahora = new Date().toISOString()
    if (op === 'create') {
      const d = datos(p.data || {})
      if (cs.some((c) => c.clave === d.clave)) throw error('Ya existe un cliente con ese nombre')
      const c = { id: crypto.randomUUID(), ...d, autor: yo.usuario, creado: ahora, modificadoPor: yo.usuario, actualizado: ahora }
      escribir(LS_C, [...cs, c])
      return publicoC(c)
    }
    const i = cs.findIndex((c) => c.id === p.id)
    if (i < 0) throw error('No encontrado')
    if (op === 'update') {
      const d = datos({ ...cs[i], ...p.data })
      if (d.clave !== cs[i].clave && cs.some((c) => c.clave === d.clave)) throw error('Ya existe un cliente con ese nombre')
      cs[i] = { ...cs[i], ...d, modificadoPor: yo.usuario, actualizado: ahora }
      escribir(LS_C, cs)
      return publicoC(cs[i])
    }
    if (!esSuper) throw error('Sin permisos', 'FORBIDDEN')
    if (leer(RECURSOS.visitas, []).some((v) => v.clienteId === cs[i].id)) throw error('El cliente tiene visitas registradas y no se puede eliminar')
    escribir(LS_C, cs.filter((c) => c.id !== p.id))
    return true
  }

  // CRUD genérico de informes y visitas
  const m = /^(informes|visitas)_(list|get|create|update|delete)$/.exec(action)
  if (m) {
    const [, nombre, op] = m
    const key = RECURSOS[nombre]
    const lista = leer(key, [])
    const visitas = leer(RECURSOS.visitas, [])
    const propias = yo.rol === 'admin' ? visitas.filter((v) => v.autor === yo.usuario).map((v) => v.id) : []
    const ver = (i) => puedeVer(nombre, i, yo, propias)

    if (op === 'list') return listarDemo(nombre, p, lista, ver)
    if (nombre === 'visitas' && yo.rol === 'tecnico' && op !== 'update' && op !== 'get') throw error('Sin permisos', 'FORBIDDEN')

    if (op === 'create') {
      if (nombre === 'visitas') validarResponsable(p.data.responsable, us)
      if (nombre === 'informes' && p.data.visitaId) {
        const v = visitas.find((x) => x.id === p.data.visitaId)
        if (!v || !puedeVer('visitas', v, yo, [])) throw error('Visita no encontrada')
        if (yo.rol === 'tecnico' && !ESTADOS_CON_INFORME.includes(v.estado)) throw error('Acepta la visita antes de crear su informe')
      }
      const item = { ...p.data, id: p.data.id || crypto.randomUUID(), autor: yo.usuario, creado: ahora, actualizado: ahora }
      if (nombre === 'informes') {
        if (item.estado === 'Finalizado' && !checklistCompleta(item.checklist)) throw error('Completa el checklist (y observaciones de las fallas) para finalizar')
        item.numero = siguienteNumero(lista)
      }
      if (nombre === 'visitas') item.clienteId = asegurarClienteDemo(item, yo.usuario) // el cliente queda registrado
      escribir(key, [item, ...lista])
      if (nombre === 'visitas' && item.responsable) {
        avisarDemo([item.responsable], { tipo: 'visita_asignada', titulo: 'Nueva visita asignada', mensaje: `${item.cliente}\n${item.fecha} ${item.hora}`, ref: `visita:${item.id}` }, yo.usuario)
      }
      return item
    }

    const i = lista.findIndex((x) => x.id === p.id)
    if (i < 0 || !ver(lista[i])) throw error('No encontrado')
    if (op === 'get') return lista[i]

    if (op === 'update') {
      let d = { ...p.data }
      if (nombre === 'visitas') {
        const cur = lista[i]
        if (yo.rol === 'tecnico') {
          d = { estado: d.estado ?? cur.estado, notas: d.notas ?? cur.notas, motivo: d.motivo ?? cur.motivo }
          if (d.estado !== cur.estado && !(TRANSICIONES_TECNICO[cur.estado] || []).includes(d.estado)) throw error('Cambio de estado no permitido')
        }
        if (d.estado !== undefined && !ESTADOS_VISITA.includes(d.estado)) throw error('Estado inválido')
        const estadoFinal = d.estado ?? cur.estado
        const motivoFinal = d.motivo ?? cur.motivo
        if (estadoFinal === 'Cancelada' && !String(motivoFinal || '').trim()) throw error('Indica el motivo de la cancelación')
      }
      if (nombre === 'visitas' && d.responsable !== undefined && d.responsable !== lista[i].responsable) validarResponsable(d.responsable, us)
      if (nombre === 'informes') {
        delete d.visitaId
        delete d.numero
        if (lista[i].estado === 'Finalizado' && !esSuper) throw error('Informe finalizado: solo el superadmin puede modificarlo', 'FORBIDDEN')
      }
      const previo = lista[i]
      lista[i] = { ...previo, ...d, id: p.id, autor: previo.autor, creado: previo.creado, modificadoPor: yo.usuario, actualizado: ahora }
      if (nombre === 'visitas' && yo.rol !== 'tecnico' && (!lista[i].clienteId || normalizar(lista[i].cliente) !== normalizar(previo.cliente))) {
        lista[i].clienteId = asegurarClienteDemo(lista[i], yo.usuario)
      }
      if (nombre === 'informes' && lista[i].estado === 'Finalizado' && !checklistCompleta(lista[i].checklist)) throw error('Completa el checklist (y observaciones de las fallas) para finalizar')
      escribir(key, lista)
      if (nombre === 'visitas' && previo.estado !== lista[i].estado && yo.rol === 'tecnico') {
        const rechazo = lista[i].estado === 'Cancelada' && previo.estado === 'Programada'
        avisarDemo([previo.autor], { tipo: 'visita_estado', titulo: rechazo ? 'Visita rechazada' : `Visita ${lista[i].estado.toLowerCase()}`, mensaje: `${yo.nombre}\n${lista[i].cliente}${lista[i].motivo && lista[i].estado === 'Cancelada' ? `\nMotivo: ${lista[i].motivo}` : ''}`, ref: `visita:${previo.id}` }, yo.usuario)
      }
      if (nombre === 'informes' && lista[i].estado === 'Finalizado' && previo.estado !== 'Finalizado' && lista[i].visitaId) {
        const v = visitas.find((x) => x.id === lista[i].visitaId)
        if (v) avisarDemo([v.autor], { tipo: 'informe_finalizado', titulo: 'Informe finalizado', mensaje: `${lista[i].numero} · ${lista[i].cliente}`, ref: `informe:${lista[i].id}` }, yo.usuario)
      }
      return lista[i]
    }

    if (nombre === 'informes' && !esSuper && (lista[i].autor !== yo.usuario || lista[i].estado === 'Finalizado')) throw error('Sin permisos', 'FORBIDDEN')
    escribir(key, lista.filter((x) => x.id !== p.id))
    if (nombre === 'visitas') escribir(LS_F, leer(LS_F, []).filter((f) => f.visitaId !== p.id))
    return true
  }

  // Fotos (en demo se guardan en localStorage; en producción van a Drive)
  const mf = /^fotos_(list|upload|get|delete)$/.exec(action)
  if (mf) {
    const fotos = leer(LS_F, [])
    const visitaAccesible = (id) => {
      const v = leer(RECURSOS.visitas, []).find((x) => x.id === id)
      if (!v || !puedeVer('visitas', v, yo, [])) throw error('Visita no encontrada')
      return v
    }
    const sinImagen = ({ imagen, ...f }) => f
    switch (mf[1]) {
      case 'list':
        visitaAccesible(p.visitaId)
        return fotos.filter((f) => f.visitaId === p.visitaId).map(sinImagen)
      case 'upload': {
        const v = visitaAccesible(p.visitaId)
        if (yo.rol === 'tecnico' && !ESTADOS_CON_INFORME.includes(v.estado)) throw error('Acepta la visita antes de cargar fotos')
        if (fotos.filter((f) => f.visitaId === v.id).length >= 25) throw error('Máximo 25 fotos por visita')
        const foto = { id: crypto.randomUUID(), visitaId: v.id, nombre: `${v.fecha}_${v.cliente}.jpg`, mini: p.mini, imagen: `data:image/jpeg;base64,${p.imagen}`, autor: yo.usuario, creado: ahora }
        try {
          escribir(LS_F, [...fotos, foto])
        } catch {
          throw error('Sin espacio en el navegador (modo demo). Con Google Drive no hay este límite.')
        }
        return sinImagen(foto)
      }
      default: {
        const f = fotos.find((x) => x.id === p.id)
        if (!f) throw error('Foto no encontrada')
        visitaAccesible(f.visitaId)
        if (mf[1] === 'get') return { dataUrl: f.imagen }
        if (!esSuper && f.autor !== yo.usuario) throw error('Sin permisos', 'FORBIDDEN')
        escribir(LS_F, fotos.filter((x) => x.id !== p.id))
        return true
      }
    }
  }

  if (!esSuper) throw error('Sin permisos', 'FORBIDDEN')
  switch (action) {
    case 'configuracion_update':
      return guardarConfigDemo(p.seccion, p)
    case 'usuarios_list':
      return us.map(publico)
    case 'usuarios_create': {
      const d = p.data
      if (!/^[a-z0-9._-]{3,30}$/.test(d.usuario)) throw error('Usuario inválido: 3 a 30 caracteres (letras minúsculas, números, . _ -)')
      const msgClave = validarClave(d.clave, d.usuario)
      if (msgClave) throw error(msgClave)
      if (us.some((x) => x.usuario === d.usuario)) throw error('Ese usuario ya existe')
      const nuevo = { id: crypto.randomUUID(), usuario: d.usuario, nombre: d.nombre, rol: d.rol, clave: d.clave, activo: true, cambiarClave: true, correo: (d.correo || '').trim() }
      escribir(LS_U, [...us, nuevo])
      return publico(nuevo)
    }
    case 'usuarios_update': {
      const i = us.findIndex((x) => x.id === p.id)
      if (i < 0) throw error('No encontrado')
      const { clave, ...resto } = p.data
      const rol = resto.rol ?? us[i].rol
      const activo = resto.activo ?? us[i].activo
      if (p.id === yo.id && (!activo || rol !== 'superadmin')) throw error('No puedes quitarte tu propio acceso')
      if (clave) {
        const msgClave = validarClave(clave, us[i].usuario)
        if (msgClave) throw error(msgClave)
        limpiarFallos(us[i].usuario)
      }
      us[i] = { ...us[i], ...resto, ...(clave ? { clave, cambiarClave: true } : {}) }
      escribir(LS_U, us)
      return publico(us[i])
    }
  }
  throw error('Acción inválida')
}
