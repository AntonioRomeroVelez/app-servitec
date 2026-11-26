<script setup>
import { confirmar } from '../composables/useConfirmar'
import { ref, watch, onMounted } from 'vue'
import { RefreshCw, RotateCcw, Trash2, CloudUpload, CircleAlert, CheckCheck } from 'lucide-vue-next'
import { offline } from '../api'
import { estado } from '../offline/estado'
import { describir } from '../offline/descripcion'
import { tiempoRelativo } from '../utils'

// Cambios hechos sin conexión que aún no llegaron al servidor, y los que el servidor rechazó al enviarlos
const ops = ref([])

async function cargar() {
  ops.value = offline ? await offline.listarCola() : []
}
onMounted(cargar)
watch(() => [estado.pendientes, estado.fallidas], cargar)

async function enviar() {
  if (!offline) return
  await offline.sondear()
  await offline.sincronizar()
  await cargar()
}

async function reintentar(op) {
  await offline.reintentar(op.n)
  await cargar()
}

async function descartar(op) {
  if (!(await confirmar({ titulo: '¿Descartar este cambio?', texto: 'No se enviará al servidor y se perderá lo que hiciste.', confirmar: 'Descartar', peligro: true }))) return
  await offline.descartar(op.n)
  await cargar()
}
</script>

<template>
  <div class="mb-3 flex items-center justify-between gap-2">
    <p class="text-sm text-brand-700">{{ estado.enLinea ? 'Con conexión' : 'Sin conexión' }}</p>
    <button class="btn-acento min-h-10 flex-none text-sm" :disabled="estado.sincronizando || !ops.length" @click="enviar">
      <RefreshCw :size="16" :class="{ 'animate-spin': estado.sincronizando }" aria-hidden="true" />
      Enviar ahora
    </button>
  </div>

  <div v-if="!ops.length" class="tarjeta grid justify-items-center gap-2 py-10 text-center text-brand-700">
    <CheckCheck :size="32" aria-hidden="true" />
    <p>No hay cambios pendientes. Todo está enviado.</p>
  </div>

  <ul class="grid gap-2.5 lg:grid-cols-[repeat(auto-fit,minmax(24rem,1fr))]">
    <li v-for="op in ops" :key="op.n" class="tarjeta grid gap-2 border-l-4" :class="op.estado === 'fallida' ? 'border-l-red-400' : 'border-l-brand-300'">
      <div class="flex items-start gap-3">
        <span class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full" :class="op.estado === 'fallida' ? 'bg-red-100 text-red-700' : 'bg-brand-100 text-brand-700'">
          <CircleAlert v-if="op.estado === 'fallida'" :size="18" aria-hidden="true" />
          <CloudUpload v-else :size="18" aria-hidden="true" />
        </span>
        <div class="grid min-w-0 flex-1 gap-0.5">
          <strong class="text-brand-900">{{ describir(op) }}</strong>
          <span class="text-xs text-brand-700/70">{{ tiempoRelativo(op.creado) }} · {{ op.estado === 'fallida' ? 'No se pudo enviar' : 'Esperando conexión' }}</span>
          <span v-if="op.estado === 'fallida'" class="mt-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-sm text-red-800">{{ op.error }}</span>
        </div>
      </div>
      <div v-if="op.estado === 'fallida'" class="flex gap-2">
        <button class="btn-borde min-h-10 text-sm" @click="reintentar(op)">
          <RotateCcw :size="16" aria-hidden="true" />
          Reintentar
        </button>
        <button class="btn-peligro min-h-10 text-sm" @click="descartar(op)">
          <Trash2 :size="16" aria-hidden="true" />
          Descartar
        </button>
      </div>
    </li>
  </ul>
</template>
