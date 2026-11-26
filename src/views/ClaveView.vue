<script setup>
import { ref } from 'vue'
import { useAuth } from '../composables/useAuth'
import { validarClave } from '../utils'
import CampoClave from '../components/CampoClave.vue'
import MarcaEmpresa from '../components/MarcaEmpresa.vue'
import { useConfiguracion } from '../composables/useConfiguracion'

// obligatorio = pantalla completa tras un login con clave temporal (no se puede omitir)
const props = defineProps({ obligatorio: Boolean })
const emit = defineEmits(['listo'])

const { usuario, cambiarMiClave, logout } = useAuth()
const actual = ref('')
const nueva = ref('')
const repetir = ref('')
const error = ref('')
const cargando = ref(false)

async function guardar() {
  error.value = validarClave(nueva.value, usuario.value.usuario)
  if (!error.value && nueva.value !== repetir.value) error.value = 'Las claves nuevas no coinciden'
  if (!error.value && nueva.value === actual.value) error.value = 'La nueva clave debe ser distinta a la actual'
  if (error.value) return

  cargando.value = true
  try {
    await cambiarMiClave(actual.value, nueva.value)
    emit('listo')
  } catch (e) {
    error.value = e.message
  } finally {
    cargando.value = false
  }
}
const { fondoIngreso } = useConfiguracion()
</script>

<template>
  <div :style="obligatorio ? fondoIngreso : null" :class="obligatorio ? 'flex min-h-dvh flex-col px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-8' : ''">
    <div :class="obligatorio ? 'my-auto w-full max-w-sm self-center' : ''">
      <MarcaEmpresa v-if="obligatorio" class="mb-6" />

      <form class="tarjeta grid gap-3.5 p-5" @submit.prevent="guardar">
        <h2 class="text-lg font-bold text-brand-900">{{ obligatorio ? 'Crea tu clave personal' : 'Cambiar mi clave' }}</h2>
        <p v-if="obligatorio" class="rounded-xl bg-brand-100 px-3 py-2 text-sm text-brand-800">
          Estás usando una clave temporal. Por seguridad debes cambiarla para continuar.
        </p>

        <label class="etiqueta">Clave actual
          <CampoClave v-model="actual" autocomplete="current-password" required />
        </label>
        <label class="etiqueta">Clave nueva
          <CampoClave v-model="nueva" autocomplete="new-password" required />
        </label>
        <label class="etiqueta">Repite la clave nueva
          <CampoClave v-model="repetir" autocomplete="new-password" required />
        </label>
        <p class="text-xs text-brand-700/80">Mínimo 10 caracteres, con letras y números, y sin tu nombre de usuario. Al cambiarla se cierran tus otras sesiones.</p>

        <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
        <button class="btn-acento" :disabled="cargando">{{ cargando ? 'Guardando…' : 'Guardar clave' }}</button>
        <button v-if="obligatorio" type="button" class="min-h-11 text-sm font-semibold text-brand-700" @click="logout">Salir</button>
      </form>
    </div>
  </div>
</template>
