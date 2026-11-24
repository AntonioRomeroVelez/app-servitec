<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import { ESTADOS } from '../composables/useInformes'
import EstadoBadge from '../components/EstadoBadge.vue'
import BarraFiltros from '../components/BarraFiltros.vue'
import Paginador from '../components/Paginador.vue'
import Dato from '../components/Dato.vue'
import { bordeDeEstado } from '../estados'
import { Building2, CalendarDays, CloudUpload, Tag, UserRound } from 'lucide-vue-next'
import { fechaCorta } from '../utils'

// La búsqueda, el filtro y las páginas se resuelven en el servidor
const props = defineProps({
  informes: Array,
  cargando: Boolean,
  mostrarAutor: Boolean,
  total: { type: Number, default: 0 },
  offset: { type: Number, default: 0 },
  limite: { type: Number, default: 15 },
  filtros: { type: Object, default: () => ({}) }, // filtros vigentes (para no perderlos al volver a esta pantalla)
})
const emit = defineEmits(['abrir', 'refrescar', 'buscar', 'pagina'])

const q = ref(props.filtros.q ?? '')
const estado = ref(props.filtros.estado ?? '')

let temporizador
watch([q, estado], () => {
  clearTimeout(temporizador) // espera a que termine de escribir
  temporizador = setTimeout(() => emit('buscar', { q: q.value.trim(), estado: estado.value }), 350)
})
onBeforeUnmount(() => clearTimeout(temporizador))
</script>

<template>
  <BarraFiltros v-model="q" placeholder="Buscar título, cliente, número o responsable" recargar @refrescar="$emit('refrescar')">
    <template #rapido>
      <select v-model="estado" class="campo !min-h-10 !w-auto !py-1.5 text-sm" aria-label="Filtrar por estado">
        <option value="">Todos</option>
        <option v-for="e in ESTADOS" :key="e" :value="e">{{ e }}</option>
      </select>
    </template>
  </BarraFiltros>

  <p v-if="cargando && !informes.length" class="py-10 text-center text-brand-700">Cargando…</p>
  <p v-else-if="!informes.length" class="py-10 text-center text-brand-700/70">No hay informes.</p>

  <ul class="grid gap-2.5">
    <li v-for="i in informes" :key="i.id">
      <button class="tarjeta grid w-full gap-1.5 border-l-4 text-left active:bg-brand-50" :class="bordeDeEstado(i.estado)" @click="$emit('abrir', i.id)">
        <span class="flex items-center justify-between gap-2">
          <span class="rounded-md bg-brand-50 px-2 py-0.5 font-mono text-xs font-semibold text-brand-700">{{ i.numero || 'Sin número aún' }}</span>
          <span class="flex shrink-0 items-center gap-1.5">
            <span v-if="i._pendiente" class="flex items-center gap-1 text-xs font-semibold text-brand-700"><CloudUpload :size="14" aria-hidden="true" />Sin enviar</span>
            <EstadoBadge :estado="i.estado" />
          </span>
        </span>
        <strong class="text-base leading-snug break-words text-brand-900">{{ i.titulo }}</strong>
        <span class="grid gap-1 sm:grid-cols-2">
          <Dato :icono="Building2" etiqueta="Cliente">{{ i.cliente }}</Dato>
          <Dato :icono="Tag" etiqueta="Tipo">{{ i.tipo }}</Dato>
          <Dato :icono="CalendarDays" etiqueta="Fecha">{{ fechaCorta(i.fecha) }}</Dato>
          <Dato v-if="i.responsable || mostrarAutor" :icono="UserRound" etiqueta="Responsable">{{ i.responsable }}<template v-if="i.responsable && mostrarAutor"> · </template><template v-if="mostrarAutor">por {{ i.autor }}</template></Dato>
        </span>
      </button>
    </li>
  </ul>

  <Paginador :total="total" :offset="offset" :limite="limite" :cargando="cargando" @ir="$emit('pagina', $event)" />
</template>
