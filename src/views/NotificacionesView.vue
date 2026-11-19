<script setup>
import { onMounted } from 'vue'
import { Bell, BellRing, CalendarClock, CalendarPlus, CalendarX, ArrowRightLeft, ClipboardCheck, FileCheck, CheckCheck } from 'lucide-vue-next'
import { useNotificaciones } from '../composables/useNotificaciones'
import { tiempoRelativo } from '../utils'

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

onMounted(cargar)
</script>

<template>
  <div class="mb-3 flex items-center justify-between">
    <p class="text-sm text-brand-700">{{ noLeidas ? `${noLeidas} sin leer` : 'Todo al día' }}</p>
    <button v-if="noLeidas" class="btn-borde min-h-10 flex-none text-sm" @click="marcarTodas">
      <CheckCheck :size="16" aria-hidden="true" />
      Marcar todas como leídas
    </button>
  </div>

  <p v-if="cargando && !items.length" class="py-10 text-center text-brand-700">Cargando…</p>
  <p v-else-if="!items.length" class="py-10 text-center text-brand-700/70">No tienes notificaciones.</p>

  <ul class="grid gap-2.5">
    <li v-for="n in items" :key="n.id">
      <button class="tarjeta flex w-full gap-3 text-left active:bg-brand-50" :class="n.leida ? '' : 'border-brand-300 bg-brand-50'" @click="abrir(n)">
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
        <span v-if="!n.leida" class="mt-2 size-2.5 shrink-0 rounded-full bg-acento" aria-label="Sin leer" />
      </button>
    </li>
  </ul>
</template>
