<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { Check, CircleAlert } from 'lucide-vue-next'
import { generarUsuario, usuarioValido, motivoCedulaInvalida } from '../utils'

// Campos de una persona (usuario o administrador de una empresa). Edita directamente el objeto `form` de quien lo usa.
// El usuario de ingreso se SUGIERE al escribir los nombres y la cédula (primer nombre + últimos 4 dígitos; si está ocupado se
// agregan letras del apellido) y la persona puede cambiarlo. Con `sugerir` y `disponible` se consulta al servidor, que ve todos
// los usuarios de la plataforma; sin ellos se calcula aquí con `usuariosExistentes`.
const props = defineProps({
  form: { type: Object, required: true },
  roles: { type: Array, default: null }, // si se pasa, se pide el rol
  nuevaCuenta: Boolean, // se va a crear una cuenta: la clave temporal es la cédula (se avisa, no se pide)
  usuariosExistentes: { type: Array, default: () => [] },
  sugerir: { type: Function, default: null }, // async (nombre, cedula) => usuario sugerido
  disponible: { type: Function, default: null }, // async (usuario) => boolean
  editando: Boolean, // al editar el usuario ya existe y no cambia
})

// Aviso de la cédula mientras se escribe: solo cuando ya tiene 10 dígitos o aparece algo que no es número
const avisoCedula = computed(() => {
  const c = String(props.form.cedula || '')
  return c && (c.length >= 10 || /\D/.test(c)) ? motivoCedulaInvalida(c) : ''
})

const manual = ref(false) // la persona escribió su propio usuario: ya no se pisa con la sugerencia
const estado = ref('') // '' | 'libre' | 'ocupado' | 'invalido'
let temporizadorSugerir
let temporizadorDisponible
let ticket = 0 // descarta respuestas viejas

async function revisar(usuario) {
  const mio = ++ticket
  if (!usuario) return (estado.value = '')
  if (!usuarioValido(usuario)) return (estado.value = 'invalido')
  let libre
  try {
    libre = props.disponible ? await props.disponible(usuario) : !props.usuariosExistentes.map((u) => u.toLowerCase()).includes(usuario)
  } catch {
    libre = true // sin respuesta: la base lo valida al crear
  }
  if (mio === ticket) estado.value = libre ? 'libre' : 'ocupado'
}

async function sugerirAhora() {
  const mio = ++ticket
  const { nombre, cedula } = props.form
  const local = generarUsuario(nombre, cedula, props.usuariosExistentes)
  if (!local) {
    props.form.usuario = ''
    return (estado.value = '')
  }
  let u = local
  if (props.sugerir) {
    try {
      u = (await props.sugerir(nombre, cedula)) || local
    } catch {
      u = local
    }
  }
  if (mio !== ticket || manual.value) return
  props.form.usuario = u
  estado.value = 'libre'
}

watch(
  () => [props.form.nombre, props.form.cedula],
  () => {
    if (props.editando || manual.value) return
    clearTimeout(temporizadorSugerir)
    temporizadorSugerir = setTimeout(sugerirAhora, 350)
  },
)

function alEscribirUsuario(valor) {
  manual.value = true
  props.form.usuario = valor.toLowerCase().replace(/\s+/g, '')
  clearTimeout(temporizadorDisponible)
  temporizadorDisponible = setTimeout(() => revisar(props.form.usuario), 300)
}

function usarSugerido() {
  manual.value = false
  sugerirAhora()
}

onBeforeUnmount(() => {
  clearTimeout(temporizadorSugerir)
  clearTimeout(temporizadorDisponible)
})
</script>

<template>
  <div class="grid content-start gap-3 lg:grid-cols-2 lg:items-start lg:gap-x-6">
    <label class="etiqueta lg:col-span-2">Nombres completos
      <input v-model="form.nombre" class="campo" required autocomplete="off" maxlength="120" placeholder="Nombres y apellidos" />
    </label>

    <div class="grid gap-3 sm:grid-cols-2">
      <label class="etiqueta">Cédula
        <input v-model="form.cedula" class="campo" required inputmode="numeric" autocomplete="off" maxlength="10" pattern="[0-9]{10}" title="10 dígitos" :aria-invalid="!!avisoCedula" />
      </label>
      <label class="etiqueta">Teléfono
        <input v-model="form.telefono" class="campo" required type="tel" inputmode="tel" autocomplete="off" maxlength="20" />
      </label>
    </div>

    <p v-if="avisoCedula" class="-mt-1 lg:col-span-2 flex items-start gap-1 text-xs text-red-700" role="alert"><CircleAlert :size="14" class="mt-0.5 shrink-0" aria-hidden="true" />{{ avisoCedula }}</p>

    <div v-if="!editando" class="grid gap-1">
      <label class="etiqueta">Usuario de ingreso
        <input :value="form.usuario" class="campo font-mono" autocapitalize="none" autocomplete="off" spellcheck="false" maxlength="30" placeholder="Se sugiere con el nombre y la cédula" @input="alEscribirUsuario($event.target.value)" />
      </label>
      <p v-if="!form.usuario" class="text-xs text-brand-700/80">Se sugiere: primer nombre + últimos 4 dígitos de la cédula. Puedes cambiarlo.</p>
      <p v-else-if="estado === 'libre'" class="flex items-center gap-1 text-xs text-emerald-700"><Check :size="14" aria-hidden="true" />Disponible · {{ manual ? 'personalizado' : 'sugerido' }}</p>
      <p v-else-if="estado === 'ocupado'" class="flex items-center gap-1 text-xs text-red-700"><CircleAlert :size="14" aria-hidden="true" />Ya está en uso: elige otro.</p>
      <p v-else-if="estado === 'invalido'" class="flex items-center gap-1 text-xs text-red-700"><CircleAlert :size="14" aria-hidden="true" />De 3 a 30 caracteres: letras minúsculas, números, punto, guion o guion bajo.</p>
      <button v-if="manual" type="button" class="enlace justify-self-start" @click="usarSugerido">Usar el sugerido</button>
    </div>

    <label class="etiqueta">Correo
      <input v-model="form.correo" class="campo" required type="email" autocomplete="off" autocapitalize="none" />
    </label>
    <div class="grid gap-3 sm:grid-cols-2">
      <label class="etiqueta">Ciudad
        <input v-model="form.ciudad" class="campo" required autocomplete="off" maxlength="60" />
      </label>
      <label class="etiqueta">Cargo (opcional)
        <input v-model="form.cargo" class="campo" autocomplete="off" maxlength="60" />
      </label>
    </div>
    <label class="etiqueta">Dirección (opcional)
      <input v-model="form.direccion" class="campo" autocomplete="off" maxlength="160" />
    </label>

    <label v-if="roles" class="etiqueta">Rol
      <select v-model="form.rol" class="campo">
        <option v-for="r in roles" :key="r" :value="r">{{ r }}</option>
      </select>
    </label>
    <p v-if="nuevaCuenta" class="lg:col-span-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
      La <b>clave temporal es el número de cédula</b>. La persona entra con su usuario y su cédula, y deberá crear una clave nueva en su primer ingreso.
    </p>
  </div>
</template>
