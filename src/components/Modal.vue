<script>
const abiertas = [] // ventanas abiertas, de la de abajo a la de encima
</script>

<script setup>
import { onMounted, onBeforeUnmount, ref, useId } from 'vue'
import { X } from 'lucide-vue-next'

// Ventana para crear y editar: ocupa toda la pantalla, con el título y la X arriba, el contenido con su propio
// desplazamiento y los botones del formulario (`pie-fijo`) pegados abajo. Se cierra con la X o con Escape.
// Mientras está abierta, la página de atrás no se desplaza.
const props = defineProps({ titulo: { type: String, required: true } })
const emit = defineEmits(['cerrar'])

const idTitulo = useId()
const caja = ref(null)
const cerrar = () => emit('cerrar')
const yo = Symbol()
// Con una confirmación abierta encima, Escape es de la confirmación, no de la ventana
const alTeclear = (e) => e.key === 'Escape' && abiertas.at(-1) === yo && !e.defaultPrevented && !document.querySelector('.swal2-container') && (e.preventDefault(), cerrar())

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
    <div ref="caja" role="dialog" aria-modal="true" :aria-labelledby="idTitulo" tabindex="-1" class="fixed inset-0 z-[60] flex flex-col bg-brand-50 outline-none print:hidden">
      <header class="shrink-0 border-b border-brand-100 bg-white pt-[env(safe-area-inset-top)]">
        <div class="flex items-center justify-between gap-2 px-4 py-2.5 lg:px-8">
          <h2 :id="idTitulo" class="truncate text-lg font-bold text-brand-900">{{ props.titulo }}</h2>
          <button type="button" class="-mr-1.5 flex size-11 shrink-0 items-center justify-center rounded-full text-brand-700 active:bg-brand-100" aria-label="Cerrar" @click="cerrar">
            <X :size="22" aria-hidden="true" />
          </button>
        </div>
      </header>
      <div class="cuerpo-modal min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 lg:px-8">
        <slot />
      </div>
    </div>
  </Teleport>
</template>
