<script setup>
import { Plus } from 'lucide-vue-next'

// Botón flotante para crear: el mismo en todas las listas, siempre abajo a la derecha. Dice qué se va a crear.
defineProps({ texto: { type: String, required: true } })
</script>

<template>
  <button type="button" class="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-10 flex h-12 items-center justify-center gap-2 rounded-full bg-acento pr-5 pl-4 text-sm font-semibold text-acento-texto shadow-md active:bg-acento-600 lg:right-8 print:hidden">
    <Plus :size="22" aria-hidden="true" />
    {{ texto }}
  </button>
</template>
