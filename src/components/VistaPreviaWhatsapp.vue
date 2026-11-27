<script setup>
import { computed } from 'vue'
import { ArrowLeft, CheckCheck } from 'lucide-vue-next'
import Avatar from './Avatar.vue'
import { trozosConFormato } from '../whatsapp'

// Simula la conversación de WhatsApp. El mensaje llega ya con los datos puestos y se muestra como texto (nunca como HTML).
const props = defineProps({ mensaje: { type: String, default: '' }, nombre: { type: String, default: '' }, cargando: Boolean })
const trozos = computed(() => trozosConFormato(props.mensaje))
const hora = new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false })
const clases = { negrita: 'font-bold', cursiva: 'italic', tachado: 'line-through', fijo: 'font-mono text-[13px]' }
</script>

<template>
  <figure class="overflow-hidden rounded-2xl border border-brand-100 bg-[#e5ddd5] shadow-sm" aria-label="Vista previa del mensaje en WhatsApp">
    <div class="flex items-center gap-2 bg-[#075e54] px-3 py-2 text-white">
      <ArrowLeft :size="18" aria-hidden="true" />
      <Avatar :nombre="nombre || 'E'" />
      <span class="min-w-0 truncate text-sm font-semibold">{{ nombre }}</span>
    </div>
    <div class="min-h-40 p-3" :class="{ 'opacity-60': cargando }" :aria-busy="cargando">
      <div v-if="mensaje" class="ml-auto w-fit max-w-[92%] rounded-xl rounded-tr-sm bg-[#dcf8c6] px-3 py-2 text-sm text-neutral-900 shadow-sm">
        <p class="whitespace-pre-wrap wrap-anywhere"><span v-for="(t, i) in trozos" :key="i" :class="clases[t.formato]">{{ t.texto }}</span></p>
        <p class="mt-1 flex items-center justify-end gap-1 text-[11px] text-neutral-500">{{ hora }}<CheckCheck :size="14" class="text-sky-500" aria-hidden="true" /></p>
      </div>
      <p v-else class="py-8 text-center text-sm text-neutral-600">{{ cargando ? 'Preparando la vista previa…' : 'Escribe el mensaje para ver cómo queda.' }}</p>
    </div>
  </figure>
</template>
