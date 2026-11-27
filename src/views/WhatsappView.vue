<script setup>
import Cargando from '../components/Cargando.vue'
import { ref, reactive, computed, onMounted, nextTick } from 'vue'
import { Check, CircleCheck, Copy, Eye, Pencil, Plus, Power, RotateCcw, Save, Trash2 } from 'lucide-vue-next'
import { call } from '../api'
import { useAuth } from '../composables/useAuth'
import { useConfiguracion } from '../composables/useConfiguracion'
import { useToast } from '../composables/useToast'
import { confirmar } from '../composables/useConfirmar'
import { useSinGuardar } from '../composables/useSinGuardar'
import { clonar } from '../configuracion'
import { ID_FABRICA, PLANTILLA_FABRICA, formatearFecha, formatearHora, renderizar, textoTipo, valoresDeEjemplo } from '../whatsapp'
import Modal from '../components/Modal.vue'
import EditorPlantilla from '../components/EditorPlantilla.vue'
import HistorialWhatsapp from '../components/HistorialWhatsapp.vue'
import VistaPreviaWhatsapp from '../components/VistaPreviaWhatsapp.vue'

// Se elige un mensaje de la lista y se ve tal como lo recibe el cliente. El superadministrador además lo cambia y ajusta
// el envío; el administrador lo consulta y ve el historial. Si el servidor no entrega las plantillas (sin permiso, sin
// conexión o un script anterior), se muestra la de fábrica solo para verla.
const props = defineProps({ claveEnvios: { type: Number, default: 0 } })
const emit = defineEmits(['reenviar'])
const { esSuper } = useAuth()
const C = useConfiguracion()
const toast = useToast()

// En modo solo lectura (`fallo`) las demás pestañas no se ofrecen: guardar o consultar daría error
const pestanas = computed(() => {
  const mensajes = { id: 'mensajes', texto: 'Mensajes' }
  if (fallo.value) return [mensajes]
  return esSuper.value ? [mensajes, { id: 'general', texto: 'Ajustes de envío' }] : [mensajes, { id: 'historial', texto: 'Historial' }]
})
const pestana = ref('mensajes')

// ---------- Mensajes ----------
const DE_FABRICA = { id: ID_FABRICA, nombre: 'Confirmación de cita (de fábrica)', tipo: 'confirmacion', activa: true, predeterminada: true, mensaje: PLANTILLA_FABRICA, fabrica: true }
const plantillas = ref([])
const cargando = ref(true)
const fallo = ref(null) // { texto } cuando no se pudieron traer las plantillas de la empresa
const seleccionId = ref('')
const editando = ref(null) // { id?, nombre, tipo, mensaje, activa, predeterminada }
const editor = ref(null)
const guardando = ref(false)
const panel = ref(null)

const puedeEditar = computed(() => esSuper.value && !fallo.value)
const elegida = computed(
  () => plantillas.value.find((p) => p.id === seleccionId.value) || plantillas.value.find((p) => p.tipo === 'confirmacion' && p.predeterminada) || plantillas.value[0],
)
const vista = computed(() => (elegida.value ? renderizar(elegida.value.mensaje, valoresDeEjemplo(C.config.value)) : ''))

async function cargar() {
  cargando.value = true
  try {
    plantillas.value = await call('whatsapp_plantillas_list')
    fallo.value = null
  } catch (e) {
    // Un script anterior al módulo responde "Sin permisos" o "Acción inválida"
    const anterior = e.code === 'FORBIDDEN' || e.message === 'Acción inválida'
    fallo.value = {
      texto: anterior
        ? 'El servidor todavía no tiene las funciones de WhatsApp. Pega el Code.gs nuevo en Apps Script y crea una nueva versión de la implementación.'
        : `No se pudieron cargar los mensajes de tu empresa: ${e.message}`,
    }
    plantillas.value = [DE_FABRICA]
  } finally {
    cargando.value = false
  }
}
onMounted(cargar)

