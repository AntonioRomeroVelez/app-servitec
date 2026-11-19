<script setup>
import { ref, computed, nextTick } from 'vue'
import { leerChecklist, RESULTADOS } from '../plantillas'
import { useFotos } from '../composables/useFotos'
import { useAuth } from '../composables/useAuth'
import EstadoBadge from '../components/EstadoBadge.vue'
import { CloudUpload, FileDown, Loader } from 'lucide-vue-next'
import { fechaCorta } from '../utils'
import { useConfiguracion } from '../composables/useConfiguracion'

const props = defineProps({ informe: { type: Object, required: true } })
defineEmits(['editar', 'eliminar'])

const { lista, cargar, obtener } = useFotos()
const { esSuper, usuario } = useAuth()
const { empresa, logo, informes: cfgInformes } = useConfiguracion()

// Línea con los datos de la empresa para el encabezado del PDF
const datosEmpresa = computed(() =>
  [empresa.value.ruc && `RUC ${empresa.value.ruc}`, empresa.value.direccion, empresa.value.telefono && `Tel. ${empresa.value.telefono}`, empresa.value.correo, empresa.value.web].filter(Boolean).join(' · '),
)

const checklist = computed(() => leerChecklist(props.informe.checklist))
const textoResultado = (id) => RESULTADOS.find((r) => r.id === id)?.texto ?? 'Sin responder'
const claseResultado = (id) => ({ ok: 'text-emerald-700', falla: 'text-red-700', na: 'text-brand-700' })[id] ?? 'text-brand-700/60'

// Finalizado = cerrado: solo el superadmin puede editarlo o eliminarlo
const cerrado = computed(() => props.informe.estado === 'Finalizado' && !esSuper.value)
const puedeEliminar = computed(() => esSuper.value || (props.informe.autor === usuario.value.usuario && props.informe.estado !== 'Finalizado'))

// --- PDF: se arma la vista de impresión (con las fotos de la visita en buena resolución) y se abre el diálogo de impresión ---
const fotosPdf = ref([])
const preparando = ref(false)
const errorPdf = ref('')

async function descargarPdf() {
  errorPdf.value = ''
  preparando.value = true
  try {
    const id = props.informe.visitaId
    if (id && cfgInformes.value.pdfFotos) {
      await cargar(id)
      fotosPdf.value = await Promise.all(lista(id).map(async (f) => ({ id: f.id, src: await obtener(f.id) })))
    }
    await nextTick()
    await Promise.all([...document.querySelectorAll('.fotos-pdf img')].map((img) => img.decode().catch(() => {})))
    // El navegador propone el título de la página como nombre del archivo: queda como "INF-2026-0001.pdf"
    const titulo = document.title
    document.title = props.informe.numero || 'Informe'
    window.print() // el usuario elige "Guardar como PDF"
    document.title = titulo
  } catch (e) {
    errorPdf.value = e.message
  } finally {
    preparando.value = false
  }
}
</script>

