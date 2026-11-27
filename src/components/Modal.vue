<script>
const abiertas = [] // ventanas abiertas, de la de abajo a la de encima
</script>

<script setup>
import { onMounted, onBeforeUnmount, ref, useId } from 'vue'
import { X } from 'lucide-vue-next'

// Ventana modal para crear y editar. En el celular sube desde abajo como una hoja (casi pantalla completa, con su propio
// desplazamiento); en pantallas grandes va centrada. Se cierra con la X o con Escape; tocar el fondo NO la cierra, para no
// perder lo escrito por accidente. Mientras está abierta, la página de atrás no se desplaza.
// `ancho`: formularios largos que en computadora aprovechan más espacio
const props = defineProps({ titulo: { type: String, required: true }, ancho: Boolean })
const emit = defineEmits(['cerrar'])

const idTitulo = useId()
const caja = ref(null)
const cerrar = () => emit('cerrar')
const yo = Symbol()
const alTeclear = (e) => e.key === 'Escape' && abiertas.at(-1) === yo && !e.defaultPrevented && (e.preventDefault(), cerrar())

let overflowAnterior = ''
onMounted(() => {
  abiertas.push(yo)
  overflowAnterior = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  document.addEventListener('keydown', alTeclear)
  caja.value?.focus({ preventScroll: true }) // el foco entra al diálogo sin abrir el teclado del celular
})
onBeforeUnmount(() => {
  abiertas.splice(abiertas.indexOf(yo), 1)
  document.body.style.overflow = overflowAnterior
  document.removeEventListener('keydown', alTeclear)
})
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4 print:hidden">
      <div
        ref="caja"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="idTitulo"
        tabindex="-1"
        :class="props.ancho ? 'max-w-lg lg:max-w-4xl' : 'max-w-lg'"
        class="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl outline-none sm:max-h-[90dvh] sm:rounded-2xl"
      >
        <header class="flex shrink-0 items-center justify-between gap-2 border-b border-brand-100 px-4 py-2.5">
          <h2 :id="idTitulo" class="truncate text-base font-bold text-brand-900">{{ props.titulo }}</h2>
          <button type="button" class="-mr-1.5 flex size-10 shrink-0 items-center justify-center rounded-full text-brand-700 active:bg-brand-50" aria-label="Cerrar" @click="cerrar">
            <X :size="20" aria-hidden="true" />
          </button>
        </header>
        <div class="overflow-y-auto overscroll-contain px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>
