<script setup>
import { reactive, ref, computed, watch, onBeforeUnmount } from 'vue'
import { BadgeCheck, UserPlus } from 'lucide-vue-next'
import { call } from '../api'
import { useConfiguracion } from '../composables/useConfiguracion'
import { ESTADOS_VISITA } from '../composables/useVisitas'
import { hoy, normalizar } from '../utils'

// `inicial` = edición de una visita; `prefill` = datos de un cliente registrado al agendar desde la pantalla Clientes
const props = defineProps({ inicial: Object, prefill: Object, cargando: Boolean, tecnicos: { type: Array, default: () => [] } })
const emit = defineEmits(['guardar', 'cancelar'])

const { nombresTipos } = useConfiguracion()

const form = reactive({
  fecha: props.inicial?.fecha ?? hoy(),
  hora: props.inicial?.hora ?? '09:00',
  cliente: props.inicial?.cliente ?? props.prefill?.cliente ?? '',
  direccion: props.inicial?.direccion ?? props.prefill?.direccion ?? '',
  telefono: props.inicial?.telefono ?? props.prefill?.telefono ?? '',
  tipo: props.inicial?.tipo ?? nombresTipos.value[0],
  responsable: props.inicial?.responsable ?? '',
  estado: props.inicial?.estado ?? ESTADOS_VISITA[0],
  notas: props.inicial?.notas ?? '',
})

// Clientes ya registrados que coinciden con lo que se escribe (se buscan en el servidor mientras se escribe)
const sugerencias = ref([])
const buscado = ref('') // texto con el que se obtuvieron las sugerencias
let temporizador

watch(
  () => form.cliente,
  (texto) => {
    clearTimeout(temporizador)
    if (texto.trim().length < 2) {
      sugerencias.value = []
      buscado.value = ''
      return
    }
    temporizador = setTimeout(async () => {
      try {
        sugerencias.value = (await call('clientes_list', { q: texto.trim(), limit: 8 })).items
        buscado.value = texto
      } catch {
        sugerencias.value = [] // sin conexión o sin datos guardados: se escribe a mano
        buscado.value = ''
      }
    }, 250)
  },
  { immediate: true },
)
onBeforeUnmount(() => clearTimeout(temporizador))

// Si el tipo de la visita ya no está en la lista (el superadmin lo quitó), se conserva como opción para no perderlo
const opcionesTipo = computed(() => (form.tipo && !nombresTipos.value.includes(form.tipo) ? [...nombresTipos.value, form.tipo] : nombresTipos.value))

const registrado = computed(() => sugerencias.value.find((c) => normalizar(c.nombre) === normalizar(form.cliente)))

// Estado del cliente escrito: ya registrado / nuevo (se registra al guardar). Vacío mientras no se sepa.
const estadoCliente = computed(() => {
  if (!form.cliente.trim() || buscado.value !== form.cliente) return ''
  return registrado.value ? 'existente' : 'nuevo'
})

// Al elegir un cliente registrado se completan la dirección y el teléfono que estén vacíos
function alEscribirCliente() {
  const c = registrado.value
  if (!c) return
  if (!form.direccion) form.direccion = c.direccion
  if (!form.telefono) form.telefono = c.telefono
}
</script>

<template>
  <form class="grid gap-3.5" @submit.prevent="emit('guardar', { ...form })">
    <label class="etiqueta">Cliente
      <input v-model.trim="form.cliente" class="campo" required maxlength="120" list="clientes-sugeridos" autocomplete="off" @input="alEscribirCliente" />
      <datalist id="clientes-sugeridos">
        <option v-for="c in sugerencias" :key="c.id" :value="c.nombre">{{ c.direccion }}</option>
      </datalist>
      <span v-if="estadoCliente === 'existente'" class="flex items-center gap-1.5 text-xs font-normal text-emerald-700">
        <BadgeCheck :size="14" aria-hidden="true" />
        Cliente registrado
      </span>
      <span v-else-if="estadoCliente === 'nuevo'" class="flex items-center gap-1.5 text-xs font-normal text-brand-700">
        <UserPlus :size="14" aria-hidden="true" />
        Cliente nuevo: se registrará al guardar la visita
      </span>
    </label>
    <div class="grid grid-cols-2 gap-3.5">
      <label class="etiqueta">Fecha
        <input v-model="form.fecha" type="date" class="campo" required />
      </label>
      <label class="etiqueta">Hora
        <input v-model="form.hora" type="time" class="campo" required />
      </label>
    </div>
    <label class="etiqueta">Dirección
      <input v-model.trim="form.direccion" class="campo" autocomplete="street-address" />
    </label>
    <label class="etiqueta">Teléfono
      <input v-model.trim="form.telefono" type="tel" inputmode="tel" class="campo" />
    </label>
    <div class="grid gap-3.5 sm:grid-cols-2">
      <label class="etiqueta">Tipo de visita
        <select v-model="form.tipo" class="campo">
          <option v-for="t in opcionesTipo" :key="t">{{ t }}</option>
        </select>
      </label>
      <label class="etiqueta">Técnico asignado
        <select v-model="form.responsable" class="campo">
          <option value="">Sin asignar</option>
          <option v-for="t in tecnicos" :key="t.usuario" :value="t.usuario">{{ t.nombre }}</option>
          <!-- valor previo que ya no es un técnico activo, para no perderlo al editar -->
          <option v-if="form.responsable && !tecnicos.some((t) => t.usuario === form.responsable)" :value="form.responsable">{{ form.responsable }}</option>
        </select>
      </label>
    </div>
    <label v-if="inicial" class="etiqueta">Estado
      <select v-model="form.estado" class="campo">
        <option v-for="e in ESTADOS_VISITA" :key="e">{{ e }}</option>
      </select>
    </label>
    <label class="etiqueta">Notas
      <textarea v-model="form.notas" rows="4" class="campo" placeholder="Motivo, accesos, materiales a llevar…" />
    </label>

    <div class="mt-2 flex gap-2.5 sm:justify-end">
      <button type="button" class="btn-borde" @click="emit('cancelar')">Cancelar</button>
      <button type="submit" class="btn" :disabled="cargando">{{ cargando ? 'Guardando…' : 'Guardar' }}</button>
    </div>
  </form>
</template>
