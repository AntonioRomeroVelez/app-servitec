<script setup>
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'

// Paginación compacta: "‹  16–30 de 87  ›". Se oculta si todo cabe en una página.
// `offset` es la posición del primer elemento de la página; al cambiar de página emite `ir` con el nuevo offset.
const props = defineProps({
  total: { type: Number, default: 0 },
  offset: { type: Number, default: 0 },
  limite: { type: Number, default: 15 },
  cargando: Boolean,
})
const emit = defineEmits(['ir'])

const desde = computed(() => (props.total ? props.offset + 1 : 0))
const hasta = computed(() => Math.min(props.offset + props.limite, props.total))
const hayAnterior = computed(() => props.offset > 0)
const haySiguiente = computed(() => props.offset + props.limite < props.total)
const paginas = computed(() => Math.max(1, Math.ceil(props.total / props.limite)))
const pagina = computed(() => Math.floor(props.offset / props.limite) + 1)

function ir(offset) {
  emit('ir', Math.max(0, offset))
  if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' }) // cada página se lee desde arriba
}
</script>

<template>
  <nav v-if="total > limite" class="mt-4 flex items-center justify-between gap-2" aria-label="Paginación">
    <button class="flex size-10 items-center justify-center rounded-xl border border-brand-200 bg-white text-brand-700 disabled:opacity-40" :disabled="!hayAnterior || cargando" aria-label="Página anterior" @click="ir(offset - limite)">
      <ChevronLeft :size="20" aria-hidden="true" />
    </button>
    <p class="text-center text-sm text-brand-700" aria-live="polite">
      <span class="font-semibold">{{ desde }}–{{ hasta }}</span> de {{ total }}
      <span class="block text-xs text-brand-700/70">Página {{ pagina }} de {{ paginas }}</span>
    </p>
    <button class="flex size-10 items-center justify-center rounded-xl border border-brand-200 bg-white text-brand-700 disabled:opacity-40" :disabled="!haySiguiente || cargando" aria-label="Página siguiente" @click="ir(offset + limite)">
      <ChevronRight :size="20" aria-hidden="true" />
    </button>
  </nav>
  <p v-else-if="total" class="mt-3 text-center text-xs text-brand-700/70">{{ total }} {{ total === 1 ? 'resultado' : 'resultados' }}</p>
</template>
