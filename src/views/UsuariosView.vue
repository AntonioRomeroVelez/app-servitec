<script setup>
import { reactive, ref, onMounted } from 'vue'
import { Plus, X, KeyRound, Mail } from 'lucide-vue-next'
import { useUsuarios } from '../composables/useUsuarios'
import { useAuth, ROLES } from '../composables/useAuth'
import { validarClave } from '../utils'
import CampoClave from '../components/CampoClave.vue'

const { usuarios, cargando, error, cargar, crear, actualizar } = useUsuarios()
const { usuario: yo } = useAuth()

const nuevo = reactive({ usuario: '', nombre: '', rol: 'admin', clave: '', correo: '' })
const mostrarForm = ref(false)
const aviso = ref('')

async function agregar() {
  aviso.value = validarClave(nuevo.clave, nuevo.usuario.trim().toLowerCase())
  if (aviso.value) return
  try {
    await crear({ ...nuevo, usuario: nuevo.usuario.trim().toLowerCase() })
    Object.assign(nuevo, { usuario: '', nombre: '', rol: 'admin', clave: '', correo: '' })
    mostrarForm.value = false
  } catch {
    /* el error se muestra abajo */
  }
}

const alternar = (u) => actualizar(u.id, { activo: !u.activo }).catch(() => {})

// Restablecer clave: formulario dentro de la tarjeta del usuario (con botón para ver la clave que se escribe)
const restableciendoId = ref(null)
const claveTemporal = ref('')

function abrirRestablecer(u) {
  restableciendoId.value = restableciendoId.value === u.id ? null : u.id
  claveTemporal.value = ''
  aviso.value = ''
}

async function restablecer(u) {
  aviso.value = validarClave(claveTemporal.value, u.usuario)
  if (aviso.value) return
  try {
    await actualizar(u.id, { clave: claveTemporal.value })
    restableciendoId.value = null
    claveTemporal.value = ''
  } catch {
    /* el error se muestra arriba */
  }
}

// Correo para recibir los avisos (opcional). Vacío = solo avisos dentro de la app.
const editandoCorreoId = ref(null)
const correoNuevo = ref('')

function abrirCorreo(u) {
  editandoCorreoId.value = editandoCorreoId.value === u.id ? null : u.id
  correoNuevo.value = u.correo || ''
  aviso.value = ''
}

async function guardarCorreo(u) {
  try {
    await actualizar(u.id, { correo: correoNuevo.value.trim() })
    editandoCorreoId.value = null
  } catch {
    /* el error se muestra arriba */
  }
}

onMounted(() => cargar().catch(() => {}))
</script>

<template>
  <div class="mb-3 flex items-center justify-between">
    <p class="text-sm text-brand-700">{{ usuarios.length }} usuarios</p>
    <button class="btn-acento min-h-11 flex-none" @click="mostrarForm = !mostrarForm">
      <X v-if="mostrarForm" :size="18" aria-hidden="true" />
      <Plus v-else :size="18" aria-hidden="true" />
      {{ mostrarForm ? 'Cerrar' : 'Nuevo usuario' }}
    </button>
  </div>

  <p v-if="error || aviso" class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ aviso || error }}</p>

  <form v-if="mostrarForm" class="tarjeta mb-4 grid gap-3" @submit.prevent="agregar">
    <label class="etiqueta">Usuario
      <input v-model="nuevo.usuario" class="campo" required autocapitalize="none" pattern="[a-z0-9._\-]{3,30}" title="3 a 30 caracteres: letras minúsculas, números, punto, guion o guion bajo" />
    </label>
    <label class="etiqueta">Nombre
      <input v-model.trim="nuevo.nombre" class="campo" required />
    </label>
    <label class="etiqueta">Correo para avisos (opcional)
      <input v-model.trim="nuevo.correo" type="email" class="campo" autocomplete="off" autocapitalize="none" />
    </label>
    <label class="etiqueta">Rol
      <select v-model="nuevo.rol" class="campo">
        <option v-for="r in ROLES" :key="r">{{ r }}</option>
      </select>
    </label>
    <label class="etiqueta">Clave temporal (mínimo 10 caracteres, con letras y números)
      <CampoClave v-model="nuevo.clave" autocomplete="new-password" required minlength="10" />
    </label>
    <p class="text-xs text-brand-700/80">El usuario deberá cambiarla en su primer ingreso.</p>
    <button class="btn" :disabled="cargando">Crear usuario</button>
  </form>

  <ul class="grid gap-2.5">
    <li v-for="u in usuarios" :key="u.id" class="tarjeta grid gap-2" :class="{ 'opacity-60': !u.activo }">
      <div class="flex items-start justify-between gap-2">
        <div>
          <strong class="text-brand-900">{{ u.nombre }}</strong>
          <p class="text-sm text-brand-700">@{{ u.usuario }}</p>
          <p v-if="u.correo" class="text-xs text-brand-700/70">{{ u.correo }}</p>
        </div>
        <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold" :class="u.rol === 'superadmin' ? 'bg-acento text-acento-texto' : 'bg-brand-100 text-brand-800'">{{ u.rol }}</span>
      </div>
      <div class="flex flex-wrap gap-2">
        <button class="btn-borde min-h-10 text-sm" :aria-expanded="editandoCorreoId === u.id" @click="abrirCorreo(u)">
          <Mail :size="16" aria-hidden="true" />
          Correo
        </button>
        <button v-if="u.id !== yo.id" class="btn-borde min-h-10 text-sm" :aria-expanded="restableciendoId === u.id" @click="abrirRestablecer(u)">
          <KeyRound :size="16" aria-hidden="true" />
          Restablecer clave
        </button>
        <button v-if="u.id !== yo.id" class="min-h-10 flex-1 rounded-xl border text-sm font-semibold sm:flex-none sm:px-4" :class="u.activo ? 'border-red-600 text-red-700' : 'border-emerald-600 text-emerald-700'" @click="alternar(u)">
          {{ u.activo ? 'Desactivar' : 'Activar' }}
        </button>
      </div>

      <form v-if="editandoCorreoId === u.id" class="grid gap-2 rounded-xl bg-brand-50 p-3" @submit.prevent="guardarCorreo(u)">
        <label class="etiqueta">Correo para avisos (déjalo vacío para no enviar correos)
          <input v-model.trim="correoNuevo" type="email" class="campo" autocomplete="off" autocapitalize="none" />
        </label>
        <div class="flex gap-2">
          <button type="button" class="btn-borde min-h-11" @click="editandoCorreoId = null">Cancelar</button>
          <button class="btn min-h-11" :disabled="cargando">Guardar</button>
        </div>
      </form>

      <form v-if="restableciendoId === u.id" class="grid gap-2 rounded-xl bg-brand-50 p-3" @submit.prevent="restablecer(u)">
        <label class="etiqueta">Clave temporal (mínimo 10 caracteres, con letras y números)
          <CampoClave v-model="claveTemporal" autocomplete="new-password" required minlength="10" />
        </label>
        <p class="text-xs text-brand-700/80">Deberá cambiarla al ingresar y se cerrarán sus sesiones abiertas.</p>
        <div class="flex gap-2">
          <button type="button" class="btn-borde min-h-11" @click="restableciendoId = null">Cancelar</button>
          <button class="btn min-h-11" :disabled="cargando">Guardar</button>
        </div>
      </form>
    </li>
  </ul>
</template>
