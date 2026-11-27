<script setup>
import Cargando from './Cargando.vue'
import { confirmar } from '../composables/useConfirmar'
import { ref, computed, onMounted } from 'vue'
import { useFotos } from '../composables/useFotos'
import { useAuth } from '../composables/useAuth'
import { Camera, CloudUpload, X } from 'lucide-vue-next'

const props = defineProps({ visitaId: { type: String, required: true }, puedeSubir: Boolean })

const { lista, cargar, subir, eliminar, obtener } = useFotos()
const { usuario, puedeAgendar } = useAuth() // superadmin y admin borran cualquier foto de la empresa

const fotos = computed(() => lista(props.visitaId))
const cargando = ref(true)
const progreso = ref('')
const error = ref('')
const visor = ref(null) // { foto, src }
const cargandoVisor = ref(false)

const puedeBorrar = (f) => puedeAgendar.value || f.autor === usuario.value.usuario
const kb = (bytes) => `${Math.round(bytes / 1024)} KB`

onMounted(async () => {
  try {
    await cargar(props.visitaId)
  } catch (e) {
    error.value = e.message
  } finally {
    cargando.value = false
  }
})

async function elegir(e) {
  const archivos = [...e.target.files]
  e.target.value = '' // permite volver a elegir el mismo archivo
  error.value = ''
  const fallos = []
  let ahorro = []
  for (const [i, file] of archivos.entries()) {
    progreso.value = `Subiendo ${i + 1} de ${archivos.length}…`
    try {
      ahorro.push(`${kb(file.size)} a ${kb(await subir(props.visitaId, file))}`)
    } catch (err) {
      fallos.push(`${file.name}: ${err.message}`)
    }
  }
  progreso.value = ahorro.length ? `Listo. Tamaño reducido: ${ahorro.join(' · ')}` : ''
  if (fallos.length) error.value = fallos.join('\n')
}

async function abrir(foto) {
  visor.value = { foto, src: foto.mini }
  cargandoVisor.value = true
  try {
    visor.value = { foto, src: await obtener(foto.id) }
  } catch (e) {
    error.value = e.message
    visor.value = null
  } finally {
    cargandoVisor.value = false
  }
}

async function borrar() {
  if (!(await confirmar({ titulo: '¿Eliminar esta foto?', texto: 'Irá a la papelera de Drive.', confirmar: 'Eliminar', peligro: true }))) return
  try {
    await eliminar(props.visitaId, visor.value.foto.id)
    visor.value = null
  } catch (e) {
    error.value = e.message
  }
}
</script>

<template>
  <section class="grid gap-2 border-t border-brand-100 pt-3">
    <h3 class="font-semibold text-brand-800">Fotos ({{ fotos.length }})</h3>

    <Cargando v-if="cargando" class="!py-2 text-sm" texto="Cargando fotos…" />
    <p v-else-if="!fotos.length" class="text-sm text-brand-700/70">Aún no hay fotos.</p>

    <ul v-if="fotos.length" class="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
      <li v-for="f in fotos" :key="f.id">
        <button class="relative block aspect-square w-full overflow-hidden rounded-xl bg-brand-100" @click="abrir(f)">
          <img :src="f.mini" :alt="f.nombre" class="size-full object-cover" loading="lazy" />
          <span v-if="f._pendiente" class="absolute right-1 bottom-1 rounded-full bg-white/90 p-1 text-brand-700"><CloudUpload :size="14" aria-label="Sin enviar" /></span>
        </button>
      </li>
    </ul>

    <template v-if="puedeSubir">
      <label class="btn-borde min-h-12 flex-none cursor-pointer sm:justify-self-start" :class="{ 'pointer-events-none opacity-60': progreso.startsWith('Subiendo') }">
        <Camera :size="20" aria-hidden="true" />
        Agregar fotos
        <input type="file" accept="image/*" multiple class="sr-only" :disabled="progreso.startsWith('Subiendo')" @change="elegir" />
      </label>
      <p class="text-xs text-brand-700/70">Las fotos se reducen automáticamente antes de subirse y se guardan en Drive.</p>
    </template>

    <p v-if="progreso" class="text-sm text-brand-700">{{ progreso }}</p>
    <p v-if="error" class="aviso-error whitespace-pre-line">{{ error }}</p>
  </section>

  <!-- Visor a pantalla completa -->
  <div v-if="visor" class="fixed inset-0 z-30 flex flex-col bg-black/95 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]" @click.self="visor = null">
    <div class="flex items-center justify-between p-3 text-white">
      <span class="truncate text-sm">{{ visor.foto.nombre }}</span>
      <button class="flex min-h-11 min-w-11 items-center justify-center" aria-label="Cerrar" @click="visor = null">
        <X :size="26" aria-hidden="true" />
      </button>
    </div>
    <div class="relative flex min-h-0 flex-1 items-center justify-center p-2" @click.self="visor = null">
      <img :src="visor.src" :alt="visor.foto.nombre" class="max-h-full max-w-full object-contain" :class="{ 'blur-sm': cargandoVisor }" />
      <span v-if="cargandoVisor" class="absolute text-sm text-white">Cargando…</span>
    </div>
    <div class="flex items-center justify-between gap-2 p-3 text-sm text-brand-200">
      <span>Subida por {{ visor.foto.autor }}</span>
      <button v-if="puedeBorrar(visor.foto)" class="btn-peligro min-h-11 flex-none bg-white" @click="borrar">Eliminar</button>
    </div>
  </div>
</template>