<template>
  <article class="tarjeta grid gap-3 print:border-0 print:p-0 print:shadow-none">
    <!-- Encabezado solo visible al imprimir / guardar como PDF -->
    <div class="hidden items-end justify-between gap-4 border-b-2 border-brand-700 pb-3 print:flex">
      <div class="flex items-center gap-3">
        <img v-if="logo" :src="logo" :alt="empresa.nombre" class="max-h-16 max-w-48 w-auto object-contain" />
        <div>
          <p class="text-2xl font-black tracking-wide text-brand-800">{{ empresa.nombre }}</p>
          <p v-if="empresa.subtitulo" class="text-[10px] font-bold tracking-[0.35em] text-brand-600">{{ empresa.subtitulo }}</p>
        </div>
      </div>
      <div class="text-right text-sm">
        <p class="font-bold">{{ informe.numero }}</p>
        <p>{{ fechaCorta(informe.fecha) }}</p>
      </div>
    </div>
    <p v-if="datosEmpresa" class="hidden text-xs text-brand-700 print:block">{{ datosEmpresa }}</p>

    <p class="flex items-center gap-2 text-sm font-semibold text-brand-700 print:hidden">
      <span>{{ informe.numero || 'Número pendiente: se asigna al enviarse' }}</span>
      <span v-if="informe._pendiente" class="flex items-center gap-1 text-xs"><CloudUpload :size="14" aria-hidden="true" />Sin enviar</span>
    </p>
    <div class="flex items-start justify-between gap-2">
      <h2 class="text-xl font-bold text-brand-900">{{ informe.titulo }}</h2>
      <EstadoBadge :estado="informe.estado" />
    </div>

    <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      <dt class="text-brand-700/70">Cliente</dt><dd>{{ informe.cliente }}</dd>
      <dt class="text-brand-700/70">Fecha</dt><dd>{{ fechaCorta(informe.fecha) }}</dd>
      <dt class="text-brand-700/70">Tipo</dt><dd>{{ informe.tipo }}</dd>
      <dt class="text-brand-700/70">Responsable</dt><dd>{{ informe.responsable || '—' }}</dd>
      <dt class="text-brand-700/70">Elaborado por</dt><dd>{{ informe.autor }}</dd>
    </dl>

    <section v-if="checklist.length" class="grid gap-1.5" :class="{ 'print:hidden': !cfgInformes.pdfChecklist }">
      <h3 class="font-semibold text-brand-800">Checklist</h3>
      <ul class="divide-y divide-brand-100 rounded-xl border border-brand-100">
        <li v-for="c in checklist" :key="c.item" class="flex items-start justify-between gap-3 px-3 py-2 text-sm break-inside-avoid">
          <span>
            {{ c.item }}
            <span v-if="c.obs" class="block text-xs text-brand-700/80">Obs.: {{ c.obs }}</span>
          </span>
          <b class="shrink-0" :class="claseResultado(c.resultado)">{{ textoResultado(c.resultado) }}</b>
        </li>
      </ul>
    </section>

    <section :class="{ 'print:hidden': !cfgInformes.pdfObservaciones }">
      <h3 class="font-semibold text-brand-800">Observaciones</h3>
      <p class="whitespace-pre-wrap">{{ informe.descripcion || 'Sin observaciones.' }}</p>
    </section>

    <!-- Fotos: solo en el PDF (en pantalla se ven desde la visita) -->
    <section v-if="fotosPdf.length" class="fotos-pdf hidden print:block">
      <h3 class="mb-2 font-semibold text-brand-800">Fotografías</h3>
      <div class="grid grid-cols-2 gap-2">
        <img v-for="f in fotosPdf" :key="f.id" :src="f.src" class="w-full break-inside-avoid rounded border border-brand-100" alt="" />
      </div>
    </section>

    <section v-if="informe.firma || informe.firmante" class="break-inside-avoid" :class="{ 'print:hidden': !cfgInformes.pdfFirma }">
      <h3 class="font-semibold text-brand-800">Conformidad del cliente</h3>
      <img v-if="informe.firma" :src="informe.firma" class="h-24 w-auto border-b border-brand-300" alt="Firma del cliente" />
      <p v-if="informe.firmante" class="text-sm">{{ informe.firmante }}</p>
    </section>

    <p v-if="empresa.pie" class="hidden border-t border-brand-200 pt-2 text-center text-xs whitespace-pre-line text-brand-700 print:block">{{ empresa.pie }}</p>

    <p v-if="cerrado" class="rounded-xl bg-brand-100 px-3 py-2 text-sm text-brand-800 print:hidden">Informe finalizado: solo el superadmin puede modificarlo.</p>
    <p v-if="errorPdf" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 print:hidden">{{ errorPdf }}</p>

    <div class="mt-2 grid gap-2.5 print:hidden">
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
