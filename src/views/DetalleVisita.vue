<script setup>
import { ref, computed } from 'vue'
import { ESTADOS_VISITA, TRANSICIONES_TECNICO, ESTADOS_CON_INFORME } from '../composables/useVisitas'
import { fechaLarga } from '../utils'
import EstadoBadge from '../components/EstadoBadge.vue'
import FotosVisita from '../components/FotosVisita.vue'
import { Navigation, Phone, Plus } from 'lucide-vue-next'

const props = defineProps({
  visita: { type: Object, required: true },
  informes: { type: Array, default: () => [] }, // informes vinculados a esta visita
  puedeGestionar: Boolean, // admin/superadmin: editar, eliminar y poner cualquier estado
  nombreDe: { type: Function, default: (u) => u },
})
const emit = defineEmits(['editar', 'eliminar', 'estado', 'crearInforme', 'abrirInforme'])

const mapa = computed(() => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(props.visita.direccion)}`)

// --- Acciones del técnico según el estado actual ---
const ETIQUETAS = { Aceptada: 'Aceptar visita', 'En curso': 'Iniciar visita', Realizada: 'Finalizar visita' }
const siguientes = computed(() => (TRANSICIONES_TECNICO[props.visita.estado] || []).filter((e) => e !== 'Cancelada'))
const puedeCancelar = computed(() => (TRANSICIONES_TECNICO[props.visita.estado] || []).includes('Cancelada'))
const textoCancelar = computed(() => (props.visita.estado === 'Programada' ? 'Rechazar visita' : 'Cancelar visita'))
const cerrada = computed(() => !TRANSICIONES_TECNICO[props.visita.estado])

const puedeInformar = computed(() => props.puedeGestionar || ESTADOS_CON_INFORME.includes(props.visita.estado))

// --- Cancelación con motivo obligatorio ---
const cancelando = ref(false)
const motivo = ref('')

function confirmarCancelacion() {
  emit('estado', { estado: 'Cancelada', motivo: motivo.value.trim() })
  cancelando.value = false
  motivo.value = ''
}

function cambiarSelect(e) {
  const estado = e.target.value
  if (estado === 'Cancelada') {
    cancelando.value = true
    e.target.value = props.visita.estado // se confirma después de indicar el motivo
  } else {
    emit('estado', { estado })
  }
}
</script>

<template>
  <article class="tarjeta grid gap-3">
    <div class="flex items-start justify-between gap-2">
      <h2 class="text-xl font-bold text-brand-900">{{ visita.cliente }}</h2>
      <EstadoBadge :estado="visita.estado" />
    </div>

    <p class="text-lg font-semibold text-brand-700 first-letter:uppercase">{{ fechaLarga(visita.fecha) }} · {{ visita.hora }}</p>

    <p v-if="visita.estado === 'Cancelada' && visita.motivo" class="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
      <b>Motivo de la cancelación:</b> {{ visita.motivo }}
    </p>

    <div v-if="visita.telefono || visita.direccion" class="grid grid-cols-2 gap-2">
      <a v-if="visita.telefono" :href="`tel:${visita.telefono}`" class="btn-acento min-h-11"><Phone :size="18" aria-hidden="true" />Llamar</a>
      <a v-if="visita.direccion" :href="mapa" target="_blank" rel="noopener" class="btn-borde min-h-11"><Navigation :size="18" aria-hidden="true" />Cómo llegar</a>
    </div>

    <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      <dt class="text-brand-700/70">Tipo</dt><dd>{{ visita.tipo }}</dd>
      <dt class="text-brand-700/70">Dirección</dt><dd>{{ visita.direccion || '—' }}</dd>
      <dt class="text-brand-700/70">Teléfono</dt><dd>{{ visita.telefono || '—' }}</dd>
      <dt class="text-brand-700/70">Técnico</dt><dd>{{ visita.responsable ? nombreDe(visita.responsable) : 'Sin asignar' }}</dd>
      <dt class="text-brand-700/70">Agendada por</dt><dd>{{ visita.autor }}</dd>
    </dl>

    <template v-if="visita.notas">
      <h3 class="font-semibold text-brand-800">Notas</h3>
      <p class="whitespace-pre-wrap">{{ visita.notas }}</p>
    </template>

    <!-- Estado: admin/superadmin eligen cualquiera; el técnico avanza paso a paso -->
    <section class="grid gap-2 border-t border-brand-100 pt-3">
      <template v-if="puedeGestionar">
        <label class="etiqueta">Cambiar estado
          <select class="campo" :value="visita.estado" @change="cambiarSelect">
            <option v-for="e in ESTADOS_VISITA" :key="e">{{ e }}</option>
          </select>
        </label>
      </template>

      <template v-else>
        <p v-if="visita.estado === 'Programada'" class="text-sm text-brand-700">Esta visita está pendiente de tu aceptación.</p>
        <p v-else-if="cerrada" class="text-sm text-brand-700/70">Visita cerrada. Si necesita reabrirse, contacta a un administrador.</p>
        <button v-for="e in siguientes" :key="e" class="btn min-h-12 flex-none" @click="$emit('estado', { estado: e })">{{ ETIQUETAS[e] }}</button>
        <button v-if="puedeCancelar && !cancelando" class="btn-peligro min-h-12 flex-none" @click="cancelando = true">{{ textoCancelar }}</button>
      </template>

      <form v-if="cancelando" class="grid gap-2 rounded-xl bg-red-50 p-3" @submit.prevent="confirmarCancelacion">
        <label class="etiqueta text-red-800">Motivo (obligatorio)
          <textarea v-model="motivo" rows="3" class="campo" required placeholder="Ej.: cliente no se encuentra, falta de materiales…" />
        </label>
        <div class="flex gap-2">
          <button type="button" class="btn-borde min-h-11" @click="cancelando = false">Volver</button>
          <button type="submit" class="btn-peligro min-h-11 bg-white" :disabled="!motivo.trim()">Confirmar</button>
        </div>
      </form>
    </section>

    <FotosVisita :visita-id="visita.id" :puede-subir="puedeInformar" />

    <section class="grid gap-2 border-t border-brand-100 pt-3">
      <h3 class="font-semibold text-brand-800">Informes de esta visita</h3>
      <button v-for="i in informes" :key="i.id" class="flex items-center justify-between gap-2 rounded-xl bg-brand-50 p-3 text-left" @click="$emit('abrirInforme', i.id)">
        <span class="font-medium text-brand-900">{{ i.titulo }}</span>
        <EstadoBadge :estado="i.estado" />
      </button>
      <p v-if="!informes.length" class="text-sm text-brand-700/70">Aún no hay informes.</p>
      <button v-if="puedeInformar" class="btn min-h-12 flex-none" @click="$emit('crearInforme')"><Plus :size="18" aria-hidden="true" />Crear informe de esta visita</button>
      <p v-else class="text-sm text-brand-700/70">Acepta la visita para poder crear su informe.</p>
    </section>

    <div v-if="puedeGestionar" class="mt-2 flex gap-2.5 sm:justify-end">
      <button class="btn-peligro" @click="$emit('eliminar')">Eliminar</button>
      <button class="btn-borde" @click="$emit('editar')">Editar</button>
    </div>
  </article>
</template>
