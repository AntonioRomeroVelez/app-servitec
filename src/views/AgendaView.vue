<script setup>
import { ref, computed } from 'vue'
import { hoy, manana, fechaLarga } from '../utils'
import EstadoBadge from '../components/EstadoBadge.vue'
import { CloudUpload, RefreshCw } from 'lucide-vue-next'

const props = defineProps({
  visitas: Array,
  cargando: Boolean,
  mostrarAutor: Boolean,
  hayAnteriores: Boolean, // hay visitas más antiguas que la ventana cargada
  cargandoMas: Boolean,
  nombreDe: { type: Function, default: (u) => u },
})
defineEmits(['abrir', 'refrescar', 'anteriores'])

const filtros = [
  { id: 'proximas', texto: 'Próximas' },
  { id: 'hoy', texto: 'Hoy' },
  { id: 'pasadas', texto: 'Pasadas' },
  { id: 'todas', texto: 'Todas' },
]
const filtro = ref('proximas')

// Agrupadas por día; las pasadas se muestran de la más reciente a la más antigua
const grupos = computed(() => {
  const h = hoy()
  let lista = props.visitas.filter(
    (v) => ({ hoy: v.fecha === h, proximas: v.fecha >= h, pasadas: v.fecha < h, todas: true })[filtro.value],
  )
  if (filtro.value === 'pasadas') lista = [...lista].reverse()
  const map = new Map()
  for (const v of lista) {
    if (!map.has(v.fecha)) map.set(v.fecha, [])
    map.get(v.fecha).push(v)
  }
  return [...map].map(([fecha, items]) => ({ fecha, items }))
})

function etiqueta(fecha) {
  const larga = fechaLarga(fecha)
  if (fecha === hoy()) return `Hoy · ${larga}`
  if (fecha === manana()) return `Mañana · ${larga}`
  return larga
}
</script>

<template>
  <div class="mb-3 flex items-center gap-2">
    <div class="grid min-w-0 flex-1 grid-cols-2 gap-1.5 sm:grid-cols-4" role="tablist">
      <button
        v-for="f in filtros"
        :key="f.id"
        class="min-h-10 min-w-0 truncate rounded-full px-3 text-sm font-semibold"
        :class="filtro === f.id ? 'bg-brand-600 text-white' : 'bg-white text-brand-700 border border-brand-200'"
        @click="filtro = f.id"
      >
        {{ f.texto }}
      </button>
    </div>
    <button class="min-h-10 min-w-10 rounded-xl border border-brand-200 bg-white flex items-center justify-center text-brand-700" aria-label="Recargar" @click="$emit('refrescar')">
      <RefreshCw :size="20" aria-hidden="true" />
    </button>
  </div>

  <p v-if="cargando && !visitas.length" class="py-10 text-center text-brand-700">Cargando…</p>
  <p v-else-if="!grupos.length" class="py-10 text-center text-brand-700/70">No hay visitas agendadas.</p>

  <section v-for="g in grupos" :key="g.fecha" class="mb-4">
    <h2 class="mb-1.5 text-sm font-bold text-brand-800 first-letter:uppercase">{{ etiqueta(g.fecha) }}</h2>
    <ul class="grid gap-2.5">
      <li v-for="v in g.items" :key="v.id">
        <button class="tarjeta flex w-full gap-3 text-left active:bg-brand-50" :class="{ 'opacity-60': v.estado === 'Cancelada' }" @click="$emit('abrir', v.id)">
          <span class="w-14 shrink-0 text-lg font-bold text-brand-700">{{ v.hora }}</span>
          <span class="grid min-w-0 flex-1 gap-0.5">
            <span class="flex items-start justify-between gap-2">
              <strong class="truncate text-brand-900">{{ v.cliente }}</strong>
              <span class="flex shrink-0 items-center gap-1.5">
                <span v-if="v._pendiente" class="flex items-center gap-1 text-xs font-semibold text-brand-700"><CloudUpload :size="14" aria-hidden="true" />Sin enviar</span>
                <EstadoBadge :estado="v.estado" />
              </span>
            </span>
            <span class="truncate text-sm text-brand-700">{{ v.tipo }}<template v-if="v.direccion"> · {{ v.direccion }}</template></span>
            <span v-if="v.responsable || mostrarAutor" class="text-sm text-brand-700/70">
              <template v-if="v.responsable">Técnico: {{ nombreDe(v.responsable) }}</template><template v-if="mostrarAutor"> · agendó {{ v.autor }}</template>
            </span>
          </span>
        </button>
      </li>
    </ul>
  </section>

  <div v-if="hayAnteriores && (filtro === 'pasadas' || filtro === 'todas')" class="mt-2 grid justify-items-center">
    <button class="btn-borde flex-none" :disabled="cargandoMas" @click="$emit('anteriores')">{{ cargandoMas ? 'Cargando…' : 'Cargar visitas anteriores' }}</button>
  </div>
</template>
