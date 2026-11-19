import { ref, computed, readonly } from 'vue'
import { detectarPlataforma } from '../plataforma'

// Instalación de la app (PWA). Los navegadores basados en Chromium avisan con `beforeinstallprompt` cuando se puede instalar;
// el evento se guarda para ofrecer un botón "Instalar". Safari (iPhone) no lo tiene: ahí se muestran las instrucciones.
// Los oyentes se registran al cargar el módulo porque el evento puede llegar antes de que se abra la pantalla.
const pantallaCompleta = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches || window.navigator.standalone === true

const evento = ref(null)
const instalada = ref(pantallaCompleta())

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault() // se ofrece desde nuestro propio botón, no desde la barra automática del navegador
  evento.value = e
})
window.addEventListener('appinstalled', () => {
  instalada.value = true
  evento.value = null
})
window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', () => (instalada.value = pantallaCompleta()))

const plataforma = detectarPlataforma(navigator.userAgent, { standalone: instalada.value, tactil: navigator.maxTouchPoints > 1 })

// Instalar con el diálogo del navegador. Devuelve 'accepted' o 'dismissed'.
async function instalar() {
  if (!evento.value) return 'unavailable'
  evento.value.prompt()
  const { outcome } = await evento.value.userChoice
  evento.value = null // el evento solo se puede usar una vez
  return outcome
}

export function useInstalacion() {
  return {
    plataforma,
    instalada: readonly(instalada),
    puedeInstalar: computed(() => !!evento.value && !instalada.value),
    seguro: window.isSecureContext, // sin HTTPS (salvo localhost) el navegador no permite instalar
    instalar,
  }
}
