<script setup>
import { reactive, ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { Building2, Palette, FileText, ListChecks, ImagePlus, Trash2, RotateCcw, Save, ArrowUp, ArrowDown, Plus, Check, ChevronDown, ChevronUp, ChevronRight, ArrowLeft, FileDown, Loader, CircleAlert, Wand2 } from 'lucide-vue-next'
import { useToast } from '../composables/useToast'
import { confirmar } from '../composables/useConfirmar'
import { useConfiguracion } from '../composables/useConfiguracion'
import { TEMAS_PREDEFINIDOS, contraste } from '../tema'
import { procesarLogo, procesarFondo } from '../imagen'
import { coloresDeLogo } from '../colores'
import VistaPreviaMarca from '../components/VistaPreviaMarca.vue'
import { clonar } from '../configuracion'
import { descargarEjemplo } from '../informeEjemplo'

// Ajustes de la empresa (solo su superadministrador): una portada con una tarjeta por sección y cada sección en su propia
// pantalla. Cada una se guarda por separado y se aplica a todos los usuarios de la empresa.
const props = defineProps({ solicitud: Object }) // desde el menú: { seccion } abre esa sección ('portada' = inicio)
const C = useConfiguracion()
const toast = useToast()
const cfg = computed(() => C.config.value)
const logoActual = computed(() => cfg.value.logo)

const abierta = ref('') // '' = portada
watch(
  () => props.solicitud,
  (s) => s?.seccion && (abierta.value = s.seccion === 'portada' ? '' : s.seccion),
  { immediate: true },
)
const guardando = ref('')
const aviso = reactive({ seccion: '', texto: '', error: false })

const empresa = reactive({})
const tema = reactive({})
const informes = reactive({})
const tipos = ref([])
const nuevas = reactive({ logo: '', logoClaro: '', fondoImagen: '' }) // imágenes elegidas y reducidas, todavía sin guardar

// Copia de trabajo = lo guardado (se vuelve a llenar tras guardar o restablecer)
function cargarCopias() {
  Object.assign(empresa, clonar(cfg.value.empresa))
  Object.assign(tema, clonar(cfg.value.tema))
  Object.assign(informes, clonar(cfg.value.informes))
  tipos.value = clonar(cfg.value.tipos)
}
cargarCopias()

const mostrar = (seccion, texto, error = false) => {
  Object.assign(aviso, { seccion, texto, error })
  error ? toast.error(texto) : toast.exito(texto)
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
const restablecer = async (seccion, nombre) => {
  if (!(await confirmar({ titulo: `¿Volver a los valores de fábrica en "${nombre}"?`, texto: 'Se pierde lo personalizado en esta sección.', confirmar: 'Restablecer', peligro: true }))) return
  ejecutar(seccion, () => C.restablecer(seccion), 'Se restablecieron los valores de fábrica.')
}

// ---------- Colores: vista previa en vivo ----------
const HEX = /^#[0-9a-f]{6}$/i
const coloresValidos = computed(() => HEX.test(tema.primario) && HEX.test(tema.acento) && (!tema.encabezado || HEX.test(tema.encabezado)))
const primarioLegible = computed(() => HEX.test(tema.primario) && contraste(tema.primario, '#ffffff') >= 4.5)
const encabezadoLegible = computed(() => !tema.encabezado || (HEX.test(tema.encabezado) && contraste(tema.encabezado, '#ffffff') >= 4.5))
const temaAplicable = () => ({
  primario: tema.primario.toLowerCase(),
  acento: tema.acento.toLowerCase(),
  encabezado: encabezadoLegible.value ? String(tema.encabezado || '').toLowerCase() : cfg.value.tema.encabezado,
  fondo: tema.fondo,
})

watch(
  () => [tema.primario, tema.acento, tema.encabezado],
  () => {
    if (coloresValidos.value && primarioLegible.value) C.vistaPrevia(temaAplicable())
  },
)
onBeforeUnmount(() => C.cancelarVistaPrevia()) // lo no guardado no se queda aplicado al salir

const elegirTema = (t) => Object.assign(tema, { primario: t.primario, acento: t.acento, encabezado: '' })
const colorPropio = (activar) => (tema.encabezado = activar ? tema.primario : '')

async function usarColoresDelLogo() {
  try {
    Object.assign(tema, await coloresDeLogo(nuevas.logo || logoActual.value), { encabezado: '' })
    toast.info('Colores tomados del logo. Revisa la vista previa y pulsa Guardar.')
  } catch (e) {
    toast.error(e.message)
  }
}

const FONDOS = [
  { id: 'degradado', texto: 'Degradado' },
  { id: 'solido', texto: 'Color sólido' },
  { id: 'foto', texto: 'Foto' },
]

// ---------- Imágenes: logos y foto de ingreso ----------
const IMAGENES = [
  { clave: 'logo', titulo: 'Logo', procesar: procesarLogo, usar: 'Usar este logo', ayuda: 'Aparece en el PDF de los informes y, si no hay uno para fondos oscuros, en el ingreso y el menú. Un fondo transparente se ve mejor.' },
  { clave: 'logoClaro', titulo: 'Logo para fondos oscuros (opcional)', procesar: procesarLogo, usar: 'Usar este logo', oscuro: true, ayuda: 'Una versión clara o blanca de tu logo, para la pantalla de ingreso y el menú.' },
  { clave: 'fondoImagen', titulo: 'Foto de la pantalla de ingreso (opcional)', procesar: procesarFondo, usar: 'Usar esta foto', ayuda: 'Se reduce bastante y se muestra oscurecida detrás del formulario. Elige "Foto" en Fondo del ingreso y guarda.' },
]

async function elegirImagen(e, imagen) {
  const archivo = e.target.files[0]
  e.target.value = ''
  if (!archivo) return
  try {
    nuevas[imagen.clave] = await imagen.procesar(archivo)
    mostrar('', '')
  } catch (err) {
    nuevas[imagen.clave] = ''
    mostrar('tema', err.message, true)
  }
}
async function usarImagen(clave) {
  const pendiente = { ...tema } // guardar una imagen no debe borrar los colores que se estaban editando
  await guardar(clave, { [clave]: nuevas[clave] })
  Object.assign(tema, pendiente)
  if (!aviso.error) nuevas[clave] = ''
}
async function quitarImagen(clave) {
  const pendiente = { ...tema }
  await guardar(clave, { [clave]: '' })
  Object.assign(tema, pendiente)
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

// ---------- Portada y navegación entre secciones ----------
const SECCIONES = [
  { id: 'empresa', titulo: 'Datos de la empresa', icono: Building2, resumen: () => [cfg.value.empresa.nombre, cfg.value.empresa.telefono].filter(Boolean).join(' · ') },
  { id: 'tema', titulo: 'Colores y logo', icono: Palette, resumen: () => (cfg.value.logo ? 'Con logo' : 'Sin logo') },
  { id: 'informes', titulo: 'Informes', icono: FileText, resumen: () => `Número ${cfg.value.informes.prefijo}` },
  { id: 'tipos', titulo: 'Tipos de visita y checklists', icono: ListChecks, resumen: () => `${cfg.value.tipos.length} ${cfg.value.tipos.length === 1 ? 'tipo' : 'tipos'}` },
]
const actual = computed(() => SECCIONES.find((s) => s.id === abierta.value))
const distinto = (a, b) => JSON.stringify(a) !== JSON.stringify(b)
const sinGuardar = () =>
  distinto({ ...empresa }, cfg.value.empresa) || distinto({ ...tema }, cfg.value.tema) || distinto({ ...informes }, cfg.value.informes) || distinto(tipos.value, cfg.value.tipos) || Object.values(nuevas).some(Boolean)

function entrar(id) {
  abierta.value = id
  window.scrollTo(0, 0)
}
async function volver() {
  if (sinGuardar()) {
    if (!(await confirmar({ titulo: '¿Salir sin guardar?', texto: 'Los cambios de esta sección se descartan.', confirmar: 'Descartar', peligro: true }))) return
    cargarCopias()
    Object.assign(nuevas, { logo: '', logoClaro: '', fondoImagen: '' })
    C.cancelarVistaPrevia()
  }
  entrar('')
}

// ---------- Vista previa del informe (con lo que se está editando) ----------
const preparando = ref(false)
async function verEjemplo() {
  preparando.value = true
  try {
    await descargarEjemplo({ empresa, tema: coloresValidos.value ? tema : cfg.value.tema, informes, tipos: tipos.value }, nuevas.logo || logoActual.value)
    toast.exito('Informe de ejemplo descargado.')
  } catch (e) {
    toast.error(e.message || 'No se pudo generar el ejemplo')
  } finally {
    preparando.value = false
  }
}
</script>

<template>
  <div class="grid gap-3">
    <!-- Portada -->
    <template v-if="!abierta">
      <p class="text-sm text-brand-700">Todo lo que cambies aquí lo verán los usuarios de la empresa.</p>
      <ul class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <li v-for="s in SECCIONES" :key="s.id">
          <button class="tarjeta flex h-full min-h-20 w-full items-center gap-3 text-left active:bg-brand-50" @click="entrar(s.id)">
            <span class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700"><component :is="s.icono" :size="22" aria-hidden="true" /></span>
            <span class="grid min-w-0 flex-1">
              <b class="text-brand-900">{{ s.titulo }}</b>
              <span class="truncate text-sm text-brand-700">{{ s.resumen() }}</span>
              <span v-if="s.id === 'tema'" class="mt-1 flex items-center gap-1.5">
                <span class="size-4 rounded-full border border-black/10" :style="{ background: cfg.tema.primario }" />
                <span class="size-4 rounded-full border border-black/10" :style="{ background: cfg.tema.acento }" />
              </span>
            </span>
            <img v-if="s.id === 'tema' && logoActual" :src="logoActual" alt="" class="max-h-10 max-w-16 object-contain" />
            <ChevronRight :size="20" class="shrink-0 text-brand-400" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </template>

    <div v-else class="flex items-center gap-2">
      <button type="button" class="btn-borde min-h-10 flex-none text-sm" @click="volver"><ArrowLeft :size="18" aria-hidden="true" />Ajustes</button>
      <h2 class="min-w-0 truncate font-semibold text-brand-900">{{ actual?.titulo }}</h2>
    </div>

    <button v-if="abierta !== 'tipos'" type="button" class="btn-borde min-h-11 flex-none self-start justify-self-start" :disabled="preparando" @click="verEjemplo">
      <Loader v-if="preparando" :size="18" class="animate-spin" aria-hidden="true" />
      <FileDown v-else :size="18" aria-hidden="true" />
      Ver un informe de ejemplo (PDF)
    </button>

    <!-- Datos de la empresa -->
    <section v-if="abierta === 'empresa'" class="tarjeta p-0">
      <form class="grid gap-3 p-4" @submit.prevent="guardar('empresa', { ...empresa })">
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
    <section v-if="abierta === 'tema'" class="tarjeta p-0">
      <div class="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <div class="grid gap-4">
          <!-- Imágenes -->
          <div v-for="(im, n) in IMAGENES" :key="im.clave" class="grid gap-2" :class="n ? 'border-t border-brand-100 pt-4' : ''">
            <h3 class="font-semibold text-brand-800">{{ im.titulo }}</h3>
            <div class="flex flex-wrap items-center gap-3">
              <span class="flex h-20 min-w-32 items-center justify-center rounded-xl border border-dashed border-brand-300 px-3" :class="im.oscuro ? 'bg-encabezado' : 'bg-white'">
                <img v-if="nuevas[im.clave] || cfg[im.clave]" :src="nuevas[im.clave] || cfg[im.clave]" :alt="im.titulo" class="max-h-16 max-w-48 object-contain" />
                <span v-else class="text-sm" :class="im.oscuro ? 'text-white/70' : 'text-brand-700/60'">Sin imagen</span>
              </span>
              <div class="flex flex-wrap gap-2">
                <label class="btn-borde min-h-11 flex-none cursor-pointer text-sm">
                  <ImagePlus :size="18" aria-hidden="true" />
                  Elegir imagen
                  <input type="file" :accept="im.clave === 'fondoImagen' ? 'image/png,image/jpeg,image/webp' : 'image/png,image/jpeg,image/webp,image/svg+xml'" class="sr-only" @change="elegirImagen($event, im)" />
                </label>
                <button v-if="cfg[im.clave] && !nuevas[im.clave]" type="button" class="btn-peligro min-h-11 flex-none text-sm" :disabled="guardando === im.clave" @click="quitarImagen(im.clave)">
                  <Trash2 :size="18" aria-hidden="true" />Quitar
                </button>
              </div>
            </div>
            <div v-if="nuevas[im.clave]" class="flex flex-wrap gap-2">
              <button type="button" class="btn flex-none" :disabled="guardando === im.clave" @click="usarImagen(im.clave)"><Save :size="18" aria-hidden="true" />{{ im.usar }}</button>
              <button type="button" class="btn-borde flex-none" @click="nuevas[im.clave] = ''">Cancelar</button>
            </div>
            <p class="text-xs text-brand-700/80">{{ im.ayuda }}</p>
          </div>

          <!-- Colores y fondo -->
          <form class="grid gap-3 border-t border-brand-100 pt-4" @submit.prevent="guardar('tema', { ...tema })">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 class="font-semibold text-brand-800">Colores</h3>
              <button v-if="nuevas.logo || logoActual" type="button" class="btn-borde min-h-10 flex-none text-sm" @click="usarColoresDelLogo"><Wand2 :size="16" aria-hidden="true" />Tomar colores del logo</button>
            </div>
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
              <label class="etiqueta">Color principal (botones)
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
            <label class="flex min-h-11 items-center gap-3 text-sm font-medium text-brand-800">
              <input type="checkbox" class="size-5 accent-brand-600" :checked="!!tema.encabezado" @change="colorPropio($event.target.checked)" />
              Elegir un color propio para el encabezado y el menú
            </label>
            <label v-if="tema.encabezado" class="etiqueta">Color del encabezado y el menú
              <span class="flex gap-2">
                <input v-model="tema.encabezado" type="color" class="h-11 w-14 shrink-0 cursor-pointer rounded-xl border border-brand-200 bg-white p-1" aria-label="Elegir color del encabezado" />
                <input v-model="tema.encabezado" class="campo" maxlength="7" autocapitalize="none" spellcheck="false" aria-label="Código del color del encabezado" />
              </span>
            </label>
            <fieldset class="grid gap-2">
              <legend class="mb-1 text-sm font-medium text-brand-800">Fondo del ingreso</legend>
              <div class="flex flex-wrap gap-2">
                <label v-for="o in FONDOS" :key="o.id" class="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border bg-white px-3 text-sm" :class="tema.fondo === o.id ? 'border-brand-600 ring-2 ring-brand-300' : 'border-brand-200'">
                  <input v-model="tema.fondo" type="radio" name="fondo" :value="o.id" class="accent-brand-600" />{{ o.texto }}
                </label>
              </div>
              <p v-if="tema.fondo === 'foto' && !cfg.fondoImagen && !nuevas.fondoImagen" class="text-xs text-brand-700">Sube la foto arriba; mientras no haya una se verá el degradado.</p>
            </fieldset>
            <p v-if="!coloresValidos" class="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><CircleAlert :size="16" aria-hidden="true" />Los colores deben tener el formato #RRGGBB.</p>
            <p v-else-if="!primarioLegible" class="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><CircleAlert :size="16" aria-hidden="true" />El color principal es demasiado claro: el texto blanco no se leería. Elige uno más oscuro.</p>
            <p v-else-if="!encabezadoLegible" class="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><CircleAlert :size="16" aria-hidden="true" />El color del encabezado es demasiado claro: el texto blanco no se leería. Elige uno más oscuro.</p>
            <div class="flex flex-wrap gap-2">
              <button class="btn flex-none" :disabled="guardando === 'tema' || !coloresValidos || !primarioLegible || !encabezadoLegible"><Save :size="18" aria-hidden="true" />Guardar colores y fondo</button>
              <button type="button" class="btn-borde flex-none" @click="restablecer('tema', 'Colores')"><RotateCcw :size="18" aria-hidden="true" />Valores de fábrica</button>
            </div>
          </form>
        </div>

        <VistaPreviaMarca
          class="border-t border-brand-100 pt-4 lg:sticky lg:top-20 lg:border-t-0 lg:pt-0"
          :empresa="cfg.empresa"
          :tema="tema"
          :logo="nuevas.logo || cfg.logo"
          :logo-claro="nuevas.logoClaro || cfg.logoClaro"
          :fondo-imagen="nuevas.fondoImagen || cfg.fondoImagen"
        />
      </div>
    </section>

    <!-- Informes -->
    <section v-if="abierta === 'informes'" class="tarjeta p-0">
      <form class="grid gap-3 p-4" @submit.prevent="guardar('informes', { ...informes })">
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
    <section v-if="abierta === 'tipos'" class="tarjeta p-0">
      <form class="grid gap-3 p-4" @submit.prevent="guardar('tipos', { tipos })">
        <p class="text-sm text-brand-700">Los tipos aparecen al agendar visitas y crear informes; los primeros ítems de cada checklist se muestran como ejemplo en las actividades del informe. Cambiarlos no modifica lo ya registrado.</p>
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
