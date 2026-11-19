import { reactive } from 'vue'

// Notificaciones emergentes (toast). Estado global compartido: se muestran en ToastContenedor.vue.
const toasts = reactive([])
let siguiente = 1

function quitar(id) {
  const i = toasts.findIndex((t) => t.id === id)
  if (i >= 0) toasts.splice(i, 1)
}

function agregar(tipo, texto, duracion) {
  if (!texto) return
  const id = siguiente++
  toasts.push({ id, tipo, texto })
  // Los errores duran más para dar tiempo de leerlos
  setTimeout(() => quitar(id), duracion ?? (tipo === 'error' ? 6000 : 3500))
  return id
}

export function useToast() {
  return {
    toasts,
    quitar,
    exito: (texto, d) => agregar('exito', texto, d),
    error: (texto, d) => agregar('error', texto, d),
    info: (texto, d) => agregar('info', texto, d),
  }
}
