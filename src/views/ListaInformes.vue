<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import { ESTADOS } from '../composables/useInformes'
import EstadoBadge from '../components/EstadoBadge.vue'
import { CloudUpload, RefreshCw } from 'lucide-vue-next'
import { fechaCorta } from '../utils'

// La búsqueda y el filtro se resuelven en el servidor y la lista llega paginada
const props = defineProps({
  informes: Array,
  cargando: Boolean,
  mostrarAutor: Boolean,
  hayMas: Boolean,
  total: { type: Number, default: 0 },
  filtros: { type: Object, default: () => ({}) }, // filtros vigentes (para no perderlos al volver a esta pantalla)
})
const emit = defineEmits(['abrir', 'refrescar', 'buscar', 'mas'])

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
  <div class="mb-3 grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_11rem_auto]">
    <input v-model="q" type="search" class="campo col-span-2 sm:col-span-1" placeholder="Buscar título, cliente, número o responsable" />
    <select v-model="estado" class="campo" aria-label="Filtrar por estado">
      <option value="">Todos</option>
      <option v-for="e in ESTADOS" :key="e" :value="e">{{ e }}</option>
    </select>
    <button class="min-h-11 min-w-11 rounded-xl border border-brand-200 bg-white flex items-center justify-center text-brand-700" aria-label="Recargar" @click="$emit('refrescar')">
      <RefreshCw :size="20" aria-hidden="true" />
    </button>
  </div>

  <p v-if="cargando && !informes.length" class="py-10 text-center text-brand-700">Cargando…</p>
  <p v-else-if="!informes.length" class="py-10 text-center text-brand-700/70">No hay informes.</p>

  <ul class="grid gap-2.5">
    <li v-for="i in informes" :key="i.id">
      <button class="tarjeta grid w-full gap-1 text-left active:bg-brand-50" @click="$emit('abrir', i.id)">
        <span class="flex items-start justify-between gap-2">
          <strong class="text-brand-900">{{ i.titulo }}</strong>
          <span class="flex shrink-0 items-center gap-1.5">
            <span v-if="i._pendiente" class="flex items-center gap-1 text-xs font-semibold text-brand-700"><CloudUpload :size="14" aria-hidden="true" />Sin enviar</span>
            <EstadoBadge :estado="i.estado" />
          </span>
        </span>
        <span class="text-sm text-brand-700">{{ i.numero || 'Sin número aún' }} · {{ i.cliente }} · {{ i.tipo }}</span>
        <span class="text-sm text-brand-700/70">
          {{ fechaCorta(i.fecha) }}<template v-if="i.responsable"> · {{ i.responsable }}</template><template v-if="mostrarAutor"> · por {{ i.autor }}</template>
        </span>
      </button>
    </li>
  </ul>

  <div v-if="informes.length" class="mt-4 grid justify-items-center gap-2">
    <p class="text-sm text-brand-700/70">Mostrando {{ informes.length }} de {{ Math.max(total, informes.length) }}</p>
    <button v-if="hayMas" class="btn-borde flex-none" :disabled="cargando" @click="$emit('mas')">{{ cargando ? 'Cargando…' : 'Cargar más' }}</button>
  </div>
</template>
