// Vigila la conexión mientras hay una sesión abierta: cuando vuelve la red envía los cambios en cola y avisa a la app
// para que recargue los datos. Devuelve una función que detiene todo (al cerrar sesión).
import { estado } from './estado.js'

const CADA_MS = 30000

export function iniciarConexion(capa, { alRecuperar = () => {} } = {}) {
  let detenido = false

  async function revisar() {
    if (detenido) return
    await capa.refrescar()
    if (estado.pendientes > 0) await capa.sincronizar() // alSincronizar recarga los datos si se envió algo
    else if (!estado.enLinea && (await capa.sondear())) alRecuperar() // estaba sin conexión y volvió
  }

  async function alVolverLaRed() {
    const estabaSinConexion = !estado.enLinea
    estado.enLinea = true // el navegador avisa que hay red; si no es cierto, el primer envío lo corregirá
    await revisar()
    if (estabaSinConexion && estado.pendientes === 0 && !detenido) alRecuperar()
  }
  const alPerderLaRed = () => (estado.enLinea = false)
  const alVolverALaApp = () => document.visibilityState === 'visible' && revisar()

  window.addEventListener('online', alVolverLaRed)
  window.addEventListener('offline', alPerderLaRed)
  document.addEventListener('visibilitychange', alVolverALaApp)
  const temporizador = setInterval(revisar, CADA_MS)

  estado.enLinea = navigator.onLine !== false
  navigator.storage?.persist?.() // pide que el navegador no borre los cambios pendientes si falta espacio
  revisar()

  return () => {
    detenido = true
    clearInterval(temporizador)
    window.removeEventListener('online', alVolverLaRed)
    window.removeEventListener('offline', alPerderLaRed)
    document.removeEventListener('visibilitychange', alVolverALaApp)
  }
}
