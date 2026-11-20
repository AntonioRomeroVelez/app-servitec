// Transporte de Supabase (PostgREST + GoTrue). Cumple el mismo contrato que Code.gs: call(action, payload) -> datos,
// con la forma que ya espera la app (camelCase, usuarios por nombre de usuario, checklist como texto JSON).
// Errores: code 'RED' (sin conexión), 'AUTH' (sesión vencida), 'CAMBIAR_CLAVE', 'FORBIDDEN', 'LOCKED'.
// Las reglas de negocio viven en la base (supabase/migrations); aquí solo se traduce.
import { createClient } from '@supabase/supabase-js'
import { CONFIG_DEFECTO } from '../configuracion'
import { valorSeccion } from '../validarConfig'
import { validarClave } from '../utils'

const fallo = (msg, code = '') => Object.assign(new Error(msg), { code })
const esRed = (e) => /failed to fetch|networkerror|fetch failed|load failed|network request failed/i.test(String(e?.message || '')) || e?.status === 0 || e?.name === 'AuthRetryableFetchError'

// Traduce un error de PostgREST/GoTrue a un Error de la app
function aError(e) {
  if (!e) return fallo('Error inesperado')
  if (e instanceof Error && e.code && !/^\d|^PGRST/.test(e.code)) return e
  if (esRed(e)) return fallo('Sin conexión con el servidor', 'RED')
  const msg = String(e.message || '')
  if (e.code === 'PGRST301' || e.code === 'PGRST303' || e.status === 401 || /jwt/i.test(msg)) return fallo('Sesión expirada', 'AUTH')
  if (e.code === '42501') return fallo('Sin permisos', 'FORBIDDEN')
  if (e.code === '23505') {
    if (/clientes_nombre_unico/.test(msg)) return fallo('Ya existe un cliente con ese nombre')
    return fallo('Ya existe un registro con esos datos', 'DUPLICADO')
  }
  if (e.code === '23503') return fallo('Referencia inválida')
  return fallo(msg || 'Error inesperado')
}

