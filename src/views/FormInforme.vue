<script setup>
import PieFormulario from '../components/PieFormulario.vue'
import { reactive, ref, computed, nextTick } from 'vue'
import { ClipboardList, FileText, ListChecks, MessageSquareText, PenLine, Plus, Trash2, Link2 } from 'lucide-vue-next'
import { ESTADOS } from '../composables/useInformes'
import { useConfiguracion } from '../composables/useConfiguracion'
import { leerChecklist, actividadesIniciales, ejemploDeActividad, actividadesUtiles, sinCompletar, RESULTADOS, NO_APLICA, MAX_ACTIVIDADES } from '../plantillas'
import FirmaPad from '../components/FirmaPad.vue'
import CampoTexto from '../components/CampoTexto.vue'
import { hoy } from '../utils'
import { confirmar } from '../composables/useConfirmar'
import { useSinGuardar } from '../composables/useSinGuardar'

// `inicial` = edición de un informe existente; `prefill` = datos sugeridos al crear desde una visita
const props = defineProps({ inicial: Object, prefill: Object, cargando: Boolean })
const emit = defineEmits(['guardar', 'cancelar'])

const { tipos, nombresTipos } = useConfiguracion()
const src = props.inicial ?? props.prefill ?? {}
const tipoInicial = src.tipo ?? nombresTipos.value[0]

const form = reactive({
  fecha: src.fecha ?? hoy(),
  cliente: src.cliente ?? '',
  titulo: src.titulo ?? '',
  tipo: tipoInicial,
  estado: props.inicial?.estado ?? ESTADOS[0],
  responsable: src.responsable ?? '',
  descripcion: props.inicial?.descripcion ?? '',
  visitaId: src.visitaId ?? '',
  firmante: props.inicial?.firmante ?? '',
  firma: props.inicial?.firma ?? '',
})
// ---------- Actividades: dos casillas vacías para empezar; se agregan o quitan las que haga falta ----------
let clave = 0
const conClave = (lista) => lista.map((i) => ({ item: '', resultado: '', obs: '', ...i, _k: ++clave }))
const guardadas = leerChecklist(props.inicial?.checklist)
const actividades = ref(conClave(guardadas.length ? guardadas : actividadesIniciales()))
const error = ref('')
const formulario = ref(null)
const intentoFinalizar = ref(false) // tras un intento fallido se señalan las actividades incompletas
// Incompleta: empezada pero sin descripción o sin resultado; si todas están vacías, se señala la primera
const incompleta = (a, n) =>
  intentoFinalizar.value && form.estado === 'Finalizado' && !(a.item.trim() && a.resultado) && (!!(a.item.trim() || a.resultado) || (n === 0 && !actividadesUtiles(actividades.value).length))
