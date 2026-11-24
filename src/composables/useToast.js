import { toast } from 'vue-sonner'

// Notificaciones emergentes con vue-sonner. El contenedor (<Toaster />) está montado en App.vue.
// Los errores duran más para dar tiempo de leerlos.
const aviso = (funcion, texto, duracion, porDefecto) => (texto ? funcion(texto, { duration: duracion ?? porDefecto }) : undefined)

export function useToast() {
  return {
    exito: (texto, d) => aviso(toast.success, texto, d, 3500),
    error: (texto, d) => aviso(toast.error, texto, d, 6000),
    info: (texto, d) => aviso(toast.info, texto, d, 3500),
  }
}