// fotosUrl: dirección del Apps Script de fotos (apps-script-fotos). llamarFotos(cuerpo) permite sustituirlo en pruebas.
export function crearTransporte({ url, anonKey, storage, fotosUrl, llamarFotos }) {
  const sb = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'servitec-supabase', ...(storage ? { storage } : {}) },
  })
  const ok = ({ data, error }) => {
    if (error) throw aError(error)
    return data
  }

  // ---------- servicio de fotos (Google Drive vía Apps Script, con el token del usuario) ----------
  async function servicioFotos(action, payload) {
    const { access_token: token } = await sesion()
    const cuerpo = { action, token, ...payload }
    if (llamarFotos) return llamarFotos(cuerpo)
    if (!fotosUrl) throw fallo('Falta configurar VITE_FOTOS_URL (servicio de fotos en Google Drive)')
    const control = new AbortController()
    const limite = setTimeout(() => control.abort(), 90000)
    let res
    try {
      res = await fetch(fotosUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(cuerpo), signal: control.signal })
    } catch {
      throw fallo('Sin conexión con el servidor', 'RED')
    } finally {
      clearTimeout(limite)
    }
    let json
    try {
      json = await res.json()
    } catch {
      throw fallo('El servicio de fotos no respondió correctamente', 'RED')
    }
    if (!json.ok) throw fallo(json.error || 'Error del servicio de fotos', json.code)
    return json.data
  }

  // ---------- perfiles (usuarios de la empresa): caché para traducir uuid <-> nombre de usuario ----------
  let cache = null
  const invalidar = () => (cache = null)
  const COLS_PERFIL = 'id,empresa_id,usuario,nombre,rol,correo,activo,cambiar_clave'
  async function perfiles() {
    if (!cache) {
      const lista = ok(await sb.from('perfiles').select(COLS_PERFIL).order('usuario'))
      cache = { lista, porId: new Map(lista.map((p) => [p.id, p])), porUsuario: new Map(lista.map((p) => [p.usuario, p])) }
    }
    return cache
  }
  const publico = (p) => ({ id: p.id, usuario: p.usuario, nombre: p.nombre, rol: p.rol, activo: p.activo, cambiarClave: !!p.cambiar_clave, correo: p.correo || '', plataforma: !!p.plataforma })
  const nombreDe = (c, id) => (id ? c.porId.get(id)?.usuario || '' : '')
  const idDe = (c, usuario) => {
    if (!usuario) return null
    const p = c.porUsuario.get(usuario)
    if (!p) throw fallo('Técnico inválido')
    return p.id
  }

  // Sesión: sin sesión guardada es AUTH; si no se pudo renovar por falta de red es RED (se responde con la copia local)
  async function sesion() {
    const { data, error } = await sb.auth.getSession()
    if (error && esRed(error)) throw fallo('Sin conexión con el servidor', 'RED')
    if (!data?.session) throw fallo('Sesión expirada', 'AUTH')
    return data.session
  }
  // El perfil propio se guarda 30 s: si el administrador desactiva la cuenta, el acceso se corta en poco tiempo
  let yoCache = null
  let yoHasta = 0
  async function yo() {
    if (yoCache && Date.now() > yoHasta) yoCache = null
    if (!yoCache) {
      const sesionActual = await sesion()
      const lista = ok(await sb.from('perfiles').select(COLS_PERFIL).eq('id', sesionActual.user.id))
      if (!lista.length) throw fallo('Tu cuenta no pertenece a ninguna empresa', 'AUTH')
      const esPlataforma = ok(await sb.from('plataforma_admins').select('user_id')).length > 0
      yoCache = { ...lista[0], plataforma: esPlataforma }
      yoHasta = Date.now() + 30000
    }
    return yoCache
  }
  const olvidar = () => {
    cache = null
    yoCache = null
  }

  // ---------- traducción de filas ----------
  const visitaOut = (c, r) => ({
    id: r.id, fecha: r.fecha, hora: String(r.hora).slice(0, 5), cliente: r.cliente, clienteId: r.cliente_id || '', direccion: r.direccion, telefono: r.telefono,
    tipo: r.tipo, responsable: nombreDe(c, r.responsable), estado: r.estado, notas: r.notas, motivo: r.motivo,
    autor: nombreDe(c, r.autor), creado: r.creado, modificadoPor: nombreDe(c, r.modificado_por), actualizado: r.actualizado,
  })
  const visitaIn = (c, d) => {
    const r = {}
    for (const k of ['id', 'fecha', 'hora', 'cliente', 'direccion', 'telefono', 'tipo', 'estado', 'notas', 'motivo']) if (d[k] !== undefined) r[k] = d[k]
    if (d.responsable !== undefined) r.responsable = idDe(c, d.responsable)
    return r
  }
  const COLS_INFORME_LIVIANO = 'id,visita_id,numero,fecha,cliente,titulo,tipo,estado,responsable,firmante,autor,creado,modificado_por,actualizado'
  const informeOut = (c, r) => ({
    id: r.id, visitaId: r.visita_id || '', numero: r.numero, fecha: r.fecha, cliente: r.cliente, titulo: r.titulo, tipo: r.tipo, estado: r.estado,
    responsable: nombreDe(c, r.responsable), firmante: r.firmante,
    ...(r.checklist !== undefined ? { descripcion: r.descripcion, checklist: JSON.stringify(r.checklist), firma: r.firma } : {}),
    autor: nombreDe(c, r.autor), creado: r.creado, modificadoPor: nombreDe(c, r.modificado_por), actualizado: r.actualizado,
  })
  const informeIn = (c, d) => {
    const r = {}
    for (const k of ['id', 'fecha', 'cliente', 'titulo', 'tipo', 'estado', 'firmante', 'descripcion', 'firma']) if (d[k] !== undefined) r[k] = d[k]
    if (d.visitaId !== undefined) r.visita_id = d.visitaId || null
    if (d.responsable !== undefined) r.responsable = d.responsable ? c.porUsuario.get(d.responsable)?.id ?? null : null
    if (d.checklist !== undefined) r.checklist = typeof d.checklist === 'string' ? JSON.parse(d.checklist || '[]') : d.checklist
    return r
  }
  const fotoOut = (c, f) => ({ id: f.id, visitaId: f.visita_id ?? f.visitaId, nombre: f.nombre, mini: f.mini, autor: nombreDe(c, f.autor), creado: f.creado })
  const clienteOut = (c, r) => ({ id: r.id, nombre: r.nombre, direccion: r.direccion, telefono: r.telefono, autor: nombreDe(c, r.autor), creado: r.creado, modificadoPor: nombreDe(c, r.modificado_por), actualizado: r.actualizado })

  // Texto de búsqueda seguro para un filtro `or` de PostgREST
  const limpiarBusqueda = (q) => String(q || '').trim().toLowerCase().slice(0, 60).replace(/[,()*%\\:"']/g, ' ').trim()

  // Una creación repetida (mismo id) devuelve el registro ya creado, como hacía Code.gs
  async function crear(tabla, fila, salida) {
    const c = await perfiles()
    const { data, error } = await sb.from(tabla).insert(fila).select().single()
    if (error) {
      if (error.code === '23505' && fila.id && !/clientes_nombre_unico|numero/.test(error.message)) {
        const previo = ok(await sb.from(tabla).select().eq('id', fila.id).maybeSingle())
        if (previo) return salida(c, previo)
      }
      throw aError(error)
    }
    return salida(c, data)
  }

  // ---------- acciones ----------
  const acciones = {
    async login(p) {
      const { data, error } = await sb.auth.signInWithPassword({ email: String(p.usuario || '').trim().toLowerCase(), password: String(p.clave || '') })
      if (error) {
        if (esRed(error)) throw aError(error)
        if (error.status === 429) throw fallo('Demasiados intentos fallidos. Intenta de nuevo en unos minutos.', 'LOCKED')
        throw fallo('Correo o clave incorrectos')
      }
      olvidar()
      let perfil
      try {
        perfil = await yo()
      } catch {
        perfil = null
      }
      if (!perfil || !perfil.activo) {
        await sb.auth.signOut()
        olvidar()
        throw fallo(perfil ? 'Correo o clave incorrectos' : 'Tu cuenta no pertenece a ninguna empresa')
      }
      return { token: data.session.access_token, usuario: publico(perfil) }
    },

    async logout() {
      await sb.auth.signOut()
      olvidar()
      return true
    },
    async me() {
      return publico(await yo())
    },

    async cambiar_clave(p) {
      const perfil = await yo()
      const msg = validarClave(p.nueva, perfil.usuario)
      const { data: s } = await sb.auth.getSession()
      const { error: e1 } = await sb.auth.signInWithPassword({ email: s.session.user.email, password: String(p.actual || '') })
      if (e1) throw esRed(e1) ? aError(e1) : fallo('La clave actual no es correcta')
      if (msg) throw fallo(msg)
      if (p.nueva === p.actual) throw fallo('La nueva clave debe ser distinta a la actual')
      const { data, error } = await sb.auth.updateUser({ password: p.nueva })
      if (error) throw aError(error)
      ok(await sb.rpc('marcar_clave_cambiada'))
      olvidar()
      const nuevo = await yo()
      const { data: s2 } = await sb.auth.getSession()
      return { token: s2.session?.access_token || data.user.id, usuario: publico(nuevo) }
    },

    async configuracion_get() {
      const { data: s } = await sb.auth.getSession()
      if (!s?.session) return CONFIG_DEFECTO // pública, como en Code.gs: la pantalla de ingreso aún no conoce la empresa
      const filas = ok(await sb.from('configuracion').select('clave,valor'))
      return Object.fromEntries(filas.map((f) => [f.clave, f.valor]))
    },
    async configuracion_update(p) {
      const perfil = await yo()
      if (perfil.rol !== 'superadmin') throw fallo('Sin permisos', 'FORBIDDEN')
      if (p.restablecer) {
        ok(await sb.from('configuracion').delete().eq('empresa_id', perfil.empresa_id).eq('clave', p.seccion))
      } else {
        let valor
        try {
          valor = valorSeccion(p.seccion, p.data)
        } catch (e) {
          throw fallo(e.message)
        }
        ok(await sb.from('configuracion').upsert({ empresa_id: perfil.empresa_id, clave: p.seccion, valor, modificado_por: perfil.id, actualizado: new Date().toISOString() }))
      }
      return acciones.configuracion_get()
    },

    async tecnicos_list() {
      const c = await perfiles()
      return c.lista.filter((x) => x.rol === 'tecnico' && x.activo).map((x) => ({ usuario: x.usuario, nombre: x.nombre }))
    },

    // ---- empresas (solo el superadmin de la plataforma) ----
    async empresas_list() {
      return ok(await sb.rpc('listar_empresas')).map((e) => ({ id: e.id, nombre: e.nombre, plan: e.plan, activa: e.activa, creado: e.creado, usuarios: Number(e.usuarios), datos: e.datos }))
    },
    async empresas_create({ data: d }) {
      const a = d.admin || {}
      if (!String(d.nombre || '').trim()) throw fallo('Escribe el nombre de la empresa')
      if (!/^[a-z0-9._-]{3,30}$/.test(a.usuario || '')) throw fallo('Usuario del administrador inválido: 3 a 30 caracteres (letras minúsculas, números, . _ -)')
      if (!String(a.nombre || '').trim()) throw fallo('Escribe el nombre del administrador')
      if (!String(a.correo || '').trim()) throw fallo('Escribe el correo del administrador: lo usará para iniciar sesión')
      const msg = validarClave(a.clave, a.usuario)
      if (msg) throw fallo(msg)
      return ok(await sb.rpc('crear_empresa', { p: d }))
    },
    async empresas_update({ id, data: d }) {
      ok(await sb.rpc('editar_empresa', { p_id: id, p: d }))
      return true
    },

    // ---- usuarios (superadmin) ----
    async usuarios_list() {
      return (await perfiles()).lista.map(publico)
    },
    async usuarios_create({ data: d }) {
      if (!/^[a-z0-9._-]{3,30}$/.test(d.usuario || '')) throw fallo('Usuario inválido: 3 a 30 caracteres (letras minúsculas, números, . _ -)')
      if (!String(d.correo || '').trim()) throw fallo('Escribe el correo del usuario: lo usará para iniciar sesión')
      const msg = validarClave(d.clave, d.usuario)
      if (msg) throw fallo(msg)
      const id = ok(await sb.rpc('crear_usuario', { p_correo: d.correo, p_clave: d.clave, p_usuario: d.usuario, p_nombre: d.nombre, p_rol: d.rol }))
      invalidar()
      return publico((await perfiles()).porId.get(id))
    },
    async usuarios_update({ id, data: d }) {
      const { clave, ...resto } = d
      if (clave) {
        const msg = validarClave(clave, (await perfiles()).porId.get(id)?.usuario || '')
        if (msg) throw fallo(msg)
        ok(await sb.rpc('restablecer_clave', { p_id: id, p_clave: clave }))
      }
      const cambios = {}
      for (const k of ['nombre', 'rol', 'activo', 'correo']) if (resto[k] !== undefined) cambios[k] = resto[k]
      if (Object.keys(cambios).length) ok(await sb.from('perfiles').update(cambios).eq('id', id).select().single())
      invalidar()
      const p = (await perfiles()).porId.get(id)
      if (!p) throw fallo('No encontrado')
      return publico(p)
    },

    // ---- notificaciones ----
    async notificaciones_list(p) {
      const { count } = await sb.from('notificaciones').select('id', { count: 'exact', head: true }).eq('leida', false)
      if (p.resumen) return { noLeidas: count || 0 }
      const c = await perfiles()
      const filas = ok(await sb.from('notificaciones').select('id,usuario_id,tipo,titulo,mensaje,ref,creado,leida').order('creado', { ascending: false }).limit(50))
      return { items: filas.map((n) => ({ id: n.id, usuario: nombreDe(c, n.usuario_id), tipo: n.tipo, titulo: n.titulo, mensaje: n.mensaje, ref: n.ref, creado: n.creado, leida: n.leida })), noLeidas: count || 0 }
    },
    async notificaciones_leer(p) {
      let q = sb.from('notificaciones').update({ leida: true })
      q = p.todas ? q.eq('leida', false) : q.in('id', p.ids || [])
      ok(await q)
      return true
    },

    // ---- clientes ----
    async clientes_list(p) {
      const c = await perfiles()
      const limite = Math.min(100, Math.max(1, parseInt(p.limit, 10) || 50))
      const offset = Math.max(0, parseInt(p.offset, 10) || 0)
      let q = sb.from('clientes').select('*', { count: 'exact' }).order('nombre')
      const t = limpiarBusqueda(p.q)
      if (t) q = q.or(`nombre.ilike.*${t}*,direccion.ilike.*${t}*,telefono.ilike.*${t}*`)
      const { data, error, count } = await q.range(offset, offset + limite - 1)
      if (error) throw aError(error)
      return { items: data.map((r) => clienteOut(c, r)), total: count, hasMore: offset + limite < count }
    },
    async clientes_create({ data: d }) {
      const nombre = String(d.nombre || '').trim()
      if (!nombre) throw fallo('Escribe el nombre del cliente')
      return crear('clientes', { nombre, direccion: String(d.direccion || '').trim(), telefono: String(d.telefono || '').trim() }, clienteOut)
    },
    async clientes_update({ id, data: d }) {
      const c = await perfiles()
      const cambios = {}
      if (d.nombre !== undefined) {
        cambios.nombre = String(d.nombre).trim()
        if (!cambios.nombre) throw fallo('Escribe el nombre del cliente')
      }
      for (const k of ['direccion', 'telefono']) if (d[k] !== undefined) cambios[k] = String(d[k]).trim()
      const r = ok(await sb.from('clientes').update(cambios).eq('id', id).select().maybeSingle())
      if (!r) throw fallo('No encontrado')
      return clienteOut(c, r)
    },
    async clientes_delete({ id }) {
      const r = ok(await sb.from('clientes').delete().eq('id', id).select())
      if (!r.length) throw fallo('No encontrado')
      return true
    },

    // ---- visitas ----
    async visitas_list(p) {
      const c = await perfiles()
      const limite = Math.min(500, Math.max(1, parseInt(p.limit, 10) || 500))
      const offset = Math.max(0, parseInt(p.offset, 10) || 0)
      const esFecha = /^\d{4}-\d{2}-\d{2}$/
      const desde = esFecha.test(p.desde) ? p.desde : ''
      const hasta = esFecha.test(p.hasta) ? p.hasta : ''
      const asc = p.orden !== 'desc'
      let q = sb.from('visitas').select('*', { count: 'exact' })
      if (desde) q = q.gte('fecha', desde)
      if (hasta) q = q.lte('fecha', hasta)
      if (p.clienteId) q = q.eq('cliente_id', p.clienteId)
      const { data, error, count } = await q.order('fecha', { ascending: asc }).order('hora', { ascending: asc }).range(offset, offset + limite - 1)
      if (error) throw aError(error)
      let antes = 0
      if (desde) antes = (await sb.from('visitas').select('id', { count: 'exact', head: true }).lt('fecha', desde)).count || 0
      return { items: data.map((r) => visitaOut(c, r)), total: count, hasMore: offset + limite < count, antes }
    },
    async visitas_get({ id }) {
      const c = await perfiles()
      const r = ok(await sb.from('visitas').select('*').eq('id', id).maybeSingle())
      if (!r) throw fallo('No encontrado')
      return visitaOut(c, r)
    },
    async visitas_create({ data: d }) {
      const c = await perfiles()
      return crear('visitas', visitaIn(c, d), visitaOut)
    },
    async visitas_update({ id, data: d }) {
      const c = await perfiles()
      const r = ok(await sb.from('visitas').update(visitaIn(c, d)).eq('id', id).select().maybeSingle())
      if (!r) throw fallo('No encontrado')
      return visitaOut(c, r)
    },
    async visitas_delete({ id }) {
      // Las fotos van a la papelera de Drive antes de que la base borre sus filas
      const { count } = await sb.from('fotos').select('id', { count: 'exact', head: true }).eq('visita_id', id)
      if (count) await servicioFotos('eliminar_de_visita', { visitaId: id })
      const r = ok(await sb.from('visitas').delete().eq('id', id).select('id'))
      if (!r.length) throw fallo('No encontrado')
      return true
    },

    // ---- informes ----
    async informes_list(p) {
      const c = await perfiles()
      const limite = Math.min(100, Math.max(1, parseInt(p.limit, 10) || 50))
      const offset = Math.max(0, parseInt(p.offset, 10) || 0)
      let q = sb.from('informes').select(COLS_INFORME_LIVIANO, { count: 'exact' })
      if (p.visitaId) q = q.eq('visita_id', p.visitaId)
      if (p.estado) q = q.eq('estado', p.estado)
      const t = limpiarBusqueda(p.q)
      if (t) {
        const ids = c.lista.filter((x) => x.usuario.includes(t) || x.nombre.toLowerCase().includes(t)).map((x) => x.id)
        q = q.or(`titulo.ilike.*${t}*,cliente.ilike.*${t}*,numero.ilike.*${t}*${ids.length ? `,responsable.in.(${ids.join(',')})` : ''}`)
      }
      const { data, error, count } = await q.order('fecha', { ascending: false }).order('creado', { ascending: false }).range(offset, offset + limite - 1)
      if (error) throw aError(error)
      return { items: data.map((r) => informeOut(c, r)), total: count, hasMore: offset + limite < count }
    },
    async informes_get({ id }) {
      const c = await perfiles()
      const r = ok(await sb.from('informes').select('*').eq('id', id).maybeSingle())
      if (!r) throw fallo('No encontrado')
      return informeOut(c, r)
    },
    async informes_create({ data: d }) {
      const c = await perfiles()
      return crear('informes', informeIn(c, d), informeOut)
    },
    async informes_update({ id, data: d }) {
      const c = await perfiles()
      const fila = informeIn(c, d)
      delete fila.visita_id
      delete fila.id
      const r = ok(await sb.from('informes').update(fila).eq('id', id).select().maybeSingle())
      if (!r) throw fallo('No encontrado')
      return informeOut(c, r)
    },
    async informes_delete({ id }) {
      const r = ok(await sb.from('informes').delete().eq('id', id).select('id'))
      if (!r.length) throw fallo('No encontrado')
      return true
    },

    // ---- fotos: la lista sale de la base; el archivo vive en Google Drive (empresa > usuario > mes) ----
    async fotos_list({ visitaId }) {
      const c = await perfiles()
      const filas = ok(await sb.from('fotos').select('id,visita_id,nombre,mini,autor,creado').eq('visita_id', visitaId).order('creado'))
      return filas.map((f) => fotoOut(c, f))
    },
    async fotos_upload({ id, visitaId, imagen, mini }) {
      const c = await perfiles()
      return fotoOut(c, await servicioFotos('subir', { id, visitaId, imagen, mini }))
    },
    async fotos_get({ id }) {
      return servicioFotos('obtener', { id })
    },
    async fotos_delete({ id }) {
      await servicioFotos('eliminar', { id })
      return true
    },
  }

  const LIBRES = new Set(['login', 'logout', 'me', 'cambiar_clave', 'configuracion_get'])

  async function call(action, payload = {}) {
    const f = acciones[action]
    if (!f) throw fallo('Acción inválida')
    try {
      if (!LIBRES.has(action)) {
        const perfil = await yo() // exige sesión
        if (perfil.cambiar_clave) throw fallo('Debes cambiar tu clave para continuar', 'CAMBIAR_CLAVE')
        if (action.startsWith('empresas_') && !perfil.plataforma) throw fallo('Sin permisos', 'FORBIDDEN')
        if (action.startsWith('usuarios_') && perfil.rol !== 'superadmin') throw fallo('Sin permisos', 'FORBIDDEN')
        if (action.startsWith('clientes_') && perfil.rol === 'tecnico') throw fallo('Sin permisos', 'FORBIDDEN')
      }
      return await f(payload)
    } catch (e) {
      throw aError(e)
    }
  }

  return { call, cliente: sb, olvidarCaches: olvidar }
}
