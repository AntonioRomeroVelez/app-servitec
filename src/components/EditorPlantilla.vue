<script setup>
import { reactive, ref, computed, watch, nextTick } from 'vue'
import { ArrowDown, ArrowUp, Bold, Braces, CircleAlert, Code, Copy, Eye, Italic, List, Pencil, Plus, Quote, Smile, Strikethrough, Trash2 } from 'lucide-vue-next'
import VistaPreviaWhatsapp from './VistaPreviaWhatsapp.vue'
import { useConfiguracion } from '../composables/useConfiguracion'
import { useSinGuardar } from '../composables/useSinGuardar'
import { confirmar } from '../composables/useConfirmar'
import { BLOQUES_LISTOS, GRUPOS_VARIABLES, MODELOS_MENSAJE, TIPOS_PLANTILLA, VARIABLES, MAX_MENSAJE, aBloques, aplicarFormato, deBloques, limpiarMensaje, renderizar, valoresDeEjemplo, variablesDesconocidas } from '../whatsapp'

// Alta y edición de una plantilla. El mensaje se arma por bloques (que se mueven, duplican y quitan) o como texto
// completo; hay formato de WhatsApp, datos de la visita, emojis, modelos de partida y vista previa al instante.
// En el celular se alterna entre «Editar» y «Vista previa»; en computadora se ven a la vez.
const props = defineProps({ inicial: { type: Object, required: true }, guardando: Boolean })
const emit = defineEmits(['guardar', 'cancelar'])
const { config } = useConfiguracion()

const form = reactive({ nombre: props.inicial.nombre, tipo: props.inicial.tipo, mensaje: props.inicial.mensaje, activa: props.inicial.activa, predeterminada: props.inicial.predeterminada })
const original = JSON.stringify(form)
const salir = useSinGuardar(() => JSON.stringify(form) !== original)
const cancelar = async () => (await salir()) && emit('cancelar')
defineExpose({ cancelar })

const pantalla = ref('editar') // solo importa en el celular: 'editar' | 'vista'
const formulario = ref(null)
// Cada pantalla se muestra desde arriba
watch(pantalla, () => formulario.value?.parentElement?.scrollTo(0, 0))
const modo = ref('bloques') // 'bloques' | 'texto'

// ---------- Bloques ----------
let clave = 0
const nuevoBloque = (texto) => ({ k: ++clave, texto })
const bloques = ref([])
const separar = () => (bloques.value = aBloques(form.mensaje).map(nuevoBloque))
separar()
const unir = () => (form.mensaje = deBloques(bloques.value.map((b) => b.texto)))

function cambiarModo(m) {
  if (m === 'bloques') separar()
  modo.value = m
  activo.value = null
}
function mover(i, paso) {
  const [b] = bloques.value.splice(i, 1)
  bloques.value.splice(i + paso, 0, b)
  unir()
}
function duplicar(i) {
  bloques.value.splice(i + 1, 0, nuevoBloque(bloques.value[i].texto))
  unir()
}
async function quitar(i) {
  if (bloques.value[i].texto.trim() && !(await confirmar({ titulo: '¿Quitar este bloque?', texto: bloques.value[i].texto.slice(0, 120), confirmar: 'Quitar', peligro: true }))) return
  bloques.value.splice(i, 1)
  if (!bloques.value.length) bloques.value.push(nuevoBloque(''))
  unir()
}
async function agregar(listo) {
  // Se agrega debajo del bloque en el que se está escribiendo; si no hay ninguno, al final
  const i = bloques.value.findIndex((b) => b.k === activo.value)
  const b = nuevoBloque(listo.contenido)
  bloques.value.splice(i < 0 ? bloques.value.length : i + 1, 0, b)
  unir()
  await nextTick()
  campos.get(b.k)?.focus()
}
// Alto de cada casilla según lo escrito
const filas = (texto) => Math.min(14, texto.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 42)), 0))

async function usarModelo(e) {
  const m = MODELOS_MENSAJE.find((x) => x.id === e.target.value)
  e.target.value = ''
  if (!m) return
  if (form.mensaje.trim() && form.mensaje !== m.mensaje && !(await confirmar({ titulo: `¿Usar el modelo «${m.texto}»?`, texto: 'Reemplaza el mensaje que tienes escrito.', confirmar: 'Reemplazar', peligro: true }))) return
  form.mensaje = m.mensaje
  separar()
}

