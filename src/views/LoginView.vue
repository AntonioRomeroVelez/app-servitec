<script setup>
import { ref } from 'vue'
import { useAuth } from '../composables/useAuth'
import { modoDemo } from '../api'
import CampoClave from '../components/CampoClave.vue'
import MarcaEmpresa from '../components/MarcaEmpresa.vue'
import { APP } from '../app'

const { login } = useAuth()
const usuario = ref('')
const clave = ref('')
const error = ref('')
const cargando = ref(false)

async function entrar() {
  error.value = ''
  cargando.value = true
  try {
    await login(usuario.value, clave.value)
  } catch (e) {
    error.value = e.message
  } finally {
    cargando.value = false
  }
}
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-gradient-to-b from-brand-900 via-brand-700 to-brand-500 px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-8">
    <div class="my-auto w-full max-w-sm self-center">
      <MarcaEmpresa grande class="mb-8" />

      <form class="tarjeta grid gap-4 p-5" @submit.prevent="entrar">
        <h1 class="text-lg font-bold text-brand-900">Iniciar sesión</h1>
        <label class="etiqueta">Usuario
          <input v-model="usuario" class="campo" autocomplete="username" autocapitalize="none" required />
        </label>
        <label class="etiqueta">Clave
          <CampoClave v-model="clave" autocomplete="current-password" required />
        </label>
        <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
        <button class="btn-acento" :disabled="cargando">{{ cargando ? 'Entrando…' : 'Entrar' }}</button>
      </form>

      <p class="mt-6 text-center text-xs text-white/80"><b class="font-semibold">{{ APP.nombre }}</b> · {{ APP.lema }}</p>

      <p v-if="modoDemo" class="mt-4 rounded-xl bg-white/15 p-3 text-center text-xs text-white">
        Modo demo · <b>superadmin</b> / superadmin123 · <b>admin</b> / admin123 · <b>tecnico</b> / tecnico123
      </p>
    </div>
  </div>
</template>
