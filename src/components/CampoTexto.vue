<script setup>
import { ref, watch, nextTick, onMounted } from 'vue'

// Área de texto que empieza con las filas indicadas y crece sola mientras se escribe (sin barra de desplazamiento).
const modelo = defineModel({ type: String, default: '' })
const props = defineProps({ filas: { type: Number, default: 1 } })
const area = ref(null)

function ajustar() {
  const el = area.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
}
onMounted(ajustar)
watch(modelo, () => nextTick(ajustar))
</script>

<template>
  <textarea ref="area" v-model="modelo" :rows="props.filas" class="campo resize-none overflow-hidden leading-6" />
</template>
