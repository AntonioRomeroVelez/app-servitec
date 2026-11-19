import { ref, readonly } from 'vue'
import { call } from '../api'

const usuarios = ref([])
const cargando = ref(false)
const error = ref('')

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

export function useUsuarios() {
  const cargar = () => run(async () => (usuarios.value = await call('usuarios_list')))

  const crear = (data) =>
    run(async () => {
      const u = await call('usuarios_create', { data })
      usuarios.value = [...usuarios.value, u]
    })

  const actualizar = (id, data) =>
    run(async () => {
      const u = await call('usuarios_update', { id, data })
      usuarios.value = usuarios.value.map((x) => (x.id === id ? u : x))
    })

  return { usuarios: readonly(usuarios), cargando: readonly(cargando), error: readonly(error), cargar, crear, actualizar }
}
