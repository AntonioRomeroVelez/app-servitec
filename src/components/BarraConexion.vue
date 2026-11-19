<script setup>
import { WifiOff, CloudUpload, RefreshCw, CircleAlert } from 'lucide-vue-next'
import { estado } from '../offline/estado'

defineEmits(['ver'])
</script>

<template>
  <button
    v-if="!estado.enLinea || estado.pendientes || estado.fallidas"
    class="flex min-h-10 w-full items-center justify-center gap-2 px-4 py-1.5 text-center text-sm font-medium print:hidden"
    :class="estado.fallidas ? 'bg-red-100 text-red-800' : !estado.enLinea ? 'bg-acento text-acento-texto' : 'bg-brand-100 text-brand-800'"
    @click="$emit('ver')"
  >
    <CircleAlert v-if="estado.fallidas" :size="18" class="shrink-0" aria-hidden="true" />
    <WifiOff v-else-if="!estado.enLinea" :size="18" class="shrink-0" aria-hidden="true" />
    <RefreshCw v-else-if="estado.sincronizando" :size="18" class="shrink-0 animate-spin" aria-hidden="true" />
    <CloudUpload v-else :size="18" class="shrink-0" aria-hidden="true" />
    <span v-if="estado.fallidas">{{ estado.fallidas === 1 ? '1 cambio no se pudo enviar' : `${estado.fallidas} cambios no se pudieron enviar` }}. Toca para revisar.</span>
    <span v-else-if="!estado.enLinea">
      Sin conexión: puedes seguir trabajando.
      <template v-if="estado.pendientes">{{ estado.pendientes === 1 ? '1 cambio' : `${estado.pendientes} cambios` }} por enviar.</template>
    </span>
    <span v-else-if="estado.sincronizando">Enviando cambios…</span>
    <span v-else>{{ estado.pendientes === 1 ? '1 cambio por enviar' : `${estado.pendientes} cambios por enviar` }}</span>
  </button>
</template>
