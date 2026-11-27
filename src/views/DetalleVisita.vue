<script setup>
import Cargando from '../components/Cargando.vue'
import { ref, computed, watch } from 'vue'
import { ESTADOS_VISITA, TRANSICIONES_TECNICO, ESTADOS_CON_INFORME } from '../composables/useVisitas'
import { fechaLarga } from '../utils'
import { enlaceGoogleMaps } from '../mapa'
import EstadoBadge from '../components/EstadoBadge.vue'
import FotosVisita from '../components/FotosVisita.vue'
import HistorialWhatsapp from '../components/HistorialWhatsapp.vue'
import Dato from '../components/Dato.vue'
import { bordeDeEstado } from '../estados'
import { CalendarDays, CalendarPlus, MapPin, MapPinCheck, MessageCircle, Navigation, Pencil, Phone, Plus, Trash2, UserRound, Wrench } from 'lucide-vue-next'

const props = defineProps({
  visita: { type: Object, required: true },
  informes: { type: Array, default: () => [] }, // informes vinculados a esta visita
  cargandoInformes: Boolean,
  puedeGestionar: Boolean, // admin/superadmin: editar, eliminar y poner cualquier estado
  nombreDe: { type: Function, default: (u) => u },
  whatsapp: Boolean, // se puede enviar el mensaje de esta visita
  claveEnvios: { type: Number, default: 0 },
})
const emit = defineEmits(['editar', 'eliminar', 'estado', 'crearInforme', 'abrirInforme', 'whatsapp'])

const mapa = computed(() => enlaceGoogleMaps(props.visita)) // al punto marcado o, si no hay, buscando la dirección

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
// Si la visita cambia (otra visita u otro estado), el motivo a medio escribir ya no corresponde: se cierra el panel
watch(
  () => [props.visita.id, props.visita.estado],
  () => {
    cancelando.value = false
    motivo.value = ''
  },
)

function confirmarCancelacion() {
  emit('estado', { estado: 'Cancelada', motivo: motivo.value.trim() })
  cancelando.value = false
  motivo.value = ''
}

function cambiarSelect(e) {
  const estado = e.target.value
  e.target.value = props.visita.estado // la lista cambia solo cuando el cambio se confirma y se guarda
  if (estado === 'Cancelada') cancelando.value = true // se confirma después de indicar el motivo
  else emit('estado', { estado })
}
</script>

<template>
  <article class="tarjeta grid items-start gap-3 border-l-4 wrap-anywhere lg:grid-cols-2 lg:gap-8" :class="bordeDeEstado(visita.estado)">
    <div class="grid min-w-0 content-start gap-3">
    <div class="flex items-start justify-between gap-2">
      <h2 class="text-xl font-bold text-brand-900">{{ visita.cliente }}</h2>
      <EstadoBadge :estado="visita.estado" />
    </div>

    <p class="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-base font-semibold text-brand-800">
      <CalendarDays :size="20" class="shrink-0 text-brand-600" aria-hidden="true" />
      <span class="inline-block first-letter:uppercase">{{ fechaLarga(visita.fecha) }} · {{ visita.hora }}</span>
    </p>

    <p v-if="visita.estado === 'Cancelada' && visita.motivo" class="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
      <b>Motivo de la cancelación:</b> {{ visita.motivo }}
    </p>

    <div v-if="visita.telefono || mapa" class="grid grid-cols-2 gap-2">
      <a v-if="visita.telefono" :href="`tel:${visita.telefono}`" class="btn-borde min-h-11"><Phone :size="18" aria-hidden="true" />Llamar</a>
      <a v-if="mapa" :href="mapa" target="_blank" rel="noopener" class="btn-borde min-h-11"><Navigation :size="18" aria-hidden="true" />Cómo llegar</a>
    </div>

    <!-- Estado: admin/superadmin eligen cualquiera; el técnico avanza paso a paso -->
    <section class="grid gap-2">
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

    <div class="grid gap-2 rounded-xl border border-brand-100 p-3">
      <Dato :icono="Wrench" etiqueta="Tipo" ajustar>{{ visita.tipo }}</Dato>
      <Dato :icono="MapPin" etiqueta="Dirección" ajustar>{{ visita.direccion || 'Sin dirección' }}</Dato>
      <Dato v-if="visita.ubicacion" :icono="MapPinCheck" etiqueta="Mapa">Punto marcado en el mapa</Dato>
      <Dato :icono="Phone" etiqueta="Teléfono" ajustar>{{ visita.telefono || 'Sin teléfono' }}</Dato>
      <Dato :icono="UserRound" etiqueta="Responsable" ajustar>{{ visita.responsable ? nombreDe(visita.responsable) : 'Sin asignar' }}</Dato>
      <Dato :icono="CalendarPlus" etiqueta="Agendada por" ajustar>Agendada por {{ visita.autor }}</Dato>
    </div>

    <template v-if="visita.notas">
      <h3 class="font-semibold text-brand-800">Notas</h3>
      <p class="whitespace-pre-wrap">{{ visita.notas }}</p>
    </template>

      <div v-if="puedeGestionar" class="flex items-center justify-between gap-2 border-t border-brand-100 pt-3">
        <button type="button" class="btn-borde min-h-11 flex-none text-sm" @click="$emit('editar')"><Pencil :size="16" aria-hidden="true" />Editar visita</button>
        <button type="button" class="flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-red-700 active:bg-red-50" @click="$emit('eliminar')"><Trash2 :size="16" aria-hidden="true" />Eliminar</button>
      </div>
    </div>

    <div class="grid min-w-0 content-start gap-3">
    <FotosVisita :visita-id="visita.id" :puede-subir="puedeInformar" />

    <section class="grid gap-2 border-t border-brand-100 pt-3">
      <h3 class="font-semibold text-brand-800">Informes de esta visita</h3>
      <button v-for="i in informes" :key="i.id" class="flex items-center justify-between gap-2 rounded-xl border-l-4 bg-brand-50 p-3 text-left active:bg-brand-100" :class="bordeDeEstado(i.estado)" @click="$emit('abrirInforme', i.id)">
        <span class="font-medium text-brand-900">{{ i.titulo }}</span>
        <EstadoBadge :estado="i.estado" />
      </button>
      <Cargando v-if="cargandoInformes && !informes.length" class="!py-2 text-sm" texto="Cargando informes…" />
      <p v-else-if="!informes.length" class="text-sm text-brand-700/70">Aún no hay informes.</p>
      <button v-if="puedeInformar" class="btn min-h-12 flex-none sm:justify-self-start" @click="$emit('crearInforme')"><Plus :size="18" aria-hidden="true" />Crear informe de esta visita</button>
      <p v-else class="text-sm text-brand-700/70">Acepta la visita para poder crear su informe.</p>
    </section>

    <section v-if="puedeGestionar" class="grid gap-2 border-t border-brand-100 pt-3">
      <h3 class="font-semibold text-brand-800">Mensajes de WhatsApp</h3>
      <HistorialWhatsapp :key="`${visita.id}-${claveEnvios}`" :visita-id="visita.id" />
      <button v-if="whatsapp && !visita._pendiente" type="button" class="btn-borde min-h-12 flex-none sm:justify-self-start" @click="$emit('whatsapp')"><MessageCircle :size="18" aria-hidden="true" />Enviar por WhatsApp</button>
    </section>

    </div>
  </article>
</template>
