<script setup>
import BotonNuevo from '../components/BotonNuevo.vue'
import Cargando from '../components/Cargando.vue'
import Vacio from '../components/Vacio.vue'
import PieFormulario from '../components/PieFormulario.vue'
import { confirmar } from '../composables/useConfirmar'
import { ref, reactive, watch, onMounted, onBeforeUnmount } from 'vue'
import { Building2, CalendarPlus, History, MapPin, Pencil, Phone, Trash2 } from 'lucide-vue-next'
import { call } from '../api'
import Avatar from '../components/Avatar.vue'
import Dato from '../components/Dato.vue'
import { useAuth } from '../composables/useAuth'
import { useClientes } from '../composables/useClientes'
import EstadoBadge from '../components/EstadoBadge.vue'
import BarraFiltros from '../components/BarraFiltros.vue'
import Paginador from '../components/Paginador.vue'
import Modal from '../components/Modal.vue'
import { fechaCorta } from '../utils'
import { useSinGuardar } from '../composables/useSinGuardar'

// Catálogo de clientes. Se llena solo al registrar visitas (el cliente nuevo se registra al guardar la visita);
// aquí se pueden buscar, corregir sus datos, agendarles una visita y ver sus últimas visitas.
const emit = defineEmits(['agendar', 'abrirVisita'])
const props = defineProps({ solicitud: Object }) // desde el menú: { tipo: 'nuevo' } abre el formulario de alta
const { puedeAgendar } = useAuth()
const C = useClientes()

const q = ref(C.parametros.value.q ?? '')
let temporizador
watch(q, () => {
  clearTimeout(temporizador)
  temporizador = setTimeout(() => C.cargar({ q: q.value.trim() }).catch(() => {}), 350)
})
onBeforeUnmount(() => clearTimeout(temporizador))
onMounted(() => C.cargar({ q: q.value.trim() }).catch(() => {}))

// Formulario compartido: 'nuevo' = alta manual; un id = edición de ese cliente
const editando = ref(null)
const form = reactive({ nombre: '', direccion: '', telefono: '' })

let original = ''
function ponerForm(c) {
  editando.value = c ? c.id : 'nuevo'
  Object.assign(form, { nombre: c?.nombre ?? '', direccion: c?.direccion ?? '', telefono: c?.telefono ?? '' })
  original = JSON.stringify(form)
}
const salir = useSinGuardar(
  () => editando.value !== null && JSON.stringify(form) !== original,
  () => (editando.value = null),
)
const abrirForm = async (c) => (await salir()) && ponerForm(c)
const cerrarForm = async () => (await salir()) && (editando.value = null)

watch(() => props.solicitud, (s) => s?.tipo === 'nuevo' && ponerForm(null), { immediate: true }) // el menú ya preguntó

async function guardar() {
  try {
    if (editando.value === 'nuevo') await C.crear({ ...form })
    else await C.actualizar(editando.value, { ...form })
    editando.value = null
  } catch {
    /* el error se muestra arriba */
  }
}

async function eliminar(c) {
  if (!(await confirmar({ titulo: `¿Eliminar a "${c.nombre}"?`, texto: 'Solo se puede si no tiene visitas registradas.', confirmar: 'Eliminar', peligro: true }))) return
  C.eliminar(c.id).catch(() => {})
}

// Últimas visitas de un cliente (se piden al abrir la tarjeta)
const abierto = ref(null)
const visitas = reactive({})

async function alternarVisitas(c) {
  abierto.value = abierto.value === c.id ? null : c.id
  if (abierto.value && !visitas[c.id]) {
    try {
      visitas[c.id] = (await call('visitas_list', { clienteId: c.id, orden: 'desc', limit: 5 })).items
    } catch {
      visitas[c.id] = []
    }
  }
}
</script>

