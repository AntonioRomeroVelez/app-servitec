<script setup>
import { ref, watch } from 'vue'
import { Loader } from 'lucide-vue-next'
import { consultas } from '../carga'

// Indicador común: una barra arriba y un aviso abajo mientras haya consultas en curso. No bloquea la pantalla.
// Se espera un instante antes de mostrarlo para que lo inmediato no parpadee.
const visible = ref(false)
let espera
watch(
  () => consultas.value > 0,
  (hay) => {
    clearTimeout(espera)
    if (hay) espera = setTimeout(() => (visible.value = true), 200)
    else visible.value = false
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="visible" class="pointer-events-none fixed inset-0 z-[70] print:hidden" role="status">
    <div class="barra-carga h-1 w-full overflow-hidden bg-brand-200">
      <span class="block h-full w-1/3 bg-acento" />
    </div>
    <p class="absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 flex items-center gap-2 rounded-full bg-brand-900/90 px-3 py-1.5 text-xs font-semibold text-white shadow-md">
      <Loader :size="14" class="animate-spin" aria-hidden="true" />Cargando…
    </p>
  </div>
</template>

<style scoped>
.barra-carga span {
  animation: avanzar 1.1s ease-in-out infinite;
}
@keyframes avanzar {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(300%);
  }
}
</style>
