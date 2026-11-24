<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { Bell, BellRing, CalendarClock, CalendarPlus, CalendarX, ArrowRightLeft, ClipboardCheck, FileCheck, CheckCheck } from 'lucide-vue-next'
import { useNotificaciones } from '../composables/useNotificaciones'
import { tiempoRelativo } from '../utils'
import Paginador from '../components/Paginador.vue'
import { usePaginaLocal } from '../composables/usePaginaLocal'

const emit = defineEmits(['abrir'])
const { items, noLeidas, cargando, cargar, marcar, marcarTodas } = useNotificaciones()

const ICONOS = {
  visita_asignada: CalendarPlus,
  visita_reprogramada: CalendarClock,
  visita_reasignada: ArrowRightLeft,
  visita_estado: ClipboardCheck,
  visita_cancelada: CalendarX,
  informe_finalizado: FileCheck,
  recordatorio: BellRing,
}

function abrir(n) {
  if (!n.leida) marcar([n.id])
  emit('abrir', n)
}

// Filtro único (todas / sin leer) y páginas en el dispositivo
const soloSinLeer = ref(false)
const mostradas = computed(() => (soloSinLeer.value ? items.value.filter((n) => !n.leida) : items.value))
const pag = usePaginaLocal(mostradas, 10)
watch(soloSinLeer, pag.volverAlInicio)

onMounted(cargar)
</script>

<template>
  <div class="mb-3 flex items-center justify-between gap-2">
    <div class="flex gap-1 rounded-full border border-brand-200 bg-white p-0.5 text-sm font-semibold" role="group" aria-label="Filtrar notificaciones">
      <button class="min-h-9 rounded-full px-3" :class="!soloSinLeer ? 'bg-brand-600 text-white' : 'text-brand-700'" @click="soloSinLeer = false">Todas</button>
      <button class="min-h-9 rounded-full px-3" :class="soloSinLeer ? 'bg-brand-600 text-white' : 'text-brand-700'" @click="soloSinLeer = true">Sin leer{{ noLeidas ? ` (${noLeidas})` : '' }}</button>
    </div>
    <button v-if="noLeidas" class="flex min-h-10 flex-none items-center gap-1.5 rounded-xl border border-brand-200 bg-white px-3 text-sm font-semibold text-brand-700" @click="marcarTodas">
      <CheckCheck :size="16" aria-hidden="true" />
      <span class="sr-only sm:not-sr-only">Marcar todas</span>
    </button>
  </div>

  <p v-if="cargando && !items.length" class="py-10 text-center text-brand-700">Cargando…</p>
  <p v-else-if="!mostradas.length" class="py-10 text-center text-brand-700/70">{{ soloSinLeer ? 'No tienes notificaciones sin leer.' : 'No tienes notificaciones.' }}</p>

  <ul class="grid gap-2.5">
    <li v-for="n in pag.visibles.value" :key="n.id">
      <button class="tarjeta flex w-full gap-3 border-l-4 text-left active:bg-brand-50" :class="n.leida ? 'border-l-brand-100' : 'border-l-acento bg-brand-50'" @click="abrir(n)">
        <span class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full" :class="n.leida ? 'bg-brand-100 text-brand-700' : 'bg-brand-600 text-white'">
          <component :is="ICONOS[n.tipo] || Bell" :size="18" aria-hidden="true" />
        </span>
        <span class="grid min-w-0 flex-1 gap-0.5">
          <span class="flex items-start justify-between gap-2">
            <strong class="text-brand-900">{{ n.titulo }}</strong>
            <span class="shrink-0 text-xs text-brand-700/70">{{ tiempoRelativo(n.creado) }}</span>
          </span>
          <span class="text-sm whitespace-pre-line text-brand-800">{{ n.mensaje }}</span>
        </span>
        <span v-if="!n.leida" class="mt-0.5 h-fit shrink-0 rounded-full bg-acento px-2 py-0.5 text-[11px] font-bold text-acento-texto">Nueva</span>
      </button>
    </li>
  </ul>

  <Paginador :total="pag.total.value" :offset="pag.offset.value" :limite="pag.limite" @ir="pag.ir" />
</template>
