<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { CircleAlert, CircleCheck, MessageCircle } from 'lucide-vue-next'
import Modal from './Modal.vue'
import VistaPreviaWhatsapp from './VistaPreviaWhatsapp.vue'
import { call } from '../api'
import { useConfiguracion } from '../composables/useConfiguracion'
import { useToast } from '../composables/useToast'
import { MAX_DESCRIPCION, textoTipo } from '../whatsapp'

// Envío del mensaje de una visita: se elige la plantilla, se ve el mensaje con los datos reales y "Abrir WhatsApp" lo deja
// escrito para que la persona lo envíe. Un fallo aquí no afecta a la visita, que ya está guardada.
const props = defineProps({ visitaId: { type: String, required: true }, plantillaInicial: { type: String, default: '' } })
const emit = defineEmits(['cerrar', 'registrado'])
const { empresa } = useConfiguracion()
const toast = useToast()

const plantillas = ref([])
const plantillaId = ref('')
const descripcion = ref('')
const datos = ref(null) // { cliente, telefono, mensaje, enlace, error }
const cargando = ref(true)
const error = ref('')
const registrado = ref(false)
const pideDescripcion = computed(() => /\{\{\s*servicio_descripcion\s*\}\}/.test(plantillas.value.find((p) => p.id === plantillaId.value)?.mensaje || ''))
const parametros = () => ({ visitaId: props.visitaId, plantillaId: plantillaId.value, descripcion: pideDescripcion.value ? descripcion.value.trim() : '' })

let temporizador
let turno = 0 // descarta respuestas viejas
async function previsualizar() {
  const mio = ++turno
  cargando.value = true
  error.value = ''
  try {
    const r = await call('whatsapp_previsualizar', parametros())
    if (mio === turno) datos.value = r
  } catch (e) {
    if (mio !== turno) return
    datos.value = null
    error.value = e.message
  } finally {
    if (mio === turno) cargando.value = false
  }
}

onMounted(async () => {
  try {
    plantillas.value = await call('whatsapp_plantillas_list')
    const elegida = plantillas.value.find((p) => p.id === props.plantillaInicial) || plantillas.value.find((p) => p.tipo === 'confirmacion' && p.predeterminada) || plantillas.value[0]
    plantillaId.value = elegida?.id || ''
    await previsualizar()
  } catch (e) {
    error.value = e.message
    cargando.value = false
  }
})

function cambio(espera) {
  registrado.value = false
  cargando.value = true // el enlace anterior ya no corresponde a lo elegido
  clearTimeout(temporizador)
  temporizador = setTimeout(previsualizar, espera)
}
watch(descripcion, () => cambio(400))
onBeforeUnmount(() => clearTimeout(temporizador))

// Con enlace, WhatsApp lo abre el propio enlace (así el navegador no lo bloquea) y a la vez se registra en el historial
async function registrar() {
  try {
    const r = await call('whatsapp_preparar', { id: crypto.randomUUID(), ...parametros() })
    if (r.estado === 'Fallido') toast.error(r.error)
    else {
      registrado.value = true
      toast.info('Mensaje preparado: pulsa enviar en WhatsApp.')
    }
    emit('registrado')
  } catch (e) {
    toast.error(`No se pudo registrar en el historial: ${e.message}`)
  }
}
</script>

<template>
  <Modal titulo="Enviar por WhatsApp" @cerrar="emit('cerrar')">
    <div class="grid gap-3">
      <p v-if="datos" class="text-sm text-brand-800 wrap-anywhere">Para <b>{{ datos.cliente }}</b><template v-if="datos.telefono"> · {{ datos.telefono }}</template></p>
      <label v-if="plantillas.length" class="etiqueta">Plantilla
        <select v-model="plantillaId" class="campo" @change="cambio(0)">
          <option v-for="p in plantillas" :key="p.id" :value="p.id">{{ p.nombre }} ({{ textoTipo(p.tipo) }})</option>
        </select>
      </label>
      <label v-if="pideDescripcion" class="etiqueta">Descripción del servicio (opcional)
        <textarea v-model="descripcion" rows="2" class="campo" :maxlength="MAX_DESCRIPCION" placeholder="Si la dejas vacía, esa línea no aparece" />
      </label>

      <VistaPreviaWhatsapp :mensaje="datos?.mensaje" :nombre="empresa.nombre" :cargando="cargando" />

      <p v-if="error || datos?.error" class="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
        <CircleAlert :size="16" class="mt-0.5 shrink-0" aria-hidden="true" />
        <span class="min-w-0 wrap-anywhere">{{ error || `${datos.error}. Corrige el teléfono en la visita o en el cliente.` }}</span>
      </p>
      <p v-if="registrado" class="flex items-start gap-2 rounded-lg bg-brand-100 px-3 py-2 text-sm text-brand-800">
        <CircleCheck :size="16" class="mt-0.5 shrink-0" aria-hidden="true" />Registrado como «Preparado». La app no puede saber si lo enviaste.
      </p>

      <div class="pie-fijo !flex sm:justify-end">
        <button type="button" class="btn-borde" @click="emit('cerrar')">{{ registrado ? 'Cerrar' : 'Ahora no' }}</button>
        <a v-if="datos?.enlace && !cargando" :href="datos.enlace" target="_blank" rel="noopener" class="btn" @click="registrar"><MessageCircle :size="18" aria-hidden="true" />Abrir WhatsApp</a>
        <button v-else-if="datos?.error && !cargando" type="button" class="btn" @click="registrar">Registrar el fallo</button>
        <button v-else type="button" class="btn" disabled><MessageCircle :size="18" aria-hidden="true" />Abrir WhatsApp</button>
      </div>
    </div>
  </Modal>
</template>
