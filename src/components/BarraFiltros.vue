<script setup>
import { ref, useSlots } from 'vue'
import { RefreshCw, Search, SlidersHorizontal, X } from 'lucide-vue-next'

// Barra de búsqueda y filtros pensada para el celular: una sola línea (buscar + filtro rápido + acciones) y un panel
// plegable para los filtros extra, así la lista queda a la vista. Slots:
//  - rapido:   control corto en la misma línea (p. ej. un selector)
//  - filtros:  campos extra dentro de un panel que se abre con el botón de filtros (muestra cuántos hay activos)
//  - acciones: botones al final de la línea (p. ej. "Nuevo")
const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: 'Buscar' },
  sinBusqueda: Boolean,
  activos: { type: Number, default: 0 }, // filtros del panel que están aplicados
  recargar: Boolean, // muestra el botón de recargar
})
defineEmits(['update:modelValue', 'refrescar'])
const slots = useSlots()
const abierto = ref(false)
</script>

<template>
  <div class="mb-3 grid gap-2">
    <div class="flex items-center gap-1.5">
      <label v-if="!sinBusqueda" class="relative min-w-0 flex-1">
        <span class="sr-only">{{ placeholder }}</span>
        <Search :size="16" class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-brand-600" aria-hidden="true" />
        <input :value="modelValue" type="search" class="campo !min-h-10 !py-1.5 pr-3 !pl-9 text-sm" :placeholder="placeholder" enterkeyhint="search" @input="$emit('update:modelValue', $event.target.value)" />
      </label>
      <div v-if="slots.rapido" class="shrink-0" :class="sinBusqueda ? 'min-w-0 flex-1' : ''"><slot name="rapido" /></div>
      <button
        v-if="slots.filtros"
        class="relative flex size-10 shrink-0 items-center justify-center rounded-xl border bg-white text-brand-700"
        :class="abierto || activos ? 'border-brand-600' : 'border-brand-200'"
        :aria-expanded="abierto"
        aria-label="Filtros"
        @click="abierto = !abierto"
      >
        <X v-if="abierto" :size="18" aria-hidden="true" />
        <SlidersHorizontal v-else :size="18" aria-hidden="true" />
        <span v-if="activos && !abierto" class="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-acento text-[10px] leading-none font-bold text-acento-texto">{{ activos }}</span>
      </button>
      <button v-if="recargar" class="flex size-10 shrink-0 items-center justify-center rounded-xl border border-brand-200 bg-white text-brand-700" aria-label="Recargar" @click="$emit('refrescar')">
        <RefreshCw :size="18" aria-hidden="true" />
      </button>
      <slot name="acciones" />
    </div>
    <div v-if="slots.filtros && abierto" class="tarjeta grid grid-cols-2 gap-2 !p-3 sm:grid-cols-3"><slot name="filtros" /></div>
  </div>
</template>
