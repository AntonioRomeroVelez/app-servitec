import { ref, readonly } from 'vue'
import { call } from '../api'

// Avisos de la app (la campana). No hay "push" desde Apps Script, así que se consulta un resumen liviano
// cada minuto mientras la app está visible, y al volver a ella.
const items = ref([])
const noLeidas = ref(0)
const cargando = ref(false)
let temporizador = null

async function resumen() {
  try {
    noLeidas.value = (await call('notificaciones_list', { resumen: true })).noLeidas
  } catch {
    /* sin conexión o sesión vencida: se intenta de nuevo en el próximo ciclo */
  }
}

async function cargar() {
  cargando.value = true
  try {
    const r = await call('notificaciones_list')
    items.value = r.items
    noLeidas.value = r.noLeidas
  } catch {
    /* se muestra lo que ya hubiera */
  } finally {
    cargando.value = false
  }
}

async function marcar(ids) {
  items.value = items.value.map((n) => (ids.includes(n.id) ? { ...n, leida: true } : n))
  noLeidas.value = items.value.filter((n) => !n.leida).length
  try {
    await call('notificaciones_leer', { ids })
  } catch {
    /* si falla, el aviso reaparece como no leído en la próxima consulta */
  }
}

async function marcarTodas() {
  items.value = items.value.map((n) => ({ ...n, leida: true }))
  noLeidas.value = 0
  try {
    await call('notificaciones_leer', { todas: true })
  } catch {
    /* igual que arriba */
  }
}

const alVolver = () => document.visibilityState === 'visible' && resumen()

function iniciar() {
  detener()
  resumen()
  temporizador = setInterval(alVolver, 60000)
  document.addEventListener('visibilitychange', alVolver)
}

function detener() {
  clearInterval(temporizador)
  document.removeEventListener('visibilitychange', alVolver)
  items.value = []
  noLeidas.value = 0
}

export function useNotificaciones() {
  return { items: readonly(items), noLeidas: readonly(noLeidas), cargando: readonly(cargando), cargar, marcar, marcarTodas, iniciar, detener }
}
