<script setup>
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { X, LogOut } from 'lucide-vue-next'
import ItemMenu from './ItemMenu.vue'
import MarcaEmpresa from './MarcaEmpresa.vue'

// Menú lateral que se abre con el botón hamburguesa (arriba a la izquierda). Árbol de botones y subbotones en cascada.
const props = defineProps({
  abierto: Boolean,
  arbol: { type: Array, required: true }, // [{ id, texto, icono?, insignia?, activo, hijos? }]
  abiertos: { type: Object, required: true }, // Set de grupos desplegados
  usuario: { type: Object, required: true },
})
const emit = defineEmits(['cerrar', 'elegir', 'alternar', 'salir'])

const panel = ref(null)
const FOCALIZABLES = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

// Al abrir: se bloquea el desplazamiento de la página y el foco pasa al menú; al cerrar, el foco vuelve a donde estaba
let foco = null
watch(
  () => props.abierto,
  async (abierto) => {
    document.body.style.overflow = abierto ? 'hidden' : ''
    if (abierto) {
      foco = document.activeElement
      await nextTick()
      panel.value?.querySelector(FOCALIZABLES)?.focus()
    } else {
      foco?.focus?.()
    }
  },
)
onBeforeUnmount(() => (document.body.style.overflow = ''))

// Escape cierra; Tab no se escapa del menú mientras está abierto (es un cuadro modal)
function alTeclear(e) {
  if (e.key === 'Escape') return emit('cerrar')
  if (e.key !== 'Tab') return
  const lista = [...panel.value.querySelectorAll(FOCALIZABLES)]
  const primero = lista[0]
  const ultimo = lista[lista.length - 1]
  if (e.shiftKey && document.activeElement === primero) (e.preventDefault(), ultimo.focus())
  else if (!e.shiftKey && document.activeElement === ultimo) (e.preventDefault(), primero.focus())
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fundido">
      <div v-if="abierto" class="fixed inset-0 z-30 bg-black/40 print:hidden" aria-hidden="true" @click="emit('cerrar')" />
    </Transition>
    <Transition name="cajon">
      <aside
        v-if="abierto"
        id="menu-lateral"
        ref="panel"
        class="fixed inset-y-0 left-0 z-40 flex w-[min(20rem,85vw)] flex-col bg-white shadow-xl print:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Menú principal"
        @keydown="alTeclear"
      >
        <!-- Cabecera: marca y usuario -->
        <div class="bg-brand-800 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 text-white">
          <div class="flex items-start justify-between gap-2">
            <MarcaEmpresa class="text-left" />
            <button class="-mt-1 -mr-2 flex size-10 items-center justify-center rounded-full active:bg-white/10" aria-label="Cerrar menú" @click="emit('cerrar')">
              <X :size="22" aria-hidden="true" />
            </button>
          </div>
          <div class="mt-3 flex items-center gap-3">
            <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/20 text-base font-bold">{{ (usuario.nombre || usuario.usuario).charAt(0).toUpperCase() }}</span>
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold">{{ usuario.nombre }}</p>
              <p class="flex items-center gap-1.5 text-xs text-brand-100">
                @{{ usuario.usuario }}
                <span class="rounded-full bg-acento px-2 py-px text-[10px] font-bold text-acento-texto">{{ usuario.rol }}</span>
              </p>
            </div>
          </div>
        </div>

        <!-- Árbol de botones y subbotones -->
        <nav class="flex-1 overflow-y-auto overscroll-contain px-2 py-2" aria-label="Secciones">
          <ul class="grid gap-0.5">
            <ItemMenu v-for="n in arbol" :key="n.id" :nodo="n" :abiertos="abiertos" @elegir="(x) => emit('elegir', x)" @alternar="(id) => emit('alternar', id)" />
          </ul>
        </nav>

        <div class="border-t border-brand-100 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button class="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-brand-900 active:bg-brand-50" @click="emit('salir')">
            <LogOut :size="20" class="text-brand-600" aria-hidden="true" />
            Cerrar sesión
          </button>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>
