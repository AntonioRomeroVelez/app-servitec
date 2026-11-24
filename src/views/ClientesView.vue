<script setup>
import { confirmar } from '../composables/useConfirmar'
import { ref, reactive, watch, onMounted, onBeforeUnmount } from 'vue'
import { CalendarPlus, ChevronDown, ChevronUp, MapPin, Pencil, Phone, Plus, Trash2, X } from 'lucide-vue-next'
import { call } from '../api'
import { useAuth } from '../composables/useAuth'
import { useClientes } from '../composables/useClientes'
import EstadoBadge from '../components/EstadoBadge.vue'
import BarraFiltros from '../components/BarraFiltros.vue'
import Paginador from '../components/Paginador.vue'
import Modal from '../components/Modal.vue'
import { fechaCorta } from '../utils'

// Catálogo de clientes. Se llena solo al registrar visitas (el cliente nuevo se registra al guardar la visita);
// aquí se pueden buscar, corregir sus datos, agendarles una visita y ver sus últimas visitas.
const emit = defineEmits(['agendar', 'abrirVisita'])
const props = defineProps({ solicitud: Object }) // desde el menú: { tipo: 'nuevo' } abre el formulario de alta
const { esSuper } = useAuth()
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

function abrirForm(c) {
  editando.value = c ? c.id : 'nuevo'
  Object.assign(form, { nombre: c?.nombre ?? '', direccion: c?.direccion ?? '', telefono: c?.telefono ?? '' })
}

watch(() => props.solicitud, (s) => s?.tipo === 'nuevo' && abrirForm(null), { immediate: true })

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
  <BarraFiltros v-model="q" placeholder="Buscar por nombre, teléfono o dirección">
    <template #acciones>
      <button class="btn-acento !min-h-10 !px-3 flex-none" aria-label="Nuevo cliente" @click="abrirForm(null)">
        <Plus :size="18" aria-hidden="true" />
        <span class="sr-only sm:not-sr-only">Nuevo</span>
      </button>
    </template>
  </BarraFiltros>

  <p v-if="C.error.value" class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ C.error.value }}</p>

  <Modal v-if="editando === 'nuevo'" titulo="Nuevo cliente" @cerrar="editando = null">
  <form class="grid gap-3" @submit.prevent="guardar">
    <label class="etiqueta">Nombre
      <input v-model.trim="form.nombre" class="campo" required maxlength="120" />
    </label>
    <label class="etiqueta">Dirección
      <input v-model.trim="form.direccion" class="campo" maxlength="200" />
    </label>
    <label class="etiqueta">Teléfono
      <input v-model.trim="form.telefono" type="tel" inputmode="tel" class="campo" maxlength="30" />
    </label>
    <button class="btn" :disabled="C.cargando.value">Registrar cliente</button>
  </form>
  </Modal>

  <p v-if="C.cargando.value && !C.items.value.length" class="py-10 text-center text-brand-700">Cargando…</p>
  <p v-else-if="!C.items.value.length" class="py-10 text-center text-brand-700/70">
    {{ q ? 'No hay clientes que coincidan.' : 'Aún no hay clientes. Se registran solos al agendar una visita.' }}
  </p>

  <ul class="grid gap-2.5">
    <li v-for="c in C.items.value" :key="c.id" class="tarjeta grid gap-2.5">
      <template v-if="editando !== c.id">
        <div class="min-w-0">
          <strong class="text-brand-900">{{ c.nombre }}</strong>
          <p v-if="c.telefono" class="flex items-center gap-1.5 text-sm text-brand-700"><Phone :size="14" class="shrink-0" aria-hidden="true" />{{ c.telefono }}</p>
          <p v-if="c.direccion" class="flex items-center gap-1.5 text-sm text-brand-700"><MapPin :size="14" class="shrink-0" aria-hidden="true" />{{ c.direccion }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="btn min-h-10 flex-none text-sm" @click="emit('agendar', c)">
            <CalendarPlus :size="16" aria-hidden="true" />
            Agendar visita
          </button>
          <button class="btn-borde min-h-10 text-sm" @click="abrirForm(c)">
            <Pencil :size="16" aria-hidden="true" />
            Editar
          </button>
          <button class="btn-borde min-h-10 text-sm" :aria-expanded="abierto === c.id" @click="alternarVisitas(c)">
            <ChevronUp v-if="abierto === c.id" :size="16" aria-hidden="true" />
            <ChevronDown v-else :size="16" aria-hidden="true" />
            Visitas
          </button>
          <button v-if="esSuper" class="btn-peligro min-h-10 text-sm" @click="eliminar(c)">
            <Trash2 :size="16" aria-hidden="true" />
            <span class="sr-only">Eliminar</span>
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
      </template>

      <form v-else class="grid gap-3" @submit.prevent="guardar">
        <label class="etiqueta">Nombre
          <input v-model.trim="form.nombre" class="campo" required maxlength="120" />
        </label>
        <label class="etiqueta">Dirección
          <input v-model.trim="form.direccion" class="campo" maxlength="200" />
        </label>
        <label class="etiqueta">Teléfono
          <input v-model.trim="form.telefono" type="tel" inputmode="tel" class="campo" maxlength="30" />
        </label>
        <p class="text-xs text-brand-700/80">Cambiar el nombre no modifica las visitas ya registradas.</p>
        <div class="flex gap-2">
          <button type="button" class="btn-borde min-h-11" @click="editando = null">Cancelar</button>
          <button class="btn min-h-11" :disabled="C.cargando.value">Guardar</button>
        </div>
      </form>
    </li>
  </ul>

  <Paginador :total="C.meta.value.total" :offset="C.parametros.value.offset || 0" :limite="C.limite" :cargando="C.cargando.value" @ir="C.irAPagina($event).catch(() => {})" />
</template>
