<script setup>
import PanelInstalar from '../components/PanelInstalar.vue'
import MarcaEmpresa from '../components/MarcaEmpresa.vue'
import { useConfiguracion } from '../composables/useConfiguracion'
import { useInstalacion } from '../composables/useInstalacion'
import { APP } from '../app'
import { Smartphone, WifiOff, Zap } from 'lucide-vue-next'

// Pantalla a la que llega quien escanea el QR (?instalar=1): explica cómo instalar y luego sigue al ingreso.
// `completa` = pantalla a todo alto antes del login; sin ella se muestra dentro de la app (menú).
defineProps({ completa: Boolean })
defineEmits(['continuar'])
const { instalada } = useInstalacion()
const { fondoIngreso } = useConfiguracion()
</script>

<template>
  <div :style="completa ? fondoIngreso : null" :class="completa ? 'flex min-h-dvh flex-col px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-8' : ''">
    <div :class="completa ? 'my-auto w-full max-w-sm self-center' : 'w-full'">
      <MarcaEmpresa v-if="completa" grande class="mb-6" />

      <section class="tarjeta grid gap-4 p-5">
        <div class="flex items-center gap-3">
          <span class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700"><Smartphone :size="24" aria-hidden="true" /></span>
          <div>
            <h1 class="text-lg font-bold text-brand-900">Instala {{ APP.nombre }}</h1>
            <p class="text-sm text-brand-700">Úsala como una app más de tu teléfono.</p>
          </div>
        </div>

        <ul class="grid gap-1.5 text-sm text-brand-800">
          <li class="flex items-center gap-2"><Zap :size="16" class="shrink-0 text-brand-600" aria-hidden="true" /> Abre con un toque desde la pantalla de inicio</li>
          <li class="flex items-center gap-2"><WifiOff :size="16" class="shrink-0 text-brand-600" aria-hidden="true" /> Funciona aunque no tengas señal y sincroniza después</li>
        </ul>

        <PanelInstalar />

        <button type="button" :class="instalada || completa ? 'btn-borde' : 'hidden'" @click="$emit('continuar')">
          {{ instalada ? 'Continuar' : 'Ahora no, ir a la app' }}
        </button>
      </section>
    </div>
  </div>
</template>
