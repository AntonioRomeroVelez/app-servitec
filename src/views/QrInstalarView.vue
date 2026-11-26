<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import QRCode from 'qrcode'
import { useConfiguracion } from '../composables/useConfiguracion'
import { useAuth } from '../composables/useAuth'
import { enlaceInstalacion, avisosDireccion } from '../plataforma'
import { APP } from '../app'
import { Copy, Download, Printer, Share2, TriangleAlert } from 'lucide-vue-next'

// Código QR para instalar la app (administradores y superadministrador). Incluye la empresa para mostrar su marca. Lleva a la dirección de la app con ?instalar=1: quien lo escanea ve
// las instrucciones de instalación y luego el ingreso. La dirección se recuerda en este dispositivo.
const { empresa } = useConfiguracion()
const { usuario } = useAuth()
const CLAVE = 'servitec.direccion-qr'
const guardada = (() => {
  try {
    return localStorage.getItem(CLAVE)
  } catch {
    return null
  }
})()
const direccion = ref(guardada || location.origin + location.pathname)
const imagen = ref('')
const copiado = ref(false)
const compartible = typeof navigator.share === 'function'

const enlace = computed(() => enlaceInstalacion(direccion.value, usuario.value?.empresaId))
const avisos = computed(() => avisosDireccion(direccion.value))

async function dibujar() {
  imagen.value = enlace.value ? await QRCode.toDataURL(enlace.value, { errorCorrectionLevel: 'M', margin: 2, width: 720, color: { dark: '#0a2a5e', light: '#ffffff' } }) : ''
}
watch(enlace, () => {
  dibujar()
  try {
    if (enlace.value) localStorage.setItem(CLAVE, direccion.value.trim())
  } catch {
    /* sin almacenamiento: no se recuerda */
  }
})
onMounted(dibujar)

function descargar() {
  const a = document.createElement('a')
  a.href = imagen.value
  a.download = `qr-instalar-${APP.nombre.toLowerCase()}.png`
  a.click()
}
async function copiar() {
  try {
    await navigator.clipboard.writeText(enlace.value)
    copiado.value = true
    setTimeout(() => (copiado.value = false), 2500)
  } catch {
    copiado.value = false
  }
}
function compartir() {
  navigator.share({ title: `Instala ${APP.nombre}`, text: `Instala ${APP.nombre} en tu teléfono:`, url: enlace.value }).catch(() => {})
}
</script>

<template>
  <div class="mx-auto grid w-full max-w-md gap-4 lg:max-w-none lg:grid-cols-2 lg:items-start">
    <div class="print:hidden">
      <label class="etiqueta">Dirección de la app
        <input v-model="direccion" class="campo" type="url" inputmode="url" autocapitalize="none" placeholder="https://..." />
      </label>
      <p v-if="!enlace" class="mt-2 text-sm text-red-700" role="alert">Escribe la dirección completa, empezando con https://</p>
      <p v-if="avisos.includes('sin-https')" class="mt-2 flex items-start gap-2 rounded-xl bg-amber-100 p-3 text-sm text-amber-900" role="alert">
        <TriangleAlert :size="18" class="mt-0.5 shrink-0" aria-hidden="true" /> Sin HTTPS el navegador no deja instalar la app. Usa la dirección publicada (https://).
      </p>
      <p v-if="avisos.includes('local')" class="mt-2 flex items-start gap-2 rounded-xl bg-amber-100 p-3 text-sm text-amber-900" role="alert">
        <TriangleAlert :size="18" class="mt-0.5 shrink-0" aria-hidden="true" /> Es una dirección interna: solo funcionará para teléfonos conectados a la misma red.
      </p>
    </div>

    <!-- Tarjeta imprimible -->
    <section v-if="imagen" class="tarjeta grid justify-items-center gap-3 p-5 text-center">
      <p class="text-xl font-black text-brand-900">{{ empresa.nombre }}</p>
      <h2 class="text-lg font-bold text-brand-800">Instala {{ APP.nombre }} en tu teléfono</h2>
      <img :src="imagen" :alt="`Código QR para instalar ${APP.nombre}`" class="aspect-square w-full max-w-72" />
      <p class="text-sm text-brand-700">Abre la cámara del teléfono, apunta al código y toca el aviso que aparece.</p>
      <p class="max-w-full text-xs break-all text-brand-500">{{ enlace }}</p>
    </section>

    <div v-if="imagen" class="flex flex-wrap gap-2 print:hidden">
      <button type="button" class="btn" @click="descargar"><Download :size="18" aria-hidden="true" /> Descargar imagen</button>
      <button type="button" class="btn-borde" @click="imprimir"><Printer :size="18" aria-hidden="true" /> Imprimir</button>
      <button type="button" class="btn-borde" @click="copiar"><Copy :size="18" aria-hidden="true" /> {{ copiado ? 'Enlace copiado' : 'Copiar enlace' }}</button>
      <button v-if="compartible" type="button" class="btn-borde" @click="compartir"><Share2 :size="18" aria-hidden="true" /> Compartir</button>
    </div>
  </div>
</template>

<script>
const imprimir = () => window.print()
</script>
