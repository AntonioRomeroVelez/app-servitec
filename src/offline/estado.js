import { reactive } from 'vue'

// Estado de la conexión y de los cambios pendientes (lo muestra la barra de estado de la app)
export const estado = reactive({
  enLinea: true, // false cuando una petición falla por red o el navegador avisa que no hay conexión
  pendientes: 0, // cambios hechos sin conexión que esperan enviarse
  fallidas: 0, // cambios que el servidor rechazó al sincronizar (hay que revisarlos)
  sincronizando: false,
})
