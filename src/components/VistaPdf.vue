<script setup>
import { onBeforeUnmount } from 'vue'
import { Download, ExternalLink, FileText } from 'lucide-vue-next'
import Modal from './Modal.vue'

// Muestra un PDF ya generado dentro de una ventana, con la opción de descargarlo. Los navegadores sin visor de PDF integrado
// (la mayoría de celulares Android) no pueden dibujarlo aquí: se ofrece abrirlo o descargarlo.
const props = defineProps({ archivo: { type: Blob, required: true }, nombre: { type: String, required: true }, titulo: { type: String, default: 'Vista previa' } })
const emit = defineEmits(['cerrar'])

const url = URL.createObjectURL(props.archivo)
const conVisor = navigator.pdfViewerEnabled !== false
onBeforeUnmount(() => setTimeout(() => URL.revokeObjectURL(url), 60000)) // da tiempo a una descarga o pestaña recién abierta
</script>

<template>
  <Modal :titulo="titulo" @cerrar="emit('cerrar')">
    <div class="grid gap-3">
      <iframe v-if="conVisor" :src="`${url}#view=FitH`" :title="titulo" class="min-h-[60dvh] w-full flex-1 rounded-xl border border-brand-200 bg-brand-50" />
      <div v-else class="grid justify-items-center gap-2 rounded-xl bg-brand-50 px-4 py-10 text-center">
        <FileText :size="40" class="text-brand-600" aria-hidden="true" />
        <p class="text-sm text-brand-800">Este navegador no puede mostrar el PDF dentro de la app. Ábrelo o descárgalo para verlo.</p>
      </div>
      <div class="pie-fijo !flex flex-wrap sm:justify-end">
        <button type="button" class="btn-borde" @click="emit('cerrar')">Cerrar</button>
        <a :href="url" target="_blank" rel="noopener" class="btn-borde"><ExternalLink :size="18" aria-hidden="true" />Abrir aparte</a>
        <a :href="url" :download="nombre" class="btn"><Download :size="18" aria-hidden="true" />Descargar</a>
      </div>
    </div>
  </Modal>
</template>
