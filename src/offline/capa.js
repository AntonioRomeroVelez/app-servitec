// Capa de modo sin conexión. Se coloca entre la app y la red:
//  - LECTURAS: se piden al servidor y se guardan; sin conexión se responde con la última copia guardada.
//    En ambos casos se superponen los cambios pendientes, para que el usuario vea lo que ya hizo.
//  - CAMBIOS (crear/editar informes y visitas, fotos): con conexión se envían; sin conexión (o con cambios anteriores aún
//    en cola, para respetar el orden) quedan en la cola y se envían al volver. El cliente genera los ids, así que un
//    reintento nunca duplica nada (el servidor devuelve el registro ya creado).
//  - Todo lo demás (login, usuarios, claves...) necesita conexión.
//
// `red(action, payload)` debe lanzar un Error con code 'RED' si falla la conexión, y con el code del servidor si responde error.
import * as almacen from './almacen.js'
import { aplicarPendientes } from './overlay.js'
import { estado } from './estado.js'

const ENCOLABLES = new Set(['visitas_create', 'visitas_update', 'informes_create', 'informes_update', 'informes_delete', 'fotos_upload', 'fotos_delete'])
const ES_LECTURA = /^((informes|visitas)_(list|get)|fotos_(list|get)|tecnicos_list|clientes_list|configuracion_get)$/
const MAX_FOTOS_GUARDADAS = 40

const errorOffline = (msg = 'Sin conexión. Esta acción necesita internet.') => Object.assign(new Error(msg), { code: 'OFFLINE' })
const estable = (o) => JSON.stringify(o, Object.keys(o).sort())

