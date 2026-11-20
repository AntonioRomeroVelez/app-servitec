// Aplica a una lectura los cambios que están en cola (hechos sin conexión y aún no enviados), para que la app muestre
// lo que el usuario ya hizo aunque el servidor todavía no lo sepa. Son funciones puras: no tocan red ni almacenamiento.
// Lo que viene de un cambio pendiente se marca con `_pendiente: true`.
const PESADAS_INFORME = ['descripcion', 'checklist', 'firma'] // el listado nunca las trae (igual que Code.gs)

const quitarPesadas = (o) => {
  const c = { ...o }
  for (const k of PESADAS_INFORME) delete c[k]
  return c
}
// Campos que el servidor no deja cambiar en una actualización de informe
const sinInmutables = (d = {}) => {
  const c = { ...d }
  delete c.visitaId
  delete c.numero
  return c
}
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

const itemCreado = (op) => {
  const d = op.payload.data
  return { ...d, autor: op.usuario, creado: op.creado, actualizado: op.creado, numero: d.numero || '', _pendiente: true }
}

function coincide(recurso, it, params) {
  if (recurso === 'informes') {
    if (params.visitaId && it.visitaId !== params.visitaId) return false
    if (params.estado && it.estado !== params.estado) return false
    const q = String(params.q || '').trim().toLowerCase()
    return !q || [it.titulo, it.cliente, it.numero, it.responsable].some((c) => String(c || '').toLowerCase().includes(q))
  }
  if (params.desde && it.fecha < params.desde) return false
  if (params.hasta && it.fecha > params.hasta) return false
  const q = String(params.q || '').trim().toLowerCase()
  return !q || [it.cliente, it.direccion, it.tipo].some((c) => String(c || '').toLowerCase().includes(q))
}

function ordenar(recurso, items, params) {
  if (recurso === 'informes') return items.sort((a, b) => cmp(b.fecha, a.fecha) || cmp(String(b.creado), String(a.creado)))
  const signo = params.orden === 'desc' ? -1 : 1
  return items.sort((a, b) => signo * cmp(`${a.fecha} ${a.hora}`, `${b.fecha} ${b.hora}`))
}

function lista(recurso, params, data, pend) {
  if (!data) return null
  let items = [...data.items]
  for (const o of pend) {
    if (o.action === `${recurso}_create`) {
      const it = itemCreado(o)
      if (!items.some((x) => x.id === it.id) && coincide(recurso, it, params)) items.push(recurso === 'informes' ? quitarPesadas(it) : it)
    } else if (o.action === `${recurso}_update`) {
      const parche = recurso === 'informes' ? quitarPesadas(sinInmutables(o.payload.data)) : o.payload.data
      items = items.map((x) => (x.id === o.payload.id ? { ...x, ...parche, _pendiente: true } : x))
    } else if (o.action === `${recurso}_delete`) {
      items = items.filter((x) => x.id !== o.payload.id)
    }
  }
  ordenar(recurso, items, params)
  return { ...data, items, total: Math.max(items.length, data.total + items.length - data.items.length) }
}

function uno(recurso, params, data, pend) {
  let item = data ? { ...data } : null
  for (const o of pend) {
    if (o.action === `${recurso}_create` && o.payload.data.id === params.id && !item) {
      item = itemCreado(o)
    } else if (o.action === `${recurso}_update` && o.payload.id === params.id && item) {
      item = { ...item, ...(recurso === 'informes' ? sinInmutables(o.payload.data) : o.payload.data), _pendiente: true }
    } else if (o.action === `${recurso}_delete` && o.payload.id === params.id) {
      throw Object.assign(new Error('No encontrado'), { code: '' })
    }
  }
  return item
}

function fotos(op, params, data, pend) {
  if (op === 'list') {
    let items = data ? [...data] : []
    let hay = !!data
    for (const o of pend) {
      if (o.action === 'fotos_upload' && o.payload.visitaId === params.visitaId && !items.some((f) => f.id === o.payload.id)) {
        items.push({ id: o.payload.id, visitaId: params.visitaId, nombre: 'foto-pendiente.jpg', mini: o.payload.mini, autor: o.usuario, creado: o.creado, _pendiente: true })
        hay = true
      } else if (o.action === 'fotos_delete') {
        items = items.filter((f) => f.id !== o.payload.id)
      }
    }
    return hay ? items : null
  }
  if (op === 'get') {
    const subida = pend.find((o) => o.action === 'fotos_upload' && o.payload.id === params.id)
    return subida ? { dataUrl: `data:image/jpeg;base64,${subida.payload.imagen}` } : data
  }
  return data
}

/**
 * @param action  acción de lectura (informes_list, visitas_get, fotos_list, ...)
 * @param params  parámetros con los que se pidió
 * @param data    respuesta del servidor o de la copia guardada (null si no hay)
 * @param ops     cola de cambios pendientes del usuario, en orden
 * @returns       la lectura con los cambios pendientes aplicados, o null si no hay forma de responder
 */
export function aplicarPendientes(action, params, data, ops) {
  const pend = ops.filter((o) => o.estado !== 'fallida')
  const [recurso, op] = action.split('_')
  if (recurso === 'fotos') return fotos(op, params, data, pend)
  if (recurso !== 'informes' && recurso !== 'visitas') return data
  if (op === 'list') return lista(recurso, params, data, pend)
  if (op === 'get') return uno(recurso, params, data, pend)
  return data
}
