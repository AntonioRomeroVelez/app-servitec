<script setup>
import { computed } from 'vue'

const props = defineProps({ estado: String })
const clase = computed(
  () =>
    ({
      // Informes
      Borrador: 'bg-brand-100 text-brand-800',
      'En revisión': 'bg-acento text-acento-texto',
      Finalizado: 'bg-emerald-100 text-emerald-800',
      // Visitas
      Programada: 'bg-brand-100 text-brand-800',
      Aceptada: 'bg-brand-300 text-brand-950',
      'En curso': 'bg-acento text-acento-texto',
      Realizada: 'bg-emerald-100 text-emerald-800',
      Cancelada: 'bg-red-100 text-red-800',
    })[props.estado] || 'bg-brand-100 text-brand-800',
)
</script>

<template>
  <span class="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold" :class="clase">{{ estado }}</span>
</template>
