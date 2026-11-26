<script setup>
import { ref, onMounted } from 'vue'
import { PenLine, Eraser } from 'lucide-vue-next'

// Firma manuscrita en canvas. v-model = data URL PNG (fondo transparente, ~3-8 KB).
const modelo = defineModel({ type: String, default: '' })

const W = 360
const H = 140
const canvas = ref(null)
let ctx
let dibujando = false

onMounted(() => {
  ctx = canvas.value.getContext('2d')
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-brand-900').trim() || '#0a2a5e' // sigue los colores de la marca
  if (modelo.value) {
    const img = new Image()
    img.onload = () => ctx.drawImage(img, 0, 0)
    img.src = modelo.value
  }
})

function punto(e) {
  const r = canvas.value.getBoundingClientRect()
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }
}

function inicio(e) {
  dibujando = true
  canvas.value.setPointerCapture(e.pointerId)
  const { x, y } = punto(e)
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + 0.1, y + 0.1) // un toque deja un punto
  ctx.stroke()
}

function mover(e) {
  if (!dibujando) return
  const { x, y } = punto(e)
  ctx.lineTo(x, y)
  ctx.stroke()
}

function fin() {
  if (!dibujando) return
  dibujando = false
  modelo.value = canvas.value.toDataURL('image/png')
}

function borrar() {
  ctx.clearRect(0, 0, W, H)
  modelo.value = ''
}
</script>

<template>
  <div class="grid max-w-xl gap-1.5">
    <div class="relative">
    <canvas
      ref="canvas"
      :width="W"
      :height="H"
      class="block w-full cursor-crosshair touch-none rounded-xl border-2 border-dashed border-brand-300 bg-white"
      aria-label="Área de firma"
      @pointerdown.prevent="inicio"
      @pointermove.prevent="mover"
      @pointerup="fin"
      @pointercancel="fin"
    />
      <!-- Línea y texto guía: no estorban al dibujar y el texto desaparece al firmar -->
      <span class="pointer-events-none absolute inset-x-8 bottom-8 border-b border-brand-200" aria-hidden="true" />
      <span v-if="!modelo" class="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm text-brand-400" aria-hidden="true"><PenLine :size="18" />Firme aquí</span>
    </div>
    <div class="flex items-center justify-between text-xs text-brand-700/70">
      <span>Firma con el dedo o el ratón dentro del recuadro</span>
      <button type="button" class="flex min-h-9 items-center gap-1.5 px-2 font-semibold text-brand-700" @click="borrar"><Eraser :size="14" aria-hidden="true" />Borrar firma</button>
    </div>
  </div>
</template>
