<script setup>
// Una línea de dato con icono (Lucide) para las tarjetas: se lee de un vistazo y recorta el texto largo.
defineProps({ icono: { type: [Object, Function], required: true }, etiqueta: String, ajustar: Boolean })
</script>

<template>
  <span class="flex min-w-0 items-start gap-1.5 text-sm text-brand-800">
    <component :is="icono" :size="15" class="mt-0.5 shrink-0 text-brand-500" aria-hidden="true" />
    <span v-if="etiqueta" class="sr-only">{{ etiqueta }}: </span>
    <span :class="ajustar ? 'break-words' : 'truncate'"><slot /></span>
  </span>
</template>
