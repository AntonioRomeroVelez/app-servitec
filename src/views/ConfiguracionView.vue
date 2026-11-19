<script setup>
import { reactive, ref, computed, watch, onBeforeUnmount } from 'vue'
import { Building2, Palette, FileText, ListChecks, ImagePlus, Trash2, RotateCcw, Save, ArrowUp, ArrowDown, Plus, Check, ChevronDown, ChevronUp, CircleAlert } from 'lucide-vue-next'
import { useToast } from '../composables/useToast'
import { useConfiguracion } from '../composables/useConfiguracion'
import { TEMAS_PREDEFINIDOS, contraste } from '../tema'
import { procesarLogo } from '../imagen'
import { clonar } from '../configuracion'

// Ajustes de la app (solo superadmin): datos de la empresa, colores y logo, informes, y tipos de visita con su checklist.
// Cada sección se guarda por separado en la hoja "Configuración" y se aplica a todos los usuarios.
const props = defineProps({ solicitud: Object }) // desde el menú: { seccion } abre esa sección
const C = useConfiguracion()

const abierta = ref('empresa')
watch(() => props.solicitud, (s) => s?.seccion && (abierta.value = s.seccion), { immediate: true })
const guardando = ref('')
const aviso = reactive({ seccion: '', texto: '', error: false })

const empresa = reactive({})
const tema = reactive({})
const informes = reactive({})
const tipos = ref([])
const logoNuevo = ref('') // logo elegido y reducido, todavía sin guardar

// Copia de trabajo = lo guardado (se vuelve a llenar tras guardar o restablecer)
function cargarCopias() {
  Object.assign(empresa, clonar(C.config.value.empresa))
  Object.assign(tema, clonar(C.config.value.tema))
  Object.assign(informes, clonar(C.config.value.informes))
  tipos.value = clonar(C.config.value.tipos)
}
cargarCopias()

const toast = useToast()
const mostrar = (seccion, texto, error = false) => {
  Object.assign(aviso, { seccion, texto, error })
  error ? toast.error(texto) : toast.exito(texto)
}
const alternar = (s) => {
  abierta.value = abierta.value === s ? '' : s
  mostrar('', '')
}

async function ejecutar(seccion, accion, exito) {
  guardando.value = seccion
  try {
    await accion()
    cargarCopias()
    mostrar(seccion, exito)
  } catch (e) {
    mostrar(seccion, e.message, true)
  } finally {
    guardando.value = ''
  }
}
const guardar = (seccion, data) => ejecutar(seccion, () => C.guardar(seccion, data), 'Cambios guardados. Ya los ven todos los usuarios.')
const restablecer = (seccion, nombre) => {
  if (!confirm(`¿Volver a los valores de fábrica en "${nombre}"?`)) return
  ejecutar(seccion, () => C.restablecer(seccion), 'Se restablecieron los valores de fábrica.')
}

// ---------- Colores: vista previa en vivo ----------
const HEX = /^#[0-9a-f]{6}$/i
const coloresValidos = computed(() => HEX.test(tema.primario) && HEX.test(tema.acento))
const contrastePrimario = computed(() => (HEX.test(tema.primario) ? contraste(tema.primario, '#ffffff') : 0))
const primarioLegible = computed(() => contrastePrimario.value >= 4.5)

watch(
  () => [tema.primario, tema.acento],
  () => {
    if (coloresValidos.value && primarioLegible.value) C.vistaPrevia({ primario: tema.primario.toLowerCase(), acento: tema.acento.toLowerCase() })
  },
)
onBeforeUnmount(() => C.cancelarVistaPrevia()) // lo no guardado no se queda aplicado al salir

const elegirTema = (t) => Object.assign(tema, { primario: t.primario, acento: t.acento })

// ---------- Logo ----------
async function elegirLogo(e) {
  const archivo = e.target.files[0]
  e.target.value = ''
  if (!archivo) return
  try {
    logoNuevo.value = await procesarLogo(archivo)
    mostrar('', '')
  } catch (err) {
    logoNuevo.value = ''
    mostrar('tema', err.message, true)
  }
}
async function usarLogo() {
  await guardar('logo', { logo: logoNuevo.value })
  if (!aviso.error) logoNuevo.value = ''
}

