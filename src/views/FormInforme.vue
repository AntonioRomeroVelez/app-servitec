<script setup>
import { reactive, ref, computed, watch } from 'vue'
import { ESTADOS } from '../composables/useInformes'
import { useConfiguracion } from '../composables/useConfiguracion'
import { nuevoChecklist, leerChecklist, sinResponder, fallasSinObs, RESULTADOS } from '../plantillas'
import FirmaPad from '../components/FirmaPad.vue'
import { hoy } from '../utils'
import { confirmar } from '../composables/useConfirmar'

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
const checklist = ref(props.inicial?.checklist ? leerChecklist(props.inicial.checklist) : nuevoChecklist(tipoInicial, tipos.value))
const error = ref('')
// Si el tipo del informe ya no está en la lista (el superadmin lo quitó), se conserva como opción para no perderlo
const opcionesTipo = computed(() => (form.tipo && !nombresTipos.value.includes(form.tipo) ? [...nombresTipos.value, form.tipo] : nombresTipos.value))

// Al cambiar el tipo se carga su plantilla, salvo que ya se hayan respondido ítems (para no perder trabajo)
watch(
  () => form.tipo,
  (tipo) => {
    if (checklist.value.every((i) => !i.resultado && !i.obs)) checklist.value = nuevoChecklist(tipo, tipos.value)
  },
)

async function enviar() {
  error.value = ''
  if (form.estado === 'Finalizado') {
    const pend = sinResponder(checklist.value)
    const fallas = fallasSinObs(checklist.value)
    if (pend) return (error.value = `Para finalizar responde todo el checklist (faltan ${pend}).`)
    if (fallas) return (error.value = `Describe en observaciones cada ítem con falla (faltan ${fallas}).`)
  }
  if (form.estado === 'Finalizado' && props.inicial?.estado !== 'Finalizado') {
    const ok = await confirmar({ titulo: '¿Finalizar el informe?', texto: 'Una vez finalizado solo el superadmin podrá modificarlo.', confirmar: 'Finalizar' })
    if (!ok) return
  }
  emit('guardar', { ...form, checklist: checklist.value.length ? JSON.stringify(checklist.value) : '' })
}
</script>

<template>
  <form class="grid gap-3.5" @submit.prevent="enviar">
    <p v-if="inicial?.numero" class="text-sm font-semibold text-brand-700">{{ inicial.numero }}</p>
    <p v-if="form.visitaId" class="rounded-xl bg-brand-100 px-3 py-2 text-sm text-brand-800">Vinculado a una visita agendada.</p>
    <label class="etiqueta">Título
      <input v-model.trim="form.titulo" class="campo" required maxlength="120" />
    </label>
    <label class="etiqueta">Cliente
      <input v-model.trim="form.cliente" class="campo" required />
    </label>
    <div class="grid gap-3.5 sm:grid-cols-2">
      <label class="etiqueta">Fecha
        <input v-model="form.fecha" type="date" class="campo" required />
      </label>
      <label class="etiqueta">Tipo
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
        <input v-model.trim="form.responsable" class="campo" />
      </label>
    </div>

    <!-- Checklist de la plantilla -->
    <section v-if="checklist.length" class="grid gap-2">
      <h3 class="font-semibold text-brand-800">Checklist ({{ checklist.length - sinResponder(checklist) }}/{{ checklist.length }})</h3>
      <div v-for="(c, idx) in checklist" :key="c.item" class="tarjeta grid gap-2 p-3">
        <p class="text-sm font-medium text-brand-900">{{ c.item }}</p>
        <div class="grid grid-cols-3 gap-1.5" role="radiogroup" :aria-label="c.item">
          <button
            v-for="r in RESULTADOS"
            :key="r.id"
            type="button"
            role="radio"
            :aria-checked="c.resultado === r.id"
            class="min-h-11 rounded-lg border text-sm font-semibold"
            :class="c.resultado === r.id ? r.activo : 'border-brand-200 bg-white text-brand-700'"
            @click="checklist[idx].resultado = r.id"
          >
            {{ r.texto }}
          </button>
        </div>
        <input
          v-if="c.resultado === 'falla' || c.obs"
          v-model="checklist[idx].obs"
          class="campo"
          placeholder="Observación (obligatoria si hay falla)"
          maxlength="300"
        />
      </div>
    </section>

    <label class="etiqueta">Observaciones generales
      <textarea v-model="form.descripcion" rows="6" class="campo" />
    </label>

    <section class="grid gap-2">
      <h3 class="font-semibold text-brand-800">Conformidad del cliente</h3>
      <label class="etiqueta">Recibido por (nombre)
        <input v-model.trim="form.firmante" class="campo" autocomplete="off" />
      </label>
      <FirmaPad v-model="form.firma" />
    </section>

    <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>

    <div class="mt-2 flex gap-2.5 sm:justify-end">
      <button type="button" class="btn-borde" @click="emit('cancelar')">Cancelar</button>
      <button type="submit" class="btn" :disabled="cargando">{{ cargando ? 'Guardando…' : 'Guardar' }}</button>
    </div>
  </form>
</template>
