<script setup>
import { ref } from 'vue'
import { PenLine, Trash2 } from 'lucide-vue-next'
import FirmaModal from './FirmaModal.vue'
import { confirmar } from '../composables/useConfirmar'

// Campo de firma del informe: muestra la firma guardada y abre una ventana grande para firmar. v-model = data URL PNG.
const modelo = defineModel({ type: String, default: '' })
defineProps({ nombre: { type: String, default: '' } })
const abierto = ref(false)

function aceptar(firma) {
  modelo.value = firma
  abierto.value = false
}
async function borrar() {
  if (await confirmar({ titulo: '¿Borrar la firma?', texto: 'Habrá que firmar de nuevo.', confirmar: 'Borrar', peligro: true })) modelo.value = ''
}
</script>

<template>
  <div class="grid max-w-xl gap-2">
    <button
      type="button"
      class="flex min-h-28 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-300 bg-white p-3 font-semibold text-brand-700 active:bg-brand-50"
      :aria-label="modelo ? 'Cambiar la firma' : 'Firmar'"
      @click="abierto = true"
    >
      <img v-if="modelo" :src="modelo" alt="Firma del cliente" class="max-h-28 max-w-full object-contain" />
      <template v-else><PenLine :size="20" aria-hidden="true" />Tocar para firmar</template>
    </button>
    <div v-if="modelo" class="flex justify-between gap-2 text-sm">
      <button type="button" class="flex min-h-10 items-center gap-1.5 px-2 font-semibold text-brand-700" @click="abierto = true"><PenLine :size="16" aria-hidden="true" />Cambiar firma</button>
      <button type="button" class="flex min-h-10 items-center gap-1.5 px-2 font-semibold text-red-700" @click="borrar"><Trash2 :size="16" aria-hidden="true" />Borrar</button>
    </div>
    <FirmaModal v-if="abierto" :inicial="modelo" :nombre="nombre" @aceptar="aceptar" @cerrar="abierto = false" />
  </div>
</template>
