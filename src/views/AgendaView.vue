<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { hoy, manana, fechaLarga } from '../utils'
import { PERIODOS, paramsAgenda, periodoDe } from '../filtrosAgenda'
import EstadoBadge from '../components/EstadoBadge.vue'
import BarraFiltros from '../components/BarraFiltros.vue'
import Paginador from '../components/Paginador.vue'
import { CloudUpload } from 'lucide-vue-next'

// El período, la búsqueda y las páginas se resuelven en el servidor; aquí solo se muestran las visitas de la página actual.
const props = defineProps({
  visitas: Array,
  cargando: Boolean,
  mostrarAutor: Boolean,
  total: { type: Number, default: 0 },
  offset: { type: Number, default: 0 },
  limite: { type: Number, default: 15 },
  filtros: { type: Object, default: () => ({}) }, // filtros vigentes (para no perderlos al volver a esta pantalla)
  nombreDe: { type: Function, default: (u) => u },
})
const emit = defineEmits(['abrir', 'refrescar', 'buscar', 'pagina'])

const periodo = ref(periodoDe(props.filtros))
const q = ref(props.filtros.q ?? '')

let temporizador
watch([periodo, q], () => {
  clearTimeout(temporizador) // espera a que termine de escribir
  temporizador = setTimeout(() => emit('buscar', paramsAgenda(periodo.value, q.value.trim())), 300)
})
onBeforeUnmount(() => clearTimeout(temporizador))

// Agrupadas por día; las pasadas y "todas" se muestran de la más reciente a la más antigua
const grupos = computed(() => {
  const lista = periodo.value === 'pasadas' || periodo.value === 'todas' ? [...props.visitas].reverse() : props.visitas
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
  <BarraFiltros v-model="q" placeholder="Buscar cliente, dirección o tipo" recargar @refrescar="$emit('refrescar')">
    <template #rapido>
      <select v-model="periodo" class="campo !min-h-10 !w-auto !py-1.5 text-sm" aria-label="Período">
        <option v-for="p in PERIODOS" :key="p.id" :value="p.id">{{ p.texto }}</option>
      </select>
    </template>
  </BarraFiltros>

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

  <Paginador :total="total" :offset="offset" :limite="limite" :cargando="cargando" @ir="$emit('pagina', $event)" />
</template>
