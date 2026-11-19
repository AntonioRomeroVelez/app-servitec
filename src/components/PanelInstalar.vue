<script setup>
import { ref } from 'vue'
import { useInstalacion } from '../composables/useInstalacion'
import { CircleCheck, Copy, Download, EllipsisVertical, Share, SquarePlus, TriangleAlert } from 'lucide-vue-next'

// Instrucciones de instalación según el dispositivo. Se usa en la pantalla del QR (antes del ingreso) y en el menú.
const { plataforma, instalada, puedeInstalar, seguro, instalar } = useInstalacion()
const resultado = ref('')
const copiado = ref(false)

async function instalarAhora() {
  resultado.value = (await instalar()) === 'accepted' ? 'Instalando la app…' : 'Instalación cancelada. Puedes intentarlo de nuevo.'
}
async function copiarEnlace() {
  try {
    await navigator.clipboard.writeText(location.origin + location.pathname)
    copiado.value = true
    setTimeout(() => (copiado.value = false), 2500)
  } catch {
    copiado.value = false
  }
}
</script>

<template>
  <div class="grid gap-3">
    <p v-if="instalada" class="flex items-center gap-2 rounded-xl bg-emerald-100 p-3 text-sm font-medium text-emerald-800" role="status">
      <CircleCheck :size="20" aria-hidden="true" class="shrink-0" /> La app ya está instalada en este dispositivo.
    </p>

    <template v-else>
      <p v-if="!seguro" class="flex items-start gap-2 rounded-xl bg-amber-100 p-3 text-sm text-amber-900" role="alert">
        <TriangleAlert :size="20" aria-hidden="true" class="mt-0.5 shrink-0" />
        Esta dirección no usa HTTPS, por eso el navegador no permite instalar la app. Pide a quien administra la app que use la dirección segura (https://).
      </p>

      <!-- Navegador dentro de otra app (WhatsApp, Facebook...) -->
      <div v-else-if="plataforma.enApp" class="grid gap-3 rounded-xl bg-amber-100 p-3 text-sm text-amber-900">
        <p class="flex items-start gap-2"><TriangleAlert :size="20" aria-hidden="true" class="mt-0.5 shrink-0" /> Estás en el navegador de otra aplicación y desde ahí no se puede instalar.</p>
        <p>Copia el enlace y ábrelo en {{ plataforma.sistema === 'ios' ? 'Safari' : 'Chrome' }}, o toca el menú de esta pantalla y elige "Abrir en el navegador".</p>
        <button type="button" class="btn-borde" @click="copiarEnlace"><Copy :size="18" aria-hidden="true" /> {{ copiado ? 'Enlace copiado' : 'Copiar enlace' }}</button>
      </div>

      <!-- Chrome, Edge, Samsung: instalación con un toque -->
      <template v-else-if="puedeInstalar">
        <button type="button" class="btn w-full" @click="instalarAhora"><Download :size="20" aria-hidden="true" /> Instalar la app</button>
        <p v-if="resultado" class="text-center text-sm text-brand-700" role="status">{{ resultado }}</p>
      </template>

      <!-- iPhone / iPad -->
      <ol v-else-if="plataforma.sistema === 'ios'" class="grid gap-3 text-sm text-brand-900">
        <li class="flex items-start gap-3"><span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold">1</span><span class="pt-1">Abre esta página en <strong>Safari</strong> si estás en otro navegador.</span></li>
        <li class="flex items-start gap-3"><span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold">2</span><span class="pt-1">Toca el botón <strong>Compartir</strong> <Share :size="16" class="mx-0.5 inline" aria-hidden="true" /> de la barra del navegador.</span></li>
        <li class="flex items-start gap-3"><span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold">3</span><span class="pt-1">Elige <strong>Agregar a pantalla de inicio</strong> <SquarePlus :size="16" class="mx-0.5 inline" aria-hidden="true" /> y toca <strong>Agregar</strong>.</span></li>
      </ol>

      <!-- Android sin aviso automático (Firefox, o el aviso aún no llegó) -->
      <ol v-else-if="plataforma.sistema === 'android'" class="grid gap-3 text-sm text-brand-900">
        <li class="flex items-start gap-3"><span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold">1</span><span class="pt-1">Toca el menú del navegador <EllipsisVertical :size="16" class="mx-0.5 inline" aria-hidden="true" /> (arriba a la derecha).</span></li>
        <li class="flex items-start gap-3"><span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold">2</span><span class="pt-1">Elige <strong>Instalar aplicación</strong> o <strong>Agregar a la pantalla principal</strong>.</span></li>
        <li class="flex items-start gap-3"><span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold">3</span><span class="pt-1">Confirma con <strong>Instalar</strong>. La app aparecerá con su icono junto a tus demás aplicaciones.</span></li>
      </ol>

      <!-- Computador -->
      <p v-else class="text-sm text-brand-900">En Chrome o Edge busca el icono de instalación <Download :size="16" class="mx-0.5 inline" aria-hidden="true" /> al final de la barra de direcciones, o abre el menú del navegador y elige <strong>Instalar ServiTec</strong>.</p>
    </template>
  </div>
</template>
