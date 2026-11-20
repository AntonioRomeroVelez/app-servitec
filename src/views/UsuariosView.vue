<script setup>
import { reactive, ref, computed, watch, onMounted } from 'vue'
import { Plus, X, KeyRound, Mail } from 'lucide-vue-next'
import { useUsuarios } from '../composables/useUsuarios'
import { useAuth, ROLES } from '../composables/useAuth'
import { validarClave } from '../utils'
import CampoClave from '../components/CampoClave.vue'
import BarraFiltros from '../components/BarraFiltros.vue'
import Paginador from '../components/Paginador.vue'
import Modal from '../components/Modal.vue'
import { usePaginaLocal } from '../composables/usePaginaLocal'
import { normalizar } from '../utils'
import { modoSupabase } from '../api'

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

// Búsqueda, filtros (rol y estado) y páginas en el dispositivo: la lista llega completa
const q = ref('')
const rol = ref('')
const estado = ref('')
const filtrados = computed(() => {
  const t = normalizar(q.value)
  return usuarios.value.filter(
    (u) =>
      (!rol.value || u.rol === rol.value) &&
      (!estado.value || (estado.value === 'activos') === u.activo) &&
      (!t || [u.nombre, u.usuario, u.correo].some((c) => normalizar(c).includes(t))),
  )
})
const pag = usePaginaLocal(filtrados, 10)
watch([q, rol, estado], pag.volverAlInicio)

onMounted(() => cargar().catch(() => {}))
</script>

<template>
  <BarraFiltros v-model="q" placeholder="Buscar nombre, usuario o correo" :activos="(rol ? 1 : 0) + (estado ? 1 : 0)">
    <template #filtros>
      <select v-model="rol" class="campo !min-h-10 !py-1.5 text-sm" aria-label="Filtrar por rol">
        <option value="">Todos los roles</option>
        <option v-for="r in ROLES" :key="r" :value="r">{{ r }}</option>
      </select>
      <select v-model="estado" class="campo !min-h-10 !py-1.5 text-sm" aria-label="Filtrar por estado">
        <option value="">Activos e inactivos</option>
        <option value="activos">Solo activos</option>
        <option value="inactivos">Solo inactivos</option>
      </select>
    </template>
    <template #acciones>
      <button class="btn-acento !min-h-10 !px-3 flex-none" aria-label="Nuevo usuario" @click="mostrarForm = true">
        <Plus :size="18" aria-hidden="true" />
        <span class="sr-only sm:not-sr-only">Nuevo</span>
      </button>
    </template>
  </BarraFiltros>

  <p v-if="error || aviso" class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ aviso || error }}</p>

  <Modal v-if="mostrarForm" titulo="Nuevo usuario" @cerrar="mostrarForm = false">
  <p v-if="error || aviso" class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ aviso || error }}</p>
  <form class="grid gap-3" @submit.prevent="agregar">
    <label class="etiqueta">Usuario
      <input v-model="nuevo.usuario" class="campo" required autocapitalize="none" pattern="[a-z0-9._\-]{3,30}" title="3 a 30 caracteres: letras minúsculas, números, punto, guion o guion bajo" />
    </label>
    <label class="etiqueta">Nombre
      <input v-model.trim="nuevo.nombre" class="campo" required />
    </label>
    <label class="etiqueta">{{ modoSupabase ? 'Correo (lo usará para iniciar sesión)' : 'Correo para avisos (opcional)' }}
      <input v-model.trim="nuevo.correo" type="email" class="campo" autocomplete="off" autocapitalize="none" :required="modoSupabase" />
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
  </Modal>

  <ul class="grid gap-2.5">
    <li v-for="u in pag.visibles.value" :key="u.id" class="tarjeta grid gap-2" :class="{ 'opacity-60': !u.activo }">
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

  <p v-if="!filtrados.length" class="py-8 text-center text-brand-700/70">No hay usuarios que coincidan.</p>
  <Paginador :total="pag.total.value" :offset="pag.offset.value" :limite="pag.limite" @ir="pag.ir" />
</template>
