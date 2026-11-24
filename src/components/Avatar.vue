<script setup>
// Círculo con la inicial del nombre (o un icono) para identificar de un vistazo a una persona, cliente o empresa.
defineProps({ nombre: { type: String, default: '' }, icono: [Object, Function], inactivo: Boolean })
</script>

<template>
  <span class="flex size-11 shrink-0 items-center justify-center rounded-full text-base font-bold" :class="inactivo ? 'bg-brand-100 text-brand-500' : 'bg-brand-600 text-white'" aria-hidden="true">
    <component :is="icono" v-if="icono" :size="20" />
    <template v-else>{{ (nombre || '?').trim().charAt(0).toUpperCase() }}</template>
  </span>
</template>
