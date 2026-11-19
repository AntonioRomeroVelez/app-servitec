import { ref } from 'vue'
import { call } from '../api'
import { comprimirImagen } from '../imagen'

const porVisita = ref({}) // visitaId -> [{ id, nombre, mini, autor, creado }]
const completas = new Map() // id -> data URL de la foto completa (caché en memoria)

const poner = (visitaId, lista) => (porVisita.value = { ...porVisita.value, [visitaId]: lista })

export function useFotos() {
  const lista = (visitaId) => porVisita.value[visitaId] || []

  const cargar = async (visitaId) => poner(visitaId, await call('fotos_list', { visitaId }))

  // Comprime en el dispositivo y sube. Devuelve el tamaño final para informar al usuario.
  async function subir(visitaId, file) {
    const c = await comprimirImagen(file)
    const foto = await call('fotos_upload', { visitaId, imagen: c.imagen, mini: c.mini })
    poner(visitaId, [...lista(visitaId), foto])
    return c.bytes
  }

  async function eliminar(visitaId, id) {
    await call('fotos_delete', { id })
    completas.delete(id)
    poner(visitaId, lista(visitaId).filter((f) => f.id !== id))
  }

  async function obtener(id) {
    if (!completas.has(id)) completas.set(id, (await call('fotos_get', { id })).dataUrl)
    return completas.get(id)
  }

  const limpiar = () => {
    porVisita.value = {}
    completas.clear()
  }

  return { lista, cargar, subir, eliminar, obtener, limpiar }
}