// Muestra el error y lleva la vista a la primera actividad señalada
async function senalar(mensaje) {
  error.value = mensaje
  intentoFinalizar.value = true
  await nextTick()
  formulario.value?.querySelector('[data-incompleta="true"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}
// Si el tipo del informe ya no está en la lista (se quitó en Ajustes), se conserva como opción para no perderlo
const opcionesTipo = computed(() => (form.tipo && !nombresTipos.value.includes(form.tipo) ? [...nombresTipos.value, form.tipo] : nombresTipos.value))
const marcadas = computed(() => actividades.value.filter((a) => a.resultado).length)

const agregar = () => actividades.value.push(...conClave([{}]))
async function quitar(a) {
  if ((a.item.trim() || a.resultado) && !(await confirmar({ titulo: '¿Quitar esta actividad?', texto: a.item || 'Actividad sin descripción', confirmar: 'Quitar', peligro: true }))) return
  actividades.value = actividades.value.filter((x) => x !== a)
}
// Tocar de nuevo el resultado elegido lo desmarca
const marcar = (a, id) => (a.resultado = a.resultado === id ? '' : id)
const opcionesDe = (a) => (a.resultado === NO_APLICA.id ? [...RESULTADOS, NO_APLICA] : RESULTADOS)

const foto = () => JSON.stringify([form, actividadesUtiles(actividades.value)])
const original = foto()
const salir = useSinGuardar(() => foto() !== original)
const cancelar = async () => (await salir()) && emit('cancelar')
defineExpose({ cancelar }) // la X y Escape de la ventana pasan por aquí

async function enviar() {
  error.value = ''
  const lista = actividadesUtiles(actividades.value)
  // Los informes que ya estaban finalizados sin actividades (anteriores a esta regla) se pueden seguir corrigiendo
  const antiguoSinActividades = props.inicial?.estado === 'Finalizado' && !guardadas.length
  if (form.estado === 'Finalizado') {
    if (!lista.length && !antiguoSinActividades) return senalar('Para finalizar, agrega al menos una actividad con su descripción y su resultado.')
    const pend = sinCompletar(actividades.value)
    if (pend) return senalar(`Para finalizar, cada actividad necesita su descripción y su resultado (faltan ${pend}).`)
  }
  if (form.estado === 'Finalizado' && props.inicial?.estado !== 'Finalizado') {
    const ok = await confirmar({ titulo: '¿Finalizar el informe?', texto: 'Una vez finalizado solo un administrador podrá modificarlo.', confirmar: 'Finalizar' })
    if (!ok) return
  }
  emit('guardar', { ...form, checklist: lista.length ? JSON.stringify(lista) : '' })
}
</script>

<template>
  <form ref="formulario" class="@container flex flex-col gap-4" @submit.prevent="enviar">
    <p v-if="inicial?.numero" class="font-mono text-sm font-semibold text-brand-700">{{ inicial.numero }}</p>
    <p v-if="form.visitaId" class="flex items-center gap-2 rounded-xl bg-brand-100 px-3 py-2 text-sm text-brand-800"><Link2 :size="16" class="shrink-0" aria-hidden="true" />Vinculado a una visita agendada.</p>

    <div class="grid gap-4 @5xl:grid-cols-2 @5xl:grid-rows-[auto_auto_1fr] @5xl:items-start">
    <!-- Datos -->
    <section class="tarjeta @container grid gap-3">
      <h3 class="flex items-center gap-2 font-semibold text-brand-900"><FileText :size="18" class="text-brand-600" aria-hidden="true" />Datos del informe</h3>
      <label class="etiqueta">Título
        <input v-model.trim="form.titulo" class="campo" required maxlength="120" placeholder="Ej.: Mantenimiento de cámaras - Banco del Sur" />
      </label>
      <label class="etiqueta">Cliente
        <input v-model.trim="form.cliente" class="campo" required placeholder="Nombre del cliente o empresa" />
      </label>
      <div class="grid grid-cols-2 gap-3 @3xl:grid-cols-4 [&>label]:grid-cols-1">
        <label class="etiqueta">Fecha
          <input v-model="form.fecha" type="date" class="campo" required />
        </label>
        <label class="etiqueta">Tipo de visita
          <select v-model="form.tipo" class="campo">
            <option v-for="t in opcionesTipo" :key="t">{{ t }}</option>
          </select>
        </label>
        <label class="etiqueta">Estado
          <select v-model="form.estado" class="campo">
            <option v-for="e in ESTADOS" :key="e">{{ e }}</option>
          </select>
        </label>
        <label class="etiqueta">Responsable
          <input v-model.trim="form.responsable" class="campo" placeholder="Quién realizó el trabajo" />
        </label>
      </div>
    </section>

    <!-- Actividades -->
    <section class="@container grid content-start gap-2.5 @5xl:col-start-2 @5xl:row-span-3 @5xl:row-start-1">
      <div class="flex items-center justify-between gap-2">
        <h3 class="flex items-center gap-2 font-semibold text-brand-900"><ListChecks :size="18" class="text-brand-600" aria-hidden="true" />Actividades realizadas</h3>
        <span v-if="actividades.length" class="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-800">{{ marcadas }} de {{ actividades.length }}</span>
      </div>
      <p v-if="!actividades.length" class="rounded-xl bg-brand-50 px-3 py-3 text-sm text-brand-700">
        <ClipboardList :size="16" class="mr-1.5 inline" aria-hidden="true" />Todavía no hay actividades. Agrega la primera.
      </p>
      <div v-for="(a, n) in actividades" :key="a._k" class="tarjeta grid gap-2.5 p-3" :class="{ '!border-red-500 ring-2 ring-red-200': incompleta(a, n) }" :data-incompleta="incompleta(a, n)">
        <div class="flex items-start gap-2">
          <span class="mt-2.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">{{ n + 1 }}</span>
          <CampoTexto v-model="a.item" :filas="1" class="min-w-0 flex-1" maxlength="500" :placeholder="ejemploDeActividad(n, form.tipo, tipos)" :aria-label="`Actividad ${n + 1}`" />
          <button type="button" class="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-red-700 active:bg-red-50" :aria-label="`Quitar actividad ${n + 1}`" @click="quitar(a)">
            <Trash2 :size="18" aria-hidden="true" />
          </button>
        </div>
        <div class="grid grid-flow-col gap-1.5 @xl:justify-start" role="radiogroup" :aria-label="`Resultado de la actividad ${n + 1}`">
          <button
            v-for="r in opcionesDe(a)"
            :key="r.id"
            type="button"
            role="radio"
            :aria-checked="a.resultado === r.id"
            class="min-h-11 rounded-lg border px-2 text-sm font-semibold @xl:min-w-32"
            :class="a.resultado === r.id ? r.activo : 'border-brand-200 bg-white text-brand-700'"
            @click="marcar(a, r.id)"
          >
            {{ r.texto }}
          </button>
        </div>
        <!-- Observación aparte que tengan los informes anteriores -->
        <CampoTexto v-if="a.obs" v-model="a.obs" :filas="1" maxlength="300" placeholder="Observación" :aria-label="`Observación de la actividad ${n + 1}`" />
      </div>
      <button type="button" class="flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-300 font-semibold text-brand-700 active:bg-brand-100 disabled:opacity-60" :disabled="actividades.length >= MAX_ACTIVIDADES" @click="agregar">
        <Plus :size="18" aria-hidden="true" />Agregar actividad
      </button>
    </section>

    <!-- Observaciones -->
    <section class="tarjeta grid gap-2">
      <label for="informe-observaciones" class="flex items-center gap-2 font-semibold text-brand-900"><MessageSquareText :size="18" class="text-brand-600" aria-hidden="true" />Observaciones generales</label>
      <CampoTexto id="informe-observaciones" v-model="form.descripcion" :filas="2" placeholder="Recomendaciones, pendientes o detalles importantes de la visita…" />
    </section>

    <!-- Conformidad -->
    <section class="tarjeta grid gap-3">
      <h3 class="flex items-center gap-2 font-semibold text-brand-900"><PenLine :size="18" class="text-brand-600" aria-hidden="true" />Conformidad del cliente</h3>
      <label class="etiqueta">Recibido por
        <input v-model.trim="form.firmante" class="campo" autocomplete="off" placeholder="Nombre y apellido de quien recibe" />
      </label>
      <FirmaPad v-model="form.firma" :nombre="form.firmante" />
    </section>

    </div>

    <PieFormulario texto="Guardar informe" :cargando="cargando" :error="error" @cancelar="cancelar" />
  </form>
</template>
