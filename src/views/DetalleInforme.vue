<script setup>
import { ref, computed } from 'vue'
import { leerChecklist, RESULTADOS } from '../plantillas'
import { useFotos } from '../composables/useFotos'
import { useAuth } from '../composables/useAuth'
import { useToast } from '../composables/useToast'
import EstadoBadge from '../components/EstadoBadge.vue'
import Dato from '../components/Dato.vue'
import { bordeDeEstado } from '../estados'
import { Building2, CalendarDays, CloudUpload, FileDown, Loader, Tag, UserPen, UserRound } from 'lucide-vue-next'
import { fechaCorta } from '../utils'
import { medirImagen } from '../imagen'
import { useConfiguracion } from '../composables/useConfiguracion'

const props = defineProps({ informe: { type: Object, required: true } })
defineEmits(['editar', 'eliminar'])

const { lista, cargar, obtener } = useFotos()
const { esSuper, usuario } = useAuth()
const { empresa, logo, tema, informes: cfgInformes } = useConfiguracion()
const toast = useToast()

const checklist = computed(() => leerChecklist(props.informe.checklist))
const textoResultado = (id) => RESULTADOS.find((r) => r.id === id)?.texto ?? 'Sin responder'
const claseResultado = (id) => ({ ok: 'bg-emerald-100 text-emerald-800', falla: 'bg-red-100 text-red-800', na: 'bg-brand-100 text-brand-800' })[id] ?? 'bg-brand-50 text-brand-700/70'

// Finalizado = cerrado: solo el superadmin puede editarlo o eliminarlo
const cerrado = computed(() => props.informe.estado === 'Finalizado' && !esSuper.value)
const puedeEliminar = computed(() => esSuper.value || (props.informe.autor === usuario.value.usuario && props.informe.estado !== 'Finalizado'))

// --- PDF: archivo real (A4) con el logo y los datos de la empresa como encabezado, fotos de la visita y firma ---
const preparando = ref(false)

async function descargarPdf() {
  preparando.value = true
  try {
    // Fotos de la visita en buena resolución; si alguna no se puede traer, el PDF sale con las demás y se avisa
    let fotos = []
    let sinFoto = 0
    const id = props.informe.visitaId
    if (id && cfgInformes.value.pdfFotos) {
      await cargar(id)
      const traidas = await Promise.allSettled(lista(id).map(async (f) => medirImagen(await obtener(f.id))))
      fotos = traidas.filter((r) => r.status === 'fulfilled').map((r) => r.value)
      sinFoto = traidas.length - fotos.length
    }
    const [{ generarPdfInforme, nombreArchivoPdf }, logoMedido, firma] = await Promise.all([
      import('../pdfInforme'),
      logo.value ? medirImagen(logo.value, { aPng: true }).catch(() => null) : null,
      props.informe.firma ? medirImagen(props.informe.firma).catch(() => null) : null,
    ])
    const doc = await generarPdfInforme({
      informe: props.informe,
      empresa: empresa.value,
      colorPrimario: tema.value.primario,
      logo: logoMedido,
      checklist: checklist.value,
      fotos,
      firma,
      opciones: cfgInformes.value,
    })
    doc.save(nombreArchivoPdf(props.informe))
    if (sinFoto) toast.info(`PDF descargado. ${sinFoto} ${sinFoto === 1 ? 'foto no se pudo incluir' : 'fotos no se pudieron incluir'}.`)
    else toast.exito('PDF descargado.')
  } catch (e) {
    toast.error(e.message || 'No se pudo generar el PDF')
  } finally {
    preparando.value = false
  }
}
</script>

<template>
  <article class="tarjeta grid gap-3 border-l-4" :class="bordeDeEstado(informe.estado)">
    <p class="flex items-center gap-2 text-sm font-semibold text-brand-700">
      <span class="rounded-md bg-brand-50 px-2 py-0.5 font-mono text-xs">{{ informe.numero || 'Número pendiente: se asigna al enviarse' }}</span>
      <span v-if="informe._pendiente" class="flex items-center gap-1 text-xs"><CloudUpload :size="14" aria-hidden="true" />Sin enviar</span>
    </p>
    <div class="flex items-start justify-between gap-2">
      <h2 class="text-xl font-bold text-brand-900">{{ informe.titulo }}</h2>
      <EstadoBadge :estado="informe.estado" />
    </div>

    <div class="grid gap-2 rounded-xl border border-brand-100 p-3 sm:grid-cols-2">
      <Dato :icono="Building2" etiqueta="Cliente" ajustar>{{ informe.cliente }}</Dato>
      <Dato :icono="CalendarDays" etiqueta="Fecha">{{ fechaCorta(informe.fecha) }}</Dato>
      <Dato :icono="Tag" etiqueta="Tipo" ajustar>{{ informe.tipo }}</Dato>
      <Dato :icono="UserRound" etiqueta="Responsable" ajustar>{{ informe.responsable || 'Sin responsable' }}</Dato>
      <Dato :icono="UserPen" etiqueta="Elaborado por" ajustar>Elaborado por {{ informe.autor }}</Dato>
    </div>

    <section v-if="checklist.length" class="grid gap-1.5">
      <h3 class="font-semibold text-brand-800">Checklist</h3>
      <ul class="divide-y divide-brand-100 rounded-xl border border-brand-100">
        <li v-for="c in checklist" :key="c.item" class="flex items-start justify-between gap-3 px-3 py-2 text-sm break-inside-avoid">
          <span>
            {{ c.item }}
            <span v-if="c.obs" class="block text-xs text-brand-700/80">Obs.: {{ c.obs }}</span>
          </span>
          <b class="shrink-0 rounded-full px-2.5 py-0.5 text-xs" :class="claseResultado(c.resultado)">{{ textoResultado(c.resultado) }}</b>
        </li>
      </ul>
    </section>

    <section>
      <h3 class="font-semibold text-brand-800">Observaciones</h3>
      <p class="whitespace-pre-wrap">{{ informe.descripcion || 'Sin observaciones.' }}</p>
    </section>

    <section v-if="informe.firma || informe.firmante" class="break-inside-avoid">
      <h3 class="font-semibold text-brand-800">Conformidad del cliente</h3>
      <img v-if="informe.firma" :src="informe.firma" class="h-24 w-auto border-b border-brand-300" alt="Firma del cliente" />
      <p v-if="informe.firmante" class="text-sm">{{ informe.firmante }}</p>
    </section>

    <p v-if="cerrado" class="rounded-xl bg-brand-100 px-3 py-2 text-sm text-brand-800">Informe finalizado: solo el superadmin puede modificarlo.</p>

    <div class="mt-2 grid gap-2.5">
      <button class="btn-acento min-h-12 flex-none" :disabled="preparando" @click="descargarPdf">
        <Loader v-if="preparando" :size="20" class="animate-spin" aria-hidden="true" />
        <FileDown v-else :size="20" aria-hidden="true" />
        {{ preparando ? 'Preparando PDF…' : 'Descargar PDF' }}
      </button>
      <div class="flex gap-2.5 sm:justify-end">
        <button v-if="puedeEliminar" class="btn-peligro" @click="$emit('eliminar')">Eliminar</button>
        <button v-if="!cerrado" class="btn-borde" @click="$emit('editar')">Editar</button>
      </div>
    </div>
  </article>
</template>