export function crearCapaOffline({ red, sesion, nuevoId = () => crypto.randomUUID(), ahora = () => new Date().toISOString(), programar = (fn) => setTimeout(fn, 0) }) {
  // Ganchos que registra la app: alSincronizar(n) tras enviar n cambios; alExpirarSesion() si el token venció al sincronizar
  const ganchos = { alSincronizar: () => {}, alExpirarSesion: () => {} }

  async function refrescar() {
    const s = sesion()
    const ops = s ? await almacen.cola(s.usuarioId) : []
    estado.pendientes = ops.filter((o) => o.estado !== 'fallida').length
    estado.fallidas = ops.filter((o) => o.estado === 'fallida').length
  }

  // ---------- lecturas ----------
  async function leer(action, params) {
    const s = sesion()
    const clave = `${s?.usuarioId}|${action}|${estable(params)}`
    let data
    try {
      data = await red(action, params)
      estado.enLinea = true
      almacen.guardarLectura(clave, data, action).then(() => action === 'fotos_get' && almacen.recortarLecturas('fotos_get', MAX_FOTOS_GUARDADAS))
    } catch (e) {
      if (e.code !== 'RED') throw e
      estado.enLinea = false
      data = (await almacen.leerLectura(clave))?.data ?? null
    }
    const ops = s ? await almacen.cola(s.usuarioId) : []
    const r = aplicarPendientes(action, params, data, ops)
    if (r === null || r === undefined) throw errorOffline('Sin conexión y sin datos guardados para esto.')
    return r
  }

  // ---------- cambios ----------
  // Ids generados por el cliente: así la misma operación se puede repetir sin duplicar
  function preparar(action, payload) {
    if (action.endsWith('_create')) return { ...payload, data: { ...payload.data, id: payload.data?.id || nuevoId() } }
    if (action === 'fotos_upload') return { ...payload, id: payload.id || nuevoId() }
    return payload
  }

  async function encolar(action, payload, s) {
    const ops = await almacen.cola(s.usuarioId)
    const [recurso, verbo] = action.split('_')
    const vivas = ops.filter((o) => o.estado !== 'fallida')
    const creacion = (id) => vivas.find((o) => o.action === `${recurso}_create` && o.payload.data.id === id)

    // Un cambio sobre algo que todavía no se envió se funde con su creación
    if (verbo === 'update' && recurso !== 'fotos') {
      const c = creacion(payload.id)
      if (c) return almacen.actualizarOp(c.n, { payload: { ...c.payload, data: { ...c.payload.data, ...payload.data } } })
    }
    // Eliminar algo que nunca se envió: se descarta todo lo relacionado y listo
    if (action === 'informes_delete') {
      const c = creacion(payload.id)
      if (c) {
        for (const o of vivas) if (o.n === c.n || o.payload?.id === payload.id) await almacen.quitarOp(o.n)
        return
      }
    }
    // Eliminar una foto que no se subió: basta con quitar la subida
    if (action === 'fotos_delete') {
      const sub = vivas.find((o) => o.action === 'fotos_upload' && o.payload.id === payload.id)
      if (sub) return almacen.quitarOp(sub.n)
    }
    await almacen.encolar({ action, payload, usuarioId: s.usuarioId, usuario: s.usuario, creado: ahora(), estado: 'pendiente' })
  }

  // Respuesta inmediata para un cambio en cola, con la misma forma que daría el servidor
  function sintetizar(action, payload, s) {
    const t = ahora()
    switch (action) {
      case 'informes_create':
      case 'visitas_create':
        return { ...payload.data, autor: s.usuario, creado: t, actualizado: t, numero: payload.data.numero || '', _pendiente: true }
      case 'informes_update':
      case 'visitas_update':
        return { id: payload.id, ...payload.data, actualizado: t, _pendiente: true }
      case 'fotos_upload':
        return { id: payload.id, visitaId: payload.visitaId, nombre: 'foto-pendiente.jpg', mini: payload.mini, autor: s.usuario, creado: t, _pendiente: true }
      default:
        return true
    }
  }

  async function mutar(action, entrada) {
    const s = sesion()
    const payload = preparar(action, entrada)
    const hayCola = s ? (await almacen.cola(s.usuarioId)).some((o) => o.estado !== 'fallida') : false

    if (!hayCola && estado.enLinea) {
      try {
        const r = await red(action, payload)
        estado.enLinea = true
        return r
      } catch (e) {
        if (e.code !== 'RED') throw e
        estado.enLinea = false
      }
    }
    if (!s) throw errorOffline()
    await encolar(action, payload, s)
    await refrescar()
    programar(() => sincronizar().catch(() => {}))
    return sintetizar(action, payload, s)
  }

  async function directo(action, payload) {
    try {
      const r = await red(action, payload)
      estado.enLinea = true
      return r
    } catch (e) {
      if (e.code === 'RED') {
        estado.enLinea = false
        throw errorOffline()
      }
      throw e
    }
  }

  const call = (action, payload = {}) => (ENCOLABLES.has(action) ? mutar(action, payload) : ES_LECTURA.test(action) ? leer(action, payload) : directo(action, payload))

  // ---------- sincronización ----------
  let enCurso = null

  async function enviarCola() {
    const s = sesion()
    if (!s) return 0
    estado.sincronizando = true
    let hechos = 0
    try {
      for (const op of await almacen.cola(s.usuarioId)) {
        if (op.estado === 'fallida') continue
        try {
          await red(op.action, op.payload)
          estado.enLinea = true
          await almacen.quitarOp(op.n)
          hechos++
        } catch (e) {
          if (e.code === 'RED') {
            estado.enLinea = false
            break
          }
          if (e.code === 'AUTH' || e.code === 'CAMBIAR_CLAVE') {
            ganchos.alExpirarSesion(e.code) // los cambios se conservan: se envían al volver a entrar
            break
          }
          if (e.code === 'LOCKED') break
          if (/_delete$/.test(op.action) && /No encontrad/i.test(e.message)) {
            await almacen.quitarOp(op.n) // ya estaba eliminado: es lo que se quería
            hechos++
            continue
          }
          await almacen.actualizarOp(op.n, { estado: 'fallida', error: e.message })
        }
      }
    } finally {
      estado.sincronizando = false
      await refrescar()
    }
    if (hechos) ganchos.alSincronizar(hechos)
    return hechos
  }

  // Una sola sincronización a la vez
  function sincronizar() {
    if (!enCurso) enCurso = enviarCola().finally(() => (enCurso = null))
    return enCurso
  }

  // ¿Hay servidor? (cualquier respuesta, aunque sea un error de sesión, significa que hay conexión)
  async function sondear() {
    try {
      await red('tecnicos_list', {})
    } catch (e) {
      if (e.code === 'RED') {
        estado.enLinea = false
        return false
      }
    }
    estado.enLinea = true
    return true
  }

  // ---------- gestión de pendientes (pantalla "Pendientes") ----------
  const listarCola = async () => {
    const s = sesion()
    return s ? almacen.cola(s.usuarioId) : []
  }
  const descartar = async (n) => {
    await almacen.quitarOp(n)
    await refrescar()
  }
  const reintentar = async (n) => {
    await almacen.actualizarOp(n, { estado: 'pendiente', error: undefined })
    await refrescar()
    return sincronizar()
  }

  return { call, ganchos, sincronizar, sondear, refrescar, listarCola, descartar, reintentar, limpiarLecturas: almacen.limpiarLecturas }
}