// ---------- Escritura en la casilla activa: formato, datos y emojis ----------
const campos = new Map() // clave del bloque (o 'texto') -> textarea
const registrar = (k, el) => (el ? campos.set(k, el) : campos.delete(k))
const activo = ref(null)

async function escribir(transformar) {
  const k = modo.value === 'texto' ? 'texto' : (bloques.value.find((b) => b.k === activo.value) ?? bloques.value.at(-1)).k
  const el = campos.get(k)
  if (!el) return
  const r = transformar(el.value, el.selectionStart, el.selectionEnd)
  if (k === 'texto') form.mensaje = r.texto
  else {
    bloques.value.find((b) => b.k === k).texto = r.texto
    unir()
  }
  await nextTick()
  el.focus()
  el.setSelectionRange(r.desde, r.hasta)
}
const formato = (tipo) => escribir((t, a, b) => aplicarFormato(t, a, b, tipo))
const insertar = (nuevo) => escribir((t, a, b) => ({ texto: t.slice(0, a) + nuevo + t.slice(b), desde: a + nuevo.length, hasta: a + nuevo.length }))

const FORMATOS = [
  { id: 'negrita', texto: 'Negrita', icono: Bold },
  { id: 'cursiva', texto: 'Cursiva', icono: Italic },
  { id: 'tachado', texto: 'Tachado', icono: Strikethrough },
  { id: 'fijo', texto: 'Ancho fijo', icono: Code },
  { id: 'lista', texto: 'Lista', icono: List },
  { id: 'cita', texto: 'Cita', icono: Quote },
]
// Emojis para el contenido del mensaje (no son iconos de la app)
const EMOJIS = ['👋', '😊', '🙏', '👍', '✅', '❗', '⚠️', 'ℹ️', '📅', '🕒', '⏰', '📍', '🗺️', '📞', '📱', '✉️', '🌐', '🛠️', '🔧', '👨‍🔧', '👷', '📝', '📋', '📷', '🔒', '💡', '🚗', '🏠', '🏢', '💳', '⭐', '🎉']
const panel = ref('') // '' | 'datos' | 'emojis'
const alternar = (p) => (panel.value = panel.value === p ? '' : p)
const token = (id) => `{{${id}}}`

// ---------- Vista previa ----------
const sinOpcionales = ref(false) // ver cómo queda cuando faltan la descripción y los datos del técnico
const valores = computed(() => {
  const v = valoresDeEjemplo(config.value)
  if (sinOpcionales.value) for (const x of VARIABLES) if (['servicio_descripcion', 'tecnico_nombre', 'tecnico_telefono'].includes(x.id)) v[x.id] = ''
  return v
})
const vista = computed(() => renderizar(form.mensaje, valores.value))
const raras = computed(() => variablesDesconocidas(form.mensaje))
const largo = computed(() => limpiarMensaje(form.mensaje).length)
const problema = computed(() => {
  if (raras.value.length) return `Datos que no existen: ${raras.value.map(token).join(', ')}`
  if (largo.value > MAX_MENSAJE) return `El mensaje es demasiado largo: sobran ${largo.value - MAX_MENSAJE} caracteres.`
  return ''
})
const enviar = () => !problema.value && largo.value && emit('guardar', { ...form, mensaje: limpiarMensaje(form.mensaje) })

const pestana = (si) => (si ? 'bg-brand-600 text-white' : 'text-brand-700')
</script>