function elegir(p) {
  seleccionId.value = p.id
  // En el celular la vista previa queda debajo de la lista
  if (window.innerWidth < 1024) nextTick(() => panel.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}

async function ejecutar(accion, exito) {
  guardando.value = true
  try {
    const r = await accion()
    await cargar()
    toast.exito(exito)
    return r || true
  } catch (e) {
    toast.error(e.message)
    return false
  } finally {
    guardando.value = false
  }
}

const nueva = () => (editando.value = { nombre: '', tipo: 'confirmacion', mensaje: '', activa: true, predeterminada: false })
const duplicar = (p) => (editando.value = { nombre: `Copia de ${p.nombre}`.slice(0, 60), tipo: p.tipo, mensaje: p.mensaje, activa: true, predeterminada: false })
// La de fábrica no se modifica: "cambiar el texto" crea la propia, ya marcada para usarse
const personalizar = (p) => (editando.value = p.fabrica ? { nombre: 'Confirmación de cita', tipo: p.tipo, mensaje: p.mensaje, activa: true, predeterminada: true } : { ...p })

async function guardar(data) {
  const { id } = editando.value
  const r = await ejecutar(() => call(id ? 'whatsapp_plantillas_update' : 'whatsapp_plantillas_create', id ? { id, data } : { data }), 'Mensaje guardado.')
  if (!r) return
  seleccionId.value = r.id
  editando.value = null
}

async function alternar(p) {
  if (p.activa && !(await confirmar({ titulo: `¿Desactivar "${p.nombre}"?`, texto: 'Los administradores dejarán de poder usarlo.', confirmar: 'Desactivar', peligro: true }))) return
  if (!p.activa && !(await confirmar({ titulo: `¿Activar "${p.nombre}"?`, texto: 'Los administradores podrán usarlo.', confirmar: 'Activar' }))) return
  ejecutar(() => call('whatsapp_plantillas_update', { id: p.id, data: { activa: !p.activa } }), p.activa ? 'Mensaje desactivado.' : 'Mensaje activado.')
}

async function usar(p) {
  if (!(await confirmar({ titulo: `¿Usar "${p.nombre}"?`, texto: `Será el mensaje que se proponga para: ${textoTipo(p.tipo)}.`, confirmar: 'Usar' }))) return
  // Volver al de fábrica = quitar la marca al propio
  const actual = plantillas.value.find((x) => x.tipo === p.tipo && x.predeterminada && x.id !== ID_FABRICA)
  ejecutar(() => call('whatsapp_plantillas_update', p.fabrica ? { id: actual.id, data: { predeterminada: false } } : { id: p.id, data: { predeterminada: true } }), 'Listo: ahora se usa este mensaje.')
}

async function eliminar(p) {
  if (!(await confirmar({ titulo: `¿Eliminar "${p.nombre}"?`, texto: 'El historial de envíos se conserva. Esta acción no se puede deshacer.', confirmar: 'Eliminar', peligro: true }))) return
  ejecutar(() => call('whatsapp_plantillas_delete', { id: p.id }), 'Mensaje eliminado.')
}

// ---------- Ajustes de envío (sección "whatsapp" de los ajustes) ----------
const form = reactive({})
const copiar = () => Object.assign(form, clonar(C.config.value.whatsapp))
copiar()
const guardada = computed(() => JSON.stringify(C.config.value.whatsapp))
const cambiado = () => JSON.stringify({ ...form }) !== guardada.value
useSinGuardar(() => esSuper.value && cambiado(), copiar)
defineExpose({ cambiado: () => esSuper.value && cambiado() }) // Ajustes marca la sección con cambios sin guardar

async function guardarAjustes() {
  guardando.value = true
  try {
    await C.guardar('whatsapp', clonar(form))
    copiar()
    toast.exito('Cambios guardados.')
  } catch (e) {
    toast.error(e.message)
  } finally {
    guardando.value = false
  }
}
async function restablecer() {
  if (!(await confirmar({ titulo: '¿Volver a los valores de fábrica de WhatsApp?', texto: 'Se restablecen los ajustes de envío. Los mensajes no cambian.', confirmar: 'Restablecer', peligro: true }))) return
  try {
    await C.restablecer('whatsapp')
    copiar()
    toast.exito('Se restablecieron los valores de fábrica.')
  } catch (e) {
    toast.error(e.message)
  }
}
</script>

<template>
  <div class="grid gap-3">
    <div v-if="pestanas.length > 1" class="flex flex-wrap gap-1.5" role="tablist" aria-label="Secciones de WhatsApp">
      <button v-for="t in pestanas" :key="t.id" type="button" role="tab" :aria-selected="pestana === t.id" class="min-h-11 shrink-0 rounded-xl border px-4 text-sm font-semibold" :class="pestana === t.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-brand-200 bg-white text-brand-700'" @click="pestana = t.id">{{ t.texto }}</button>
    </div>

    <!-- Mensajes: lista a la izquierda, cómo lo recibe el cliente a la derecha -->
    <template v-if="pestana === 'mensajes'">
      <div v-if="fallo" class="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900" role="status">
        <Eye :size="18" class="mt-0.5 shrink-0" aria-hidden="true" />
        <div class="grid min-w-0 gap-1">
          <p><b>Solo puedes ver el mensaje de fábrica.</b> {{ fallo.texto }}</p>
          <button type="button" class="enlace justify-self-start" @click="cargar">Volver a intentar</button>
        </div>
      </div>

      <Cargando v-if="cargando && !plantillas.length" />
      <div v-else class="grid items-start gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <section class="grid gap-2" aria-labelledby="wa-lista">
          <h2 id="wa-lista" class="font-semibold text-brand-900">1. Elige un mensaje</h2>
          <ul class="grid gap-2">
            <li v-for="p in plantillas" :key="p.id">
              <button type="button" class="grid w-full gap-1.5 rounded-xl border-2 bg-white p-3 text-left" :class="elegida?.id === p.id ? 'border-brand-600 shadow-sm' : 'border-brand-100'" :aria-pressed="elegida?.id === p.id" @click="elegir(p)">
                <strong class="text-sm leading-snug text-brand-900 wrap-anywhere">{{ p.nombre }}</strong>
                <span class="flex flex-wrap gap-1.5 text-xs font-semibold">
                  <span v-if="p.predeterminada" class="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-emerald-800"><CircleCheck :size="12" aria-hidden="true" />En uso</span>
                  <span class="rounded-full bg-brand-100 px-2.5 py-0.5 text-brand-800">{{ textoTipo(p.tipo) }}</span>
                  <span v-if="!p.activa" class="rounded-full bg-red-100 px-2.5 py-0.5 text-red-800">Desactivado</span>
                </span>
              </button>
            </li>
          </ul>
          <button v-if="puedeEditar" type="button" class="flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-300 font-semibold text-brand-700 active:bg-brand-100" @click="nueva"><Plus :size="18" aria-hidden="true" />Crear un mensaje nuevo</button>
        </section>

        <section v-if="elegida" ref="panel" class="tarjeta grid scroll-mt-16 gap-3" aria-labelledby="wa-vista">
          <div class="grid gap-1">
            <h2 id="wa-vista" class="font-semibold text-brand-900">2. Así lo recibe el cliente</h2>
            <p class="text-sm text-brand-700">
              <template v-if="elegida.predeterminada">Es el mensaje que se propone al enviar: {{ textoTipo(elegida.tipo).toLowerCase() }}.</template>
              <template v-else-if="elegida.activa">Se puede elegir al enviar, pero no es el que se propone.</template>
              <template v-else>Está desactivado: no se puede usar para enviar.</template>
              Los datos son de ejemplo; al enviar se usan los de cada visita.
            </p>
          </div>

          <div v-if="puedeEditar" class="flex flex-wrap gap-2">
            <button type="button" class="btn min-h-11 text-sm" @click="personalizar(elegida)"><Pencil :size="16" aria-hidden="true" />{{ elegida.fabrica ? 'Personalizar mensaje' : 'Editar mensaje' }}</button>
            <button v-if="elegida.activa && !elegida.predeterminada" type="button" class="btn-borde min-h-11 text-sm" @click="usar(elegida)"><Check :size="16" aria-hidden="true" />Usar este mensaje</button>
            <button v-if="!elegida.fabrica" type="button" class="btn-borde min-h-11 text-sm" @click="duplicar(elegida)"><Copy :size="16" aria-hidden="true" />Duplicar</button>
            <button v-if="!elegida.fabrica" type="button" class="btn-borde min-h-11 text-sm" @click="alternar(elegida)"><Power :size="16" aria-hidden="true" />{{ elegida.activa ? 'Desactivar' : 'Activar' }}</button>
            <button v-if="!elegida.fabrica" type="button" class="btn-peligro min-h-11 text-sm" @click="eliminar(elegida)"><Trash2 :size="16" aria-hidden="true" />Eliminar</button>
          </div>
          <p v-else-if="!esSuper" class="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">Solo para consulta: los mensajes los cambia el superadministrador de la empresa.</p>

          <VistaPreviaWhatsapp :mensaje="vista" :nombre="C.config.value.empresa.nombre" />
        </section>
      </div>
    </template>

    <HistorialWhatsapp v-else-if="pestana === 'historial'" :key="props.claveEnvios" @reenviar="(e) => emit('reenviar', e)" />

    <!-- Ajustes de envío -->
    <form v-else class="tarjeta grid gap-4" @submit.prevent="guardarAjustes">
        <label class="flex min-h-11 items-center gap-2.5 text-sm font-semibold text-brand-900">
          <input v-model="form.activo" type="checkbox" class="size-5 accent-brand-600" />
          Permitir enviar mensajes de WhatsApp
        </label>
        <div class="grid gap-3 sm:grid-cols-3">
          <label class="etiqueta">Código de país
            <input v-model="form.codigoPais" class="campo" inputmode="numeric" maxlength="4" required />
          </label>
          <label class="etiqueta">Cómo se escribe la fecha
            <select v-model="form.formatoFecha" class="campo">
              <option value="corta">{{ formatearFecha('2026-11-27', 'corta') }}</option>
              <option value="larga">{{ formatearFecha('2026-11-27', 'larga') }}</option>
            </select>
          </label>
          <label class="etiqueta">Cómo se escribe la hora
            <select v-model="form.formatoHora" class="campo">
              <option value="24">{{ formatearHora('14:30', '24') }}</option>
              <option value="12">{{ formatearHora('14:30', '12') }}</option>
            </select>
          </label>
        </div>
        <p class="text-sm text-brand-700">El mensaje se abre en el WhatsApp de quien envía, que pulsa enviar. Por eso el historial dice «Preparado» y no «Enviado».</p>

      <div class="flex flex-wrap gap-2.5">
        <button type="submit" class="btn" :disabled="guardando"><Save :size="18" aria-hidden="true" />{{ guardando ? 'Guardando…' : 'Guardar' }}</button>
        <button type="button" class="btn-texto" @click="restablecer"><RotateCcw :size="18" aria-hidden="true" />Valores de fábrica</button>
      </div>
    </form>

    <Modal v-if="editando" :titulo="editando.id ? 'Editar mensaje' : 'Nuevo mensaje'" @cerrar="editor?.cancelar()">
      <EditorPlantilla ref="editor" :inicial="editando" :guardando="guardando" @guardar="guardar" @cancelar="editando = null" />
    </Modal>
  </div>
</template>
