<script setup>
import Cargando from './Cargando.vue'
import Vacio from './Vacio.vue'
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { CalendarDays, MessageCircle, Phone, UserRound, FileText } from 'lucide-vue-next'
import BarraFiltros from './BarraFiltros.vue'
import Paginador from './Paginador.vue'
import Dato from './Dato.vue'
import { call } from '../api'

// Mensajes preparados o fallidos. Con `visitaId` muestra solo los de esa visita (en su detalle), sin filtros.
const props = defineProps({ visitaId: { type: String, default: '' } })
const emit = defineEmits(['reenviar'])

const LIMITE = 15
const items = ref([])
const total = ref(0)
const offset = ref(0)
const q = ref('')
const estado = ref('')
const cargando = ref(true)
const error = ref('')
const abierto = ref(null)

async function cargar(desde = 0) {
  cargando.value = true
  error.value = ''
  try {
    const r = await call('whatsapp_envios_list', { visitaId: props.visitaId, q: q.value.trim(), estado: estado.value, limit: LIMITE, offset: desde })
    items.value = r.items
    total.value = r.total
    offset.value = desde
  } catch (e) {
    error.value = e.message
  } finally {
    cargando.value = false
  }
}
let temporizador
watch(q, () => {
  clearTimeout(temporizador)
  temporizador = setTimeout(cargar, 350)
})
watch(estado, () => cargar())
onBeforeUnmount(() => clearTimeout(temporizador))
onMounted(() => cargar())

// 27-11-2026 14:13
const cuando = (iso) => {
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return isNaN(d) ? iso : `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}
</script>

<template>
  <div class="grid gap-2">
    <BarraFiltros v-if="!visitaId" v-model="q" placeholder="Buscar cliente, teléfono o plantilla" recargar @refrescar="cargar()">
      <template #rapido>
        <select v-model="estado" class="campo !min-h-10 !w-auto !py-1.5 text-sm" aria-label="Estado">
          <option value="">Todos</option>
          <option value="Preparado">Preparados</option>
          <option value="Fallido">Fallidos</option>
        </select>
      </template>
    </BarraFiltros>

    <p v-if="error" class="aviso-error">{{ error }}</p>
    <Cargando v-else-if="cargando && !items.length" />
    <p v-else-if="!items.length && visitaId" class="text-sm text-brand-700/70">No hay mensajes registrados.</p>
    <Vacio v-else-if="!items.length" :icono="MessageCircle" texto="No hay mensajes registrados." />

    <ul class="grid gap-2.5" :class="visitaId ? '' : 'lg:grid-cols-[repeat(auto-fit,minmax(24rem,1fr))]'">
      <li v-for="e in items" :key="e.id" class="tarjeta grid content-start gap-1.5 border-l-4 !p-3" :class="e.estado === 'Fallido' ? 'border-l-red-400' : 'border-l-brand-300'">
        <div class="flex items-start justify-between gap-2">
          <strong class="min-w-0 text-sm text-brand-900 wrap-anywhere">{{ e.cliente }}</strong>
          <span class="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold" :class="e.estado === 'Fallido' ? 'bg-red-100 text-red-800' : 'bg-brand-100 text-brand-800'">{{ e.estado }}</span>
        </div>
        <Dato :icono="CalendarDays" etiqueta="Fecha">{{ cuando(e.creado) }}</Dato>
        <Dato :icono="Phone" etiqueta="Teléfono">{{ e.telefono || 'Sin teléfono' }}</Dato>
        <Dato :icono="FileText" etiqueta="Plantilla">{{ e.plantillaNombre }}</Dato>
        <Dato :icono="UserRound" etiqueta="Solicitado por">por {{ e.autor }}</Dato>
        <p v-if="e.error" class="text-sm text-red-700 wrap-anywhere">{{ e.error }}</p>
        <p v-if="abierto === e.id" class="rounded-xl bg-brand-50 p-2.5 text-sm whitespace-pre-wrap text-brand-950 wrap-anywhere">{{ e.mensaje }}</p>
        <div class="flex items-center justify-between gap-2">
          <button type="button" class="enlace" :aria-expanded="abierto === e.id" @click="abierto = abierto === e.id ? null : e.id">{{ abierto === e.id ? 'Ocultar mensaje' : 'Ver mensaje' }}</button>
          <button v-if="!visitaId" type="button" class="btn-borde min-h-10 flex-none text-sm" @click="emit('reenviar', e)"><MessageCircle :size="16" aria-hidden="true" />Reenviar</button>
        </div>
      </li>
    </ul>

    <Paginador v-if="total > LIMITE || !visitaId" :total="total" :offset="offset" :limite="LIMITE" :cargando="cargando" @ir="cargar" />
  </div>
</template>