<template>
  <form ref="formulario" @submit.prevent="enviar">
    <div class="sticky -top-4 z-10 -mx-4 -mt-4 bg-brand-50 px-4 py-2 lg:hidden">
      <div class="flex rounded-xl border border-brand-200 bg-white p-1 text-sm font-semibold" role="tablist" aria-label="Editar o ver el mensaje">
        <button type="button" role="tab" :aria-selected="pantalla === 'editar'" class="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg" :class="pestana(pantalla === 'editar')" @click="pantalla = 'editar'"><Pencil :size="16" aria-hidden="true" />Editar</button>
        <button type="button" role="tab" :aria-selected="pantalla === 'vista'" class="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg" :class="pestana(pantalla === 'vista')" @click="pantalla = 'vista'"><Eye :size="16" aria-hidden="true" />Vista previa</button>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
      <div class="grid min-w-0 content-start gap-4" :class="{ 'max-lg:hidden': pantalla !== 'editar' }">
        <section class="tarjeta grid gap-3 sm:grid-cols-2">
          <label class="etiqueta">Nombre
            <input v-model="form.nombre" class="campo" required maxlength="60" placeholder="Ej.: Confirmación de cita" />
          </label>
          <label class="etiqueta">Tipo de notificación
            <select v-model="form.tipo" class="campo">
              <option v-for="t in TIPOS_PLANTILLA" :key="t.id" :value="t.id">{{ t.texto }}</option>
            </select>
          </label>
          <label class="flex min-h-11 items-center gap-2.5 text-sm text-brand-900">
            <input v-model="form.activa" type="checkbox" class="size-5 shrink-0 accent-brand-600" @change="!form.activa && (form.predeterminada = false)" />
            Activo (los administradores pueden usarlo)
          </label>
          <label class="flex min-h-11 items-center gap-2.5 text-sm text-brand-900">
            <input v-model="form.predeterminada" type="checkbox" class="size-5 shrink-0 accent-brand-600" :disabled="!form.activa" />
            Usar este mensaje para este tipo de aviso
          </label>
        </section>

        <section class="grid gap-2.5" aria-label="Estructura del mensaje">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex rounded-xl border border-brand-200 bg-white p-1 text-sm font-semibold" role="group" aria-label="Forma de editar">
              <button type="button" :aria-pressed="modo === 'bloques'" class="min-h-9 rounded-lg px-3" :class="pestana(modo === 'bloques')" @click="cambiarModo('bloques')">Por bloques</button>
              <button type="button" :aria-pressed="modo === 'texto'" class="min-h-9 rounded-lg px-3" :class="pestana(modo === 'texto')" @click="cambiarModo('texto')">Texto completo</button>
            </div>
            <select class="campo !w-auto text-sm" aria-label="Empezar desde un modelo" value="" @change="usarModelo">
              <option value="">Usar un modelo…</option>
              <option v-for="m in MODELOS_MENSAJE" :key="m.id" :value="m.id">{{ m.texto }}</option>
            </select>
          </div>

          <!-- Herramientas: siempre a la vista mientras se escribe -->
          <div class="sticky top-11 z-[5] grid gap-2 rounded-xl border border-brand-200 bg-white p-1.5 shadow-sm lg:-top-4">
            <div class="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Formato del mensaje">
              <button v-for="f in FORMATOS" :key="f.id" type="button" class="btn-icono !size-10 !border-0" :aria-label="f.texto" :title="f.texto" @mousedown.prevent @click="formato(f.id)">
                <component :is="f.icono" :size="18" aria-hidden="true" />
              </button>
              <button type="button" class="btn-texto !min-h-10 sm:ml-auto" :class="{ 'bg-brand-100': panel === 'datos' }" :aria-expanded="panel === 'datos'" @mousedown.prevent @click="alternar('datos')"><Braces :size="16" aria-hidden="true" />Datos</button>
              <button type="button" class="btn-texto !min-h-10" :class="{ 'bg-brand-100': panel === 'emojis' }" :aria-expanded="panel === 'emojis'" @mousedown.prevent @click="alternar('emojis')"><Smile :size="16" aria-hidden="true" />Emojis</button>
            </div>
            <div v-if="panel === 'datos'" class="grid max-h-52 gap-2 overflow-y-auto border-t border-brand-100 pt-2">
              <div v-for="g in GRUPOS_VARIABLES" :key="g.grupo" class="grid gap-1">
                <span class="text-xs font-semibold text-brand-700">{{ g.grupo }}</span>
                <div class="flex flex-wrap gap-1.5">
                  <button v-for="v in g.variables" :key="v.id" type="button" class="min-h-9 rounded-lg border border-brand-200 px-2.5 text-left text-xs font-medium text-brand-800 active:bg-brand-100" :title="token(v.id)" @mousedown.prevent @click="insertar(token(v.id))">{{ v.texto }}</button>
                </div>
              </div>
            </div>
            <div v-if="panel === 'emojis'" class="flex max-h-40 flex-wrap gap-1 overflow-y-auto border-t border-brand-100 pt-2">
              <button v-for="e in EMOJIS" :key="e" type="button" class="size-10 rounded-lg text-xl active:bg-brand-100" :aria-label="`Insertar ${e}`" @mousedown.prevent @click="insertar(e)">{{ e }}</button>
            </div>
          </div>

          <template v-if="modo === 'bloques'">
            <div v-for="(b, i) in bloques" :key="b.k" class="tarjeta grid gap-1.5 !p-2.5" :class="{ '!border-brand-500': activo === b.k }">
              <div class="flex items-center gap-1">
                <span class="flex-1 px-1 text-xs font-semibold text-brand-700">Bloque {{ i + 1 }}</span>
                <button type="button" class="btn-icono !size-9 !border-0" :disabled="i === 0" :aria-label="`Subir el bloque ${i + 1}`" title="Subir" @click="mover(i, -1)"><ArrowUp :size="16" aria-hidden="true" /></button>
                <button type="button" class="btn-icono !size-9 !border-0" :disabled="i === bloques.length - 1" :aria-label="`Bajar el bloque ${i + 1}`" title="Bajar" @click="mover(i, 1)"><ArrowDown :size="16" aria-hidden="true" /></button>
                <button type="button" class="btn-icono !size-9 !border-0" :aria-label="`Duplicar el bloque ${i + 1}`" title="Duplicar" @click="duplicar(i)"><Copy :size="16" aria-hidden="true" /></button>
                <button type="button" class="btn-icono !size-9 !border-0 !text-red-700" :aria-label="`Quitar el bloque ${i + 1}`" title="Quitar" @click="quitar(i)"><Trash2 :size="16" aria-hidden="true" /></button>
              </div>
              <textarea :ref="(el) => registrar(b.k, el)" v-model="b.texto" :rows="filas(b.texto)" class="campo resize-y" placeholder="Escribe esta parte del mensaje" :aria-label="`Texto del bloque ${i + 1}`" @focus="activo = b.k" @input="unir" />
            </div>
            <div class="grid gap-1.5 rounded-xl border-2 border-dashed border-brand-300 p-2.5">
              <span class="flex items-center gap-1.5 text-sm font-semibold text-brand-800"><Plus :size="16" aria-hidden="true" />Agregar bloque</span>
              <div class="flex flex-wrap gap-1.5">
                <button v-for="l in BLOQUES_LISTOS" :key="l.id" type="button" class="min-h-10 rounded-lg border border-brand-200 bg-white px-3 text-sm font-medium text-brand-800 active:bg-brand-100" @mousedown.prevent @click="agregar(l)">{{ l.texto }}</button>
              </div>
            </div>
          </template>
          <textarea v-else :ref="(el) => registrar('texto', el)" v-model="form.mensaje" rows="16" class="campo" aria-label="Mensaje completo" placeholder="Saludo, cuerpo y despedida" />

          <p class="text-right text-xs" :class="largo > MAX_MENSAJE ? 'font-semibold text-red-700' : 'text-brand-700/70'">{{ largo }} / {{ MAX_MENSAJE }} caracteres</p>
        </section>
      </div>

      <div class="grid min-w-0 content-start gap-2 lg:sticky lg:top-0" :class="{ 'max-lg:hidden': pantalla !== 'vista' }">
        <h3 class="text-sm font-semibold text-brand-900">Así lo recibe el cliente (datos de ejemplo)</h3>
        <VistaPreviaWhatsapp :mensaje="vista" :nombre="config.empresa.nombre" />
        <label class="flex min-h-11 items-center gap-2.5 text-sm text-brand-900">
          <input v-model="sinOpcionales" type="checkbox" class="size-5 shrink-0 accent-brand-600" />
          Ver sin descripción ni técnico (esas líneas se ocultan)
        </label>
      </div>
    </div>

    <div class="pie-fijo">
      <p v-if="problema" class="aviso-error flex items-start gap-2 wrap-anywhere" role="alert"><CircleAlert :size="16" class="mt-0.5 shrink-0" aria-hidden="true" />{{ problema }}</p>
      <div class="flex gap-2.5 sm:justify-end">
        <button type="button" class="btn-borde" @click="cancelar">Cancelar</button>
        <button type="submit" class="btn" :disabled="guardando || !!problema || !largo">{{ guardando ? 'Guardando…' : 'Guardar mensaje' }}</button>
      </div>
    </div>
  </form>
</template>
