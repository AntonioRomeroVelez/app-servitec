import { ref, readonly } from 'vue'
import { call } from '../api'

/**
 * Fábrica de stores sobre las acciones `<nombre>_list|get|create|update|delete` del backend.
 * El estado vive a nivel de módulo (compartido por toda la app).
 *
 * Los listados son paginados y livianos: cada item trae solo los campos ligeros. `obtener(id)` trae el registro
 * completo (con firma, checklist, etc.) y lo marca con `_completo` para que las pantallas de detalle sepan que ya está.
 */
export function crearRecurso(nombre, ordenar, { limite = 0 } = {}) {
  const items = ref([])
  const cargando = ref(false)
  const error = ref('')
  const hayMas = ref(false)
  const meta = ref({ total: 0, antes: 0 }) // total que cumple el filtro; antes = visitas anteriores a la ventana
  const parametros = ref({}) // filtros del último cargar() (para volver a mostrarlos y para recargar)
  let servidos = 0 // cuántos items entregó el servidor en las páginas pedidas (no cuenta los creados localmente)

  async function run(fn) {
    cargando.value = true
    error.value = ''
    try {
      return await fn()
    } catch (e) {
      error.value = e.message || 'Error inesperado'
      throw e
    } finally {
      cargando.value = false
    }
  }

  // Une items nuevos sin duplicar. Si ya se tenía el registro completo, no se pisa con la versión liviana.
  function unir(nuevos) {
    const porId = new Map(items.value.map((x) => [x.id, x]))
    for (const n of nuevos) {
      const previo = porId.get(n.id)
      porId.set(n.id, previo?._completo ? previo : n)
    }
    items.value = [...porId.values()].sort(ordenar)
  }

  // Primera página (o ventana) con filtros: reemplaza lo cargado
  const cargar = (params = {}) =>
    run(async () => {
      params = limite && !params.limit ? { ...params, limit: limite } : params // tamaño de página por defecto
      parametros.value = params
      const r = await call(`${nombre}_list`, params)
      items.value = [...r.items].sort(ordenar)
      servidos = r.items.length
      hayMas.value = r.hasMore
      meta.value = { total: r.total, antes: r.antes ?? 0 }
    })

  const recargar = () => cargar(parametros.value)

  // Salta a otra página (offset = posición del primer elemento) con los mismos filtros; reemplaza lo mostrado
  const irAPagina = (offset) => cargar({ ...parametros.value, offset })

  // Siguiente página con los mismos filtros
  const masPaginas = () =>
    run(async () => {
      const r = await call(`${nombre}_list`, { ...parametros.value, offset: servidos })
      servidos += r.items.length
      hayMas.value = r.hasMore
      unir(r.items)
    })

  // Pide otro tramo (p. ej. visitas anteriores) y lo une a lo cargado. Devuelve la respuesta completa.
  const agregar = (params) =>
    run(async () => {
      const r = await call(`${nombre}_list`, params)
      unir(r.items)
      return r
    })

  // Registro completo (el listado no trae firma, checklist ni observaciones)
  const obtener = (id) =>
    run(async () => {
      const item = { ...(await call(`${nombre}_get`, { id })), _completo: true }
      items.value = [...items.value.filter((x) => x.id !== id), item].sort(ordenar)
      return item
    })

  // create/update devuelven el registro completo desde el servidor
  const crear = (data) =>
    run(async () => {
      const item = { ...(await call(`${nombre}_create`, { data })), _completo: true }
      items.value = [...items.value, item].sort(ordenar)
      return item
    })

  // Si el cambio quedó en cola (sin conexión) la respuesta es parcial: se funde con lo ya cargado en vez de reemplazarlo
  const actualizar = (id, data) =>
    run(async () => {
      const r = await call(`${nombre}_update`, { id, data })
      let item = { ...r, _completo: true }
      items.value = items.value
        .map((x) => (x.id === id ? (item = { ...x, ...r, _completo: r._pendiente ? x._completo : true }) : x))
        .sort(ordenar)
      return item
    })

  const eliminar = (id) =>
    run(async () => {
      await call(`${nombre}_delete`, { id })
      items.value = items.value.filter((x) => x.id !== id)
    })

  const limpiar = () => {
    items.value = []
    error.value = ''
    hayMas.value = false
    parametros.value = {}
    meta.value = { total: 0, antes: 0 }
    servidos = 0
  }

  return () => ({
    items: readonly(items),
    cargando: readonly(cargando),
    error: readonly(error),
    hayMas: readonly(hayMas),
    meta: readonly(meta),
    parametros: readonly(parametros),
    cargar,
    recargar,
    masPaginas,
    irAPagina,
    limite,
    agregar,
    obtener,
    crear,
    actualizar,
    eliminar,
    limpiar,
  })
}
