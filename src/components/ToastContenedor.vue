<script setup>
import { CircleAlert, CircleCheck, Info, X } from 'lucide-vue-next'
import { useToast } from '../composables/useToast'

// Pila de notificaciones emergentes, arriba y centrada; no estorba al tocar (solo los toasts reciben toques).
const { toasts, quitar } = useToast()
const estilos = {
  exito: 'bg-emerald-600 text-white',
  error: 'bg-red-600 text-white',
  info: 'bg-brand-800 text-white',
}
const iconos = { exito: CircleCheck, error: CircleAlert, info: Info }
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4 print:hidden" aria-live="polite">
    <TransitionGroup enter-active-class="transition duration-200" enter-from-class="-translate-y-2 opacity-0" leave-active-class="transition duration-150" leave-to-class="opacity-0">
      <div v-for="t in toasts" :key="t.id" class="pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-xl px-3 py-2.5 text-sm font-medium shadow-lg" :class="estilos[t.tipo]" :role="t.tipo === 'error' ? 'alert' : 'status'">
        <component :is="iconos[t.tipo]" :size="18" class="mt-0.5 shrink-0" aria-hidden="true" />
        <span class="min-w-0 flex-1 break-words">{{ t.texto }}</span>
        <button class="-m-1 flex size-7 shrink-0 items-center justify-center rounded-full active:bg-white/20" aria-label="Cerrar aviso" @click="quitar(t.id)">
          <X :size="16" aria-hidden="true" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