// ---------- Tipos de visita y checklist ----------
const mover = (lista, i, d) => {
  const j = i + d
  if (j < 0 || j >= lista.length) return
  ;[lista[i], lista[j]] = [lista[j], lista[i]]
}
const agregarTipo = () => tipos.value.push({ nombre: '', checklist: [] })
const quitarTipo = (i) => tipos.value.splice(i, 1)
const abiertoTipo = ref(null)
</script>

<template>
  <div class="grid gap-3">
    <!-- Datos de la empresa -->
    <section class="tarjeta p-0">
      <button class="flex min-h-14 w-full items-center gap-3 px-4 text-left" :aria-expanded="abierta === 'empresa'" @click="alternar('empresa')">
        <Building2 :size="20" class="shrink-0 text-brand-600" aria-hidden="true" />
        <span class="flex-1 font-semibold text-brand-900">Datos de la empresa</span>
        <ChevronUp v-if="abierta === 'empresa'" :size="20" aria-hidden="true" />
        <ChevronDown v-else :size="20" aria-hidden="true" />
      </button>
      <form v-if="abierta === 'empresa'" class="grid gap-3 border-t border-brand-100 p-4" @submit.prevent="guardar('empresa', { ...empresa })">
        <p class="text-sm text-brand-700">Aparecen en la pantalla de ingreso, en el encabezado y el pie de los informes en PDF y en los correos.</p>
        <label class="etiqueta">Nombre
          <input v-model="empresa.nombre" class="campo" required maxlength="60" />
        </label>
        <label class="etiqueta">Subtítulo o eslogan
          <input v-model="empresa.subtitulo" class="campo" maxlength="60" />
        </label>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="etiqueta">RUC o identificación fiscal
            <input v-model="empresa.ruc" class="campo" maxlength="30" />
          </label>
          <label class="etiqueta">Teléfono
            <input v-model="empresa.telefono" type="tel" inputmode="tel" class="campo" maxlength="40" />
          </label>
        </div>
        <label class="etiqueta">Dirección
          <input v-model="empresa.direccion" class="campo" maxlength="160" />
        </label>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="etiqueta">Correo
            <input v-model="empresa.correo" type="email" class="campo" maxlength="120" autocapitalize="none" />
          </label>
          <label class="etiqueta">Sitio web
            <input v-model="empresa.web" class="campo" maxlength="120" autocapitalize="none" />
          </label>
        </div>
        <label class="etiqueta">Pie de los informes (texto legal, agradecimiento…)
          <textarea v-model="empresa.pie" rows="3" class="campo" maxlength="300" />
        </label>
        <div class="flex flex-wrap gap-2">
          <button class="btn flex-none" :disabled="guardando === 'empresa'"><Save :size="18" aria-hidden="true" />Guardar</button>
          <button type="button" class="btn-borde flex-none" @click="restablecer('empresa', 'Datos de la empresa')"><RotateCcw :size="18" aria-hidden="true" />Valores de fábrica</button>
        </div>
      </form>
    </section>

    <!-- Colores y logo -->
    <section class="tarjeta p-0">
      <button class="flex min-h-14 w-full items-center gap-3 px-4 text-left" :aria-expanded="abierta === 'tema'" @click="alternar('tema')">
        <Palette :size="20" class="shrink-0 text-brand-600" aria-hidden="true" />
        <span class="flex-1 font-semibold text-brand-900">Colores y logo</span>
        <ChevronUp v-if="abierta === 'tema'" :size="20" aria-hidden="true" />
        <ChevronDown v-else :size="20" aria-hidden="true" />
      </button>
      <div v-if="abierta === 'tema'" class="grid gap-4 border-t border-brand-100 p-4">
        <!-- Logo -->
        <div class="grid gap-2">
          <h3 class="font-semibold text-brand-800">Logo</h3>
          <div class="flex flex-wrap items-center gap-3">
            <span class="flex h-20 min-w-32 items-center justify-center rounded-xl border border-dashed border-brand-300 bg-white px-3">
              <img v-if="logoNuevo || C.logo.value" :src="logoNuevo || C.logo.value" alt="Logo de la empresa" class="max-h-16 max-w-48 object-contain" />
              <span v-else class="text-sm text-brand-700/60">Sin logo</span>
            </span>
            <div class="flex flex-wrap gap-2">
              <label class="btn-borde min-h-11 flex-none cursor-pointer text-sm">
                <ImagePlus :size="18" aria-hidden="true" />
                Elegir imagen
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" class="sr-only" @change="elegirLogo" />
              </label>
              <button v-if="C.logo.value && !logoNuevo" type="button" class="btn-peligro min-h-11 flex-none text-sm" :disabled="guardando === 'logo'" @click="guardar('logo', { logo: '' })">
                <Trash2 :size="18" aria-hidden="true" />Quitar logo
              </button>
            </div>
          </div>
          <div v-if="logoNuevo" class="flex flex-wrap gap-2">
            <button type="button" class="btn flex-none" :disabled="guardando === 'logo'" @click="usarLogo"><Save :size="18" aria-hidden="true" />Usar este logo</button>
            <button type="button" class="btn-borde flex-none" @click="logoNuevo = ''">Cancelar</button>
          </div>
          <p class="text-xs text-brand-700/80">PNG, JPG, WebP o SVG. Se reduce solo para que pese poco. Aparece en el ingreso y en el PDF de los informes; un logo con fondo transparente se ve mejor.</p>
        </div>

        <!-- Colores -->
        <form class="grid gap-3 border-t border-brand-100 pt-4" @submit.prevent="guardar('tema', { primario: tema.primario, acento: tema.acento })">
          <h3 class="font-semibold text-brand-800">Colores</h3>
          <div class="flex flex-wrap gap-2" role="group" aria-label="Combinaciones de colores">
            <button
              v-for="t in TEMAS_PREDEFINIDOS"
              :key="t.nombre"
              type="button"
              class="flex min-h-11 items-center gap-2 rounded-xl border bg-white px-3 text-sm"
              :class="tema.primario === t.primario && tema.acento === t.acento ? 'border-brand-600 ring-2 ring-brand-300' : 'border-brand-200'"
              @click="elegirTema(t)"
            >
              <span class="flex overflow-hidden rounded-full border border-black/10">
                <span class="size-5" :style="{ background: t.primario }" /><span class="size-5" :style="{ background: t.acento }" />
              </span>
              {{ t.nombre }}
            </button>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="etiqueta">Color principal (botones y encabezado)
              <span class="flex gap-2">
                <input v-model="tema.primario" type="color" class="h-11 w-14 shrink-0 cursor-pointer rounded-xl border border-brand-200 bg-white p-1" aria-label="Elegir color principal" />
                <input v-model="tema.primario" class="campo" maxlength="7" autocapitalize="none" spellcheck="false" aria-label="Código del color principal" />
              </span>
            </label>
            <label class="etiqueta">Color de acento (destacados y botón +)
              <span class="flex gap-2">
                <input v-model="tema.acento" type="color" class="h-11 w-14 shrink-0 cursor-pointer rounded-xl border border-brand-200 bg-white p-1" aria-label="Elegir color de acento" />
                <input v-model="tema.acento" class="campo" maxlength="7" autocapitalize="none" spellcheck="false" aria-label="Código del color de acento" />
              </span>
            </label>
          </div>
          <p v-if="!coloresValidos" class="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><CircleAlert :size="16" aria-hidden="true" />Los colores deben tener el formato #RRGGBB.</p>
          <p v-else-if="!primarioLegible" class="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><CircleAlert :size="16" aria-hidden="true" />El color principal es demasiado claro: el texto blanco no se leería. Elige uno más oscuro.</p>

          <!-- Vista previa: usa los colores que se están eligiendo (ya aplicados a toda la app mientras esta pantalla está abierta) -->
          <div class="overflow-hidden rounded-xl border border-brand-200" aria-label="Vista previa de los colores">
            <div class="bg-brand-800 px-3 py-2 text-sm font-bold text-white">Así se verá el encabezado</div>
            <div class="grid gap-2 bg-brand-50 p-3">
              <div class="flex flex-wrap gap-2">
                <span class="btn min-h-10 flex-none text-sm">Botón principal</span>
                <span class="btn-acento min-h-10 flex-none text-sm">Botón destacado</span>
              </div>
              <div class="flex flex-wrap gap-2 text-xs font-semibold">
                <span class="rounded-full bg-brand-100 px-2.5 py-0.5 text-brand-800">Programada</span>
                <span class="rounded-full bg-brand-300 px-2.5 py-0.5 text-brand-950">Aceptada</span>
                <span class="rounded-full bg-acento px-2.5 py-0.5 text-acento-texto">En curso</span>
              </div>
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <button class="btn flex-none" :disabled="guardando === 'tema' || !coloresValidos || !primarioLegible"><Save :size="18" aria-hidden="true" />Guardar colores</button>
            <button type="button" class="btn-borde flex-none" @click="restablecer('tema', 'Colores')"><RotateCcw :size="18" aria-hidden="true" />Valores de fábrica</button>
          </div>
        </form>
      </div>
    </section>

    <!-- Informes -->
    <section class="tarjeta p-0">
      <button class="flex min-h-14 w-full items-center gap-3 px-4 text-left" :aria-expanded="abierta === 'informes'" @click="alternar('informes')">
        <FileText :size="20" class="shrink-0 text-brand-600" aria-hidden="true" />
        <span class="flex-1 font-semibold text-brand-900">Informes</span>
        <ChevronUp v-if="abierta === 'informes'" :size="20" aria-hidden="true" />
        <ChevronDown v-else :size="20" aria-hidden="true" />
      </button>
      <form v-if="abierta === 'informes'" class="grid gap-3 border-t border-brand-100 p-4" @submit.prevent="guardar('informes', { ...informes })">
        <label class="etiqueta">Prefijo del número de informe
          <input v-model="informes.prefijo" class="campo uppercase" required maxlength="6" autocapitalize="characters" spellcheck="false" @input="informes.prefijo = informes.prefijo.toUpperCase()" />
          <span class="text-xs font-normal text-brand-700/80">De 2 a 6 letras o números. Ejemplo: {{ informes.prefijo || 'INF' }}-{{ new Date().getFullYear() }}-0001. Los informes ya hechos conservan su número.</span>
        </label>
        <fieldset class="grid gap-1">
          <legend class="mb-1 text-sm font-medium text-brand-800">Qué incluye el PDF del informe</legend>
          <label class="flex min-h-11 items-center gap-3 text-sm"><input v-model="informes.pdfChecklist" type="checkbox" class="size-5 accent-brand-600" />Checklist</label>
          <label class="flex min-h-11 items-center gap-3 text-sm"><input v-model="informes.pdfObservaciones" type="checkbox" class="size-5 accent-brand-600" />Observaciones</label>
          <label class="flex min-h-11 items-center gap-3 text-sm"><input v-model="informes.pdfFotos" type="checkbox" class="size-5 accent-brand-600" />Fotografías de la visita</label>
          <label class="flex min-h-11 items-center gap-3 text-sm"><input v-model="informes.pdfFirma" type="checkbox" class="size-5 accent-brand-600" />Firma y conformidad del cliente</label>
        </fieldset>
        <div class="flex flex-wrap gap-2">
          <button class="btn flex-none" :disabled="guardando === 'informes'"><Save :size="18" aria-hidden="true" />Guardar</button>
          <button type="button" class="btn-borde flex-none" @click="restablecer('informes', 'Informes')"><RotateCcw :size="18" aria-hidden="true" />Valores de fábrica</button>
        </div>
      </form>
    </section>

    <!-- Tipos de visita y checklists -->
    <section class="tarjeta p-0">
      <button class="flex min-h-14 w-full items-center gap-3 px-4 text-left" :aria-expanded="abierta === 'tipos'" @click="alternar('tipos')">
        <ListChecks :size="20" class="shrink-0 text-brand-600" aria-hidden="true" />
        <span class="flex-1 font-semibold text-brand-900">Tipos de visita y checklists</span>
        <ChevronUp v-if="abierta === 'tipos'" :size="20" aria-hidden="true" />
        <ChevronDown v-else :size="20" aria-hidden="true" />
      </button>
      <form v-if="abierta === 'tipos'" class="grid gap-3 border-t border-brand-100 p-4" @submit.prevent="guardar('tipos', { tipos })">
        <p class="text-sm text-brand-700">Los tipos aparecen al agendar visitas y crear informes; el checklist de cada tipo se carga solo en el informe. Cambiarlos no modifica lo ya registrado.</p>
        <div v-for="(t, i) in tipos" :key="i" class="grid gap-2 rounded-xl border border-brand-100 bg-brand-50/60 p-3">
          <div class="flex gap-1.5">
            <input v-model="t.nombre" class="campo" required maxlength="40" placeholder="Nombre del tipo" :aria-label="`Nombre del tipo ${i + 1}`" />
            <button type="button" class="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-brand-200 bg-white" :disabled="i === 0" aria-label="Subir tipo" @click="mover(tipos, i, -1)"><ArrowUp :size="18" aria-hidden="true" /></button>
            <button type="button" class="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-brand-200 bg-white" :disabled="i === tipos.length - 1" aria-label="Bajar tipo" @click="mover(tipos, i, 1)"><ArrowDown :size="18" aria-hidden="true" /></button>
            <button type="button" class="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-red-300 bg-white text-red-700" :disabled="tipos.length === 1" aria-label="Quitar tipo" @click="quitarTipo(i)"><Trash2 :size="18" aria-hidden="true" /></button>
          </div>
          <button type="button" class="flex min-h-10 items-center justify-between rounded-lg px-1 text-left text-sm font-medium text-brand-800" :aria-expanded="abiertoTipo === i" @click="abiertoTipo = abiertoTipo === i ? null : i">
            <span>Checklist ({{ t.checklist.length }} {{ t.checklist.length === 1 ? 'ítem' : 'ítems' }})</span>
            <ChevronUp v-if="abiertoTipo === i" :size="18" aria-hidden="true" /><ChevronDown v-else :size="18" aria-hidden="true" />
          </button>
          <div v-if="abiertoTipo === i" class="grid gap-1.5">
            <div v-for="(_, j) in t.checklist" :key="j" class="flex gap-1.5">
              <input v-model="t.checklist[j]" class="campo" maxlength="100" :aria-label="`Ítem ${j + 1} de ${t.nombre || 'este tipo'}`" />
              <button type="button" class="flex min-h-11 min-w-10 items-center justify-center rounded-xl border border-brand-200 bg-white" :disabled="j === 0" aria-label="Subir ítem" @click="mover(t.checklist, j, -1)"><ArrowUp :size="16" aria-hidden="true" /></button>
              <button type="button" class="flex min-h-11 min-w-10 items-center justify-center rounded-xl border border-brand-200 bg-white" :disabled="j === t.checklist.length - 1" aria-label="Bajar ítem" @click="mover(t.checklist, j, 1)"><ArrowDown :size="16" aria-hidden="true" /></button>
              <button type="button" class="flex min-h-11 min-w-10 items-center justify-center rounded-xl border border-red-300 bg-white text-red-700" aria-label="Quitar ítem" @click="t.checklist.splice(j, 1)"><Trash2 :size="16" aria-hidden="true" /></button>
            </div>
            <button type="button" class="btn-borde min-h-10 flex-none self-start text-sm" :disabled="t.checklist.length >= 30" @click="t.checklist.push('')"><Plus :size="16" aria-hidden="true" />Agregar ítem</button>
          </div>
        </div>
        <button type="button" class="btn-borde flex-none self-start" :disabled="tipos.length >= 12" @click="agregarTipo(); abiertoTipo = tipos.length - 1"><Plus :size="18" aria-hidden="true" />Agregar tipo de visita</button>
        <div class="flex flex-wrap gap-2">
          <button class="btn flex-none" :disabled="guardando === 'tipos'"><Save :size="18" aria-hidden="true" />Guardar</button>
          <button type="button" class="btn-borde flex-none" @click="restablecer('tipos', 'Tipos de visita y checklists')"><RotateCcw :size="18" aria-hidden="true" />Valores de fábrica</button>
        </div>
      </form>
    </section>
  </div>
</template>
