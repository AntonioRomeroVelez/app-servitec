<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { Check, Eraser, PenLine } from 'lucide-vue-next'
import Modal from './Modal.vue'
import { useSinGuardar } from '../composables/useSinGuardar'

// Ventana grande para firmar. Al aceptar entrega la firma recortada a lo dibujado, como PNG pequeño con fondo transparente.
const props = defineProps({ inicial: { type: String, default: '' }, nombre: { type: String, default: '' } })
const emit = defineEmits(['aceptar', 'cerrar'])

const SALIDA = { ancho: 480, alto: 220 } // tamaño máximo de la imagen guardada (cabe holgada en una celda de la hoja)
const MARGEN = 8

const canvas = ref(null)
const vacia = ref(true)
let ctx
let dibujando = false
let cambiada = false
let caja = null // zona ocupada por el trazo: { x1, y1, x2, y2 }

function ampliar(x, y) {
  caja = caja ? { x1: Math.min(caja.x1, x), y1: Math.min(caja.y1, y), x2: Math.max(caja.x2, x), y2: Math.max(caja.y2, y) } : { x1: x, y1: y, x2: x, y2: y }
}

const salir = useSinGuardar(() => cambiada && !vacia.value) // solo si hay trazos nuevos que se perderían
const cerrar = async () => (await salir()) && emit('cerrar')

onMounted(async () => {
  await nextTick()
  const el = canvas.value
  const r = el.getBoundingClientRect()
  el.width = Math.round(r.width)
  el.height = Math.round(r.height)
  ctx = el.getContext('2d')
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-brand-900').trim() || '#0a2a5e' // sigue los colores de la marca
  if (!props.inicial) return
  const img = new Image()
  img.onload = () => {
    const k = Math.min(1.5, (el.width - 2 * MARGEN) / img.width, (el.height - 2 * MARGEN) / img.height)
    const [w, h] = [img.width * k, img.height * k]
    const [x, y] = [(el.width - w) / 2, (el.height - h) / 2]
    ctx.drawImage(img, x, y, w, h)
    ampliar(x, y)
    ampliar(x + w, y + h)
    vacia.value = false
  }
  img.src = props.inicial
})

function punto(e) {
  const r = canvas.value.getBoundingClientRect()
  return { x: ((e.clientX - r.left) / r.width) * canvas.value.width, y: ((e.clientY - r.top) / r.height) * canvas.value.height }
}

function trazar({ x, y }) {
  ctx.lineTo(x, y)
  ctx.stroke()
  ampliar(x, y)
  cambiada = true
  vacia.value = false
}

function inicio(e) {
  dibujando = true
  canvas.value.setPointerCapture(e.pointerId)
  const p = punto(e)
  ctx.beginPath()
  ctx.moveTo(p.x, p.y)
  trazar({ x: p.x + 0.1, y: p.y + 0.1 }) // un toque deja un punto
}
const mover = (e) => dibujando && trazar(punto(e))
const fin = () => (dibujando = false)

function limpiar() {
  ctx.clearRect(0, 0, canvas.value.width, canvas.value.height)
  caja = null
  cambiada = true
  vacia.value = true
}

function aceptar() {
  if (!cambiada) return emit('cerrar')
  const el = canvas.value
  const x = Math.max(0, caja.x1 - MARGEN)
  const y = Math.max(0, caja.y1 - MARGEN)
  const w = Math.max(1, Math.min(el.width, caja.x2 + MARGEN) - x)
  const h = Math.max(1, Math.min(el.height, caja.y2 + MARGEN) - y)
  const k = Math.min(1, SALIDA.ancho / w, SALIDA.alto / h)
  const salida = document.createElement('canvas')
  salida.width = Math.max(1, Math.round(w * k))
  salida.height = Math.max(1, Math.round(h * k))
  salida.getContext('2d').drawImage(el, x, y, w, h, 0, 0, salida.width, salida.height)
  emit('aceptar', salida.toDataURL('image/png'))
}
</script>

<template>
  <Modal titulo="Firma del cliente" @cerrar="cerrar">
    <div class="grid gap-3">
      <p class="text-sm text-brand-700">{{ nombre ? `Firma de ${nombre}.` : 'Firma de quien recibe.' }} Usa el dedo o el ratón.</p>
      <div class="relative">
        <canvas
          ref="canvas"
          class="block h-[60dvh] min-h-52 w-full cursor-crosshair touch-none rounded-xl border-2 border-dashed border-brand-300 bg-white"
          aria-label="Área de firma"
          @pointerdown.prevent="inicio"
          @pointermove.prevent="mover"
          @pointerup="fin"
          @pointercancel="fin"
        />
        <!-- Línea y texto guía: no estorban al dibujar y el texto desaparece al firmar -->
        <span class="pointer-events-none absolute inset-x-8 bottom-12 border-b border-brand-200" aria-hidden="true" />
        <span v-if="vacia" class="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-brand-400" aria-hidden="true"><PenLine :size="20" />Firme aquí</span>
      </div>
      <div class="pie-fijo !flex flex-wrap items-center justify-between">
        <button type="button" class="flex min-h-11 items-center gap-1.5 px-2 text-sm font-semibold text-brand-700 disabled:opacity-50" :disabled="vacia" @click="limpiar"><Eraser :size="16" aria-hidden="true" />Limpiar</button>
        <div class="flex w-full gap-2 whitespace-nowrap sm:w-auto">
          <button type="button" class="btn-borde" @click="cerrar">Cancelar</button>
          <button type="button" class="btn" :disabled="vacia" @click="aceptar"><Check :size="18" aria-hidden="true" />Usar firma</button>
        </div>
      </div>
    </div>
  </Modal>
</template>
