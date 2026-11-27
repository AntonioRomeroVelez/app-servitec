<script setup>
import { Inbox } from 'lucide-vue-next'

// Estado vacío común: icono, una frase y, si ayuda, una acción (en el contenido).
defineProps({ texto: { type: String, required: true }, icono: { type: [Object, Function], default: () => Inbox } })
</script>

<template>
  <div class="grid justify-items-center gap-3 py-10 text-center text-brand-700">
    <component :is="icono" :size="32" class="text-brand-400" aria-hidden="true" />
    <p>{{ texto }}</p>
    <slot />
  </div>
</template>
