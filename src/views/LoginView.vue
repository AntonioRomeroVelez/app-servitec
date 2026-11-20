<script setup>
import { ref, reactive } from 'vue'
import { useAuth } from '../composables/useAuth'
import { modoDemo, modoSupabase } from '../api'
import CampoClave from '../components/CampoClave.vue'
import MarcaEmpresa from '../components/MarcaEmpresa.vue'
import { APP } from '../app'

const { login, registrar } = useAuth()
const usuario = ref('')
const clave = ref('')
const error = ref('')
const cargando = ref(false)

// En el SaaS se puede crear una empresa nueva desde esta misma pantalla
const creando = ref(false)
const nueva = reactive({ empresa: '', nombre: '', usuario: '', correo: '', clave: '' })

async function enviar(accion) {
  error.value = ''
  cargando.value = true
  try {
    await accion()
  } catch (e) {
    error.value = e.message
  } finally {
    cargando.value = false
  }
}
const entrar = () => enviar(() => login(usuario.value, clave.value))
const crearEmpresa = () => enviar(() => registrar({ ...nueva, usuario: nueva.usuario.trim().toLowerCase() }))
const alternar = () => {
  creando.value = !creando.value
  error.value = ''
}
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-gradient-to-b from-brand-900 via-brand-700 to-brand-500 px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-8">
    <div class="my-auto w-full max-w-sm self-center">
      <MarcaEmpresa grande class="mb-8" />

      <form v-if="!creando" class="tarjeta grid gap-4 p-5" @submit.prevent="entrar">
        <h1 class="text-lg font-bold text-brand-900">Iniciar sesión</h1>
        <label class="etiqueta">{{ modoSupabase ? 'Correo' : 'Usuario' }}
          <input v-model="usuario" class="campo" :type="modoSupabase ? 'email' : 'text'" autocomplete="username" autocapitalize="none" required />
        </label>
        <label class="etiqueta">Clave
          <CampoClave v-model="clave" autocomplete="current-password" required />
        </label>
        <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
        <button class="btn-acento" :disabled="cargando">{{ cargando ? 'Entrando…' : 'Entrar' }}</button>
        <button v-if="modoSupabase" type="button" class="text-sm font-semibold text-brand-700" @click="alternar">Crear la cuenta de mi empresa</button>
      </form>

      <form v-else class="tarjeta grid gap-3 p-5" @submit.prevent="crearEmpresa">
        <h1 class="text-lg font-bold text-brand-900">Crear mi empresa</h1>
        <label class="etiqueta">Nombre de la empresa
          <input v-model.trim="nueva.empresa" class="campo" autocomplete="organization" required />
        </label>
        <label class="etiqueta">Tu nombre
          <input v-model.trim="nueva.nombre" class="campo" autocomplete="name" required />
        </label>
        <label class="etiqueta">Usuario
          <input v-model="nueva.usuario" class="campo" autocapitalize="none" autocomplete="off" required pattern="[a-z0-9._\-]{3,30}" title="3 a 30 caracteres: letras minúsculas, números, punto, guion o guion bajo" />
        </label>
        <label class="etiqueta">Correo (con él iniciarás sesión)
          <input v-model.trim="nueva.correo" type="email" class="campo" autocomplete="email" autocapitalize="none" required />
        </label>
        <label class="etiqueta">Clave (mínimo 10 caracteres, con letras y números)
          <CampoClave v-model="nueva.clave" autocomplete="new-password" required />
        </label>
        <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
        <button class="btn-acento" :disabled="cargando">{{ cargando ? 'Creando…' : 'Crear empresa y entrar' }}</button>
        <button type="button" class="text-sm font-semibold text-brand-700" @click="alternar">Ya tengo cuenta</button>
      </form>

      <p class="mt-6 text-center text-xs text-white/80"><b class="font-semibold">{{ APP.nombre }}</b> · {{ APP.lema }}</p>

      <p v-if="modoDemo" class="mt-4 rounded-xl bg-white/15 p-3 text-center text-xs text-white">
        Modo demo · <b>superadmin</b> / superadmin123 · <b>admin</b> / admin123 · <b>tecnico</b> / tecnico123
      </p>
    </div>
  </div>
</template>
