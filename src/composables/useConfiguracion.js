import { ref, computed, readonly } from 'vue'
import { call } from '../api'
import { CONFIG_DEFECTO, combinar, clonar } from '../configuracion'
import { aplicarTema } from '../tema'
import { APP } from '../app'

// Configuración que el superadmin personaliza: empresa, colores, logo, informes y tipos de visita.
// La última recibida se guarda en el dispositivo: así los colores y el logo aparecen al instante (sin parpadeo) y
// también sin conexión. La lectura es pública porque la necesita la pantalla de ingreso, antes de autenticarse.
const KEY = 'ferisel-config'

function guardada() {
  try {
    return combinar(JSON.parse(localStorage.getItem(KEY)))
  } catch {
    return clonar(CONFIG_DEFECTO)
  }
}

const config = ref(guardada())

function aplicar(c) {
  aplicarTema(c.tema)
  document.title = `${APP.nombre} · ${c.empresa.nombre}`
}
aplicar(config.value) // al cargar la app, con lo último que se conocía

function recibir(c) {
  config.value = combinar(c)
  try {
    localStorage.setItem(KEY, JSON.stringify(config.value))
  } catch {
    /* sin espacio: se seguirá pidiendo al servidor */
  }
  aplicar(config.value)
}

async function cargar() {
  try {
    recibir(await call('configuracion_get'))
  } catch {
    /* sin conexión: se queda con la última configuración conocida */
  }
}

// Guarda una sección (solo superadmin). Si el servidor la rechaza, el error llega a quien llamó.
async function guardar(seccion, data) {
  recibir(await call('configuracion_update', { seccion, data }))
}

async function restablecer(seccion) {
  recibir(await call('configuracion_update', { seccion, restablecer: true }))
}

export function useConfiguracion() {
  return {
    config: readonly(config),
    empresa: computed(() => config.value.empresa),
    tema: computed(() => config.value.tema),
    logo: computed(() => config.value.logo),
    informes: computed(() => config.value.informes),
    tipos: computed(() => config.value.tipos),
    nombresTipos: computed(() => config.value.tipos.map((t) => t.nombre)),
    cargar,
    guardar,
    restablecer,
    // Vista previa de colores mientras se editan (sin guardar); cancelarVistaPrevia vuelve a los guardados
    vistaPrevia: (tema) => aplicarTema(tema),
    cancelarVistaPrevia: () => aplicarTema(config.value.tema),
  }
}