<template>
  <BarraFiltros v-model="q" placeholder="Buscar cliente" />

  <p v-if="C.error.value && editando === null" class="aviso-error mb-3">{{ C.error.value }}</p>

  <Modal v-if="editando !== null" :titulo="editando === 'nuevo' ? 'Nuevo cliente' : 'Editar cliente'" @cerrar="cerrarForm">
    <form @submit.prevent="guardar">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label class="etiqueta">Nombre
        <input v-model.trim="form.nombre" class="campo" required maxlength="120" />
      </label>
      <label class="etiqueta">Dirección
        <input v-model.trim="form.direccion" class="campo" maxlength="200" />
      </label>
      <label class="etiqueta">Teléfono
        <input v-model.trim="form.telefono" type="tel" inputmode="tel" class="campo" maxlength="30" />
      </label>
      </div>
      <p v-if="editando !== 'nuevo'" class="text-xs text-brand-700/80">Cambiar el nombre no modifica las visitas ya registradas.</p>
      <PieFormulario :texto="editando === 'nuevo' ? 'Registrar cliente' : 'Guardar cambios'" :cargando="C.cargando.value" :error="C.error.value || ''" @cancelar="cerrarForm" />
    </form>
  </Modal>

  <Cargando v-if="C.cargando.value && !C.items.value.length" />
  <Vacio v-else-if="!C.items.value.length" :icono="Building2" :texto="q ? 'No hay clientes que coincidan.' : 'Aún no hay clientes. Se registran solos al agendar una visita.'">
    <button v-if="q" type="button" class="btn-borde min-h-11 flex-none text-sm" @click="q = ''">Borrar búsqueda</button>
  </Vacio>

  <ul class="grid gap-2.5 lg:grid-cols-[repeat(auto-fit,minmax(24rem,1fr))]">
    <li v-for="c in C.items.value" :key="c.id" class="tarjeta grid gap-2.5">
        <div class="flex items-start gap-3">
          <Avatar :nombre="c.nombre" />
          <div class="grid min-w-0 flex-1 gap-1">
            <strong class="text-base leading-snug wrap-anywhere text-brand-900">{{ c.nombre }}</strong>
            <Dato v-if="c.telefono" :icono="Phone" etiqueta="Teléfono">{{ c.telefono }}</Dato>
            <Dato v-if="c.direccion" :icono="MapPin" etiqueta="Dirección" ajustar>{{ c.direccion }}</Dato>
            <p v-if="!c.telefono && !c.direccion" class="text-sm text-brand-700/60">Sin teléfono ni dirección registrados.</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn min-h-11 text-sm" @click="emit('agendar', c)">
            <CalendarPlus :size="16" aria-hidden="true" />
            Agendar visita
          </button>
          <button class="btn-icono sm:ml-auto" :class="{ 'bg-brand-100': abierto === c.id }" :aria-expanded="abierto === c.id" :aria-label="`Ver visitas de ${c.nombre}`" title="Ver visitas" @click="alternarVisitas(c)">
            <History :size="18" aria-hidden="true" />
          </button>
          <button class="btn-icono" :aria-label="`Editar ${c.nombre}`" title="Editar" @click="abrirForm(c)">
            <Pencil :size="18" aria-hidden="true" />
          </button>
          <button v-if="puedeAgendar" class="flex size-11 shrink-0 items-center justify-center rounded-xl text-red-700 active:bg-red-50" :aria-label="`Eliminar ${c.nombre}`" title="Eliminar" @click="eliminar(c)">
            <Trash2 :size="18" aria-hidden="true" />
          </button>
        </div>

        <ul v-if="abierto === c.id" class="grid gap-1.5 rounded-xl bg-brand-50 p-2.5">
          <li v-if="visitas[c.id] && !visitas[c.id].length" class="text-sm text-brand-700/70">Todavía no tiene visitas.</li>
          <li v-for="v in visitas[c.id] || []" :key="v.id">
            <button class="flex w-full items-center justify-between gap-2 text-left text-sm" @click="emit('abrirVisita', v.id)">
              <span class="text-brand-900">{{ fechaCorta(v.fecha) }} {{ v.hora }} · {{ v.tipo }}</span>
              <EstadoBadge :estado="v.estado" />
            </button>
          </li>
        </ul>
    </li>
  </ul>

  <BotonNuevo texto="Nuevo cliente" @click="abrirForm(null)" />
  <Paginador :total="C.meta.value.total" :offset="C.parametros.value.offset || 0" :limite="C.limite" :cargando="C.cargando.value" @ir="C.irAPagina($event).catch(() => {})" />
</template>
