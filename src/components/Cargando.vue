<script setup>
import { Loader } from 'lucide-vue-next'

// Indicador de carga común
defineProps({ texto: { type: String, default: 'Cargando…' } })
</script>

<template>
  <p class="flex items-center justify-center gap-2 py-10 text-brand-700" role="status">
    <Loader :size="18" class="animate-spin" aria-hidden="true" />{{ texto }}
  </p>
</template>
