<script setup>
import { ref, onMounted } from 'vue'

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
  <div class="grid gap-1.5">
    <canvas
      ref="canvas"
      :width="W"
      :height="H"
      class="w-full touch-none rounded-xl border border-dashed border-brand-300 bg-white"
      aria-label="Área de firma"
      @pointerdown.prevent="inicio"
      @pointermove.prevent="mover"
      @pointerup="fin"
      @pointercancel="fin"
    />
    <div class="flex items-center justify-between text-xs text-brand-700/70">
      <span>Firma con el dedo dentro del recuadro</span>
      <button type="button" class="min-h-9 px-2 font-semibold text-brand-700" @click="borrar">Borrar firma</button>
    </div>
  </div>
</template>
