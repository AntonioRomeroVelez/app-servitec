<script setup>
import { ref, reactive, onMounted } from 'vue'
import { Building2, Pencil, Plus, Power, X } from 'lucide-vue-next'
import { call } from '../api'
import { useToast } from '../composables/useToast'
import { validarClave } from '../utils'
import CampoClave from '../components/CampoClave.vue'

// Empresas del SaaS. Solo las crea y edita el superadmin de la plataforma: pone el nombre, llena sus datos y crea
// su administrador (superadmin de esa empresa), que luego personaliza marca e informes en Ajustes.
const toast = useToast()
const empresas = ref([])
const cargando = ref(false)
const guardando = ref(false)
const error = ref('')

const PLANES = ['prueba', 'basico', 'pro']
const vacia = () => ({ nombre: '', subtitulo: '', ruc: '', direccion: '', telefono: '', correo: '', web: '', plan: 'prueba', admin: { usuario: '', nombre: '', correo: '', clave: '' } })
const form = reactive(vacia())
const editando = ref(null) // null = cerrado, 'nueva' = alta, o el id de la empresa que se edita

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    empresas.value = await call('empresas_list')
  } catch (e) {
    error.value = e.message
  } finally {
    cargando.value = false
  }
}
onMounted(cargar)

function abrir(e) {
  Object.assign(form, vacia())
  if (e) Object.assign(form, { nombre: e.nombre, plan: e.plan, ...Object.fromEntries(['subtitulo', 'ruc', 'direccion', 'telefono', 'correo', 'web'].map((k) => [k, e.datos?.[k] ?? ''])) })
  editando.value = e ? e.id : 'nueva'
  error.value = ''
}
const cerrar = () => (editando.value = null)

async function guardar() {
  error.value = ''
  if (editando.value === 'nueva') {
    const msg = validarClave(form.admin.clave, form.admin.usuario.trim().toLowerCase())
    if (msg) return (error.value = msg)
  }
  guardando.value = true
  try {
    const { admin, plan, nombre, ...datos } = form
    if (editando.value === 'nueva') {
      await call('empresas_create', { data: { ...form, admin: { ...admin, usuario: admin.usuario.trim().toLowerCase() } } })
      toast.exito(`Empresa "${nombre}" creada. Su administrador debe cambiar la clave al entrar.`)
    } else {
      await call('empresas_update', { id: editando.value, data: { nombre, plan, datos } })
      toast.exito('Datos de la empresa guardados.')
    }
    cerrar()
    await cargar()
  } catch (e) {
    error.value = e.message
  } finally {
    guardando.value = false
  }
}

async function alternar(e) {
  try {
    await call('empresas_update', { id: e.id, data: { activa: !e.activa } })
    toast.exito(e.activa ? `"${e.nombre}" desactivada: sus usuarios ya no pueden entrar.` : `"${e.nombre}" activada.`)
    await cargar()
  } catch (err) {
    toast.error(err.message)
  }
}
</script>

<template>
  <div class="mb-3 flex items-center justify-between gap-2">
    <p class="text-sm text-brand-700">Cada empresa tiene sus propios datos, usuarios y visitas.</p>
    <button class="btn" @click="editando === 'nueva' ? cerrar() : abrir(null)"><Plus :size="18" aria-hidden="true" /> Nueva empresa</button>
  </div>

  <p v-if="error && !editando" class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>

  <form v-if="editando" class="tarjeta mb-4 grid gap-3" @submit.prevent="guardar">
    <div class="flex items-center justify-between">
      <h2 class="font-bold text-brand-900">{{ editando === 'nueva' ? 'Nueva empresa' : 'Datos de la empresa' }}</h2>
      <button type="button" class="flex size-9 items-center justify-center rounded-full text-brand-700 active:bg-brand-50" aria-label="Cerrar" @click="cerrar"><X :size="18" aria-hidden="true" /></button>
    </div>
    <label class="etiqueta">Nombre de la empresa
      <input v-model.trim="form.nombre" class="campo" required />
    </label>
    <label class="etiqueta">Subtítulo (opcional)
      <input v-model.trim="form.subtitulo" class="campo" />
    </label>
    <div class="grid gap-3 sm:grid-cols-2">
      <label class="etiqueta">RUC
        <input v-model.trim="form.ruc" class="campo" />
      </label>
      <label class="etiqueta">Teléfono
        <input v-model.trim="form.telefono" class="campo" type="tel" />
      </label>
    </div>
    <label class="etiqueta">Dirección
      <input v-model.trim="form.direccion" class="campo" />
    </label>
    <div class="grid gap-3 sm:grid-cols-2">
      <label class="etiqueta">Correo de la empresa
        <input v-model.trim="form.correo" class="campo" type="email" autocapitalize="none" />
      </label>
      <label class="etiqueta">Sitio web
        <input v-model.trim="form.web" class="campo" autocapitalize="none" />
      </label>
    </div>
    <label class="etiqueta">Plan
      <select v-model="form.plan" class="campo">
        <option v-for="p in PLANES" :key="p" :value="p">{{ p }}</option>
      </select>
    </label>

    <template v-if="editando === 'nueva'">
      <h3 class="mt-1 text-sm font-bold text-brand-800">Administrador de la empresa (superadmin)</h3>
      <label class="etiqueta">Nombre
        <input v-model.trim="form.admin.nombre" class="campo" required autocomplete="off" />
      </label>
      <label class="etiqueta">Usuario
        <input v-model="form.admin.usuario" class="campo" required autocapitalize="none" autocomplete="off" pattern="[a-z0-9._\-]{3,30}" title="3 a 30 caracteres: letras minúsculas, números, punto, guion o guion bajo" />
      </label>
      <label class="etiqueta">Correo (con él iniciará sesión)
        <input v-model.trim="form.admin.correo" class="campo" type="email" required autocapitalize="none" autocomplete="off" />
      </label>
      <label class="etiqueta">Clave temporal (mínimo 10 caracteres, con letras y números)
        <CampoClave v-model="form.admin.clave" autocomplete="new-password" required />
      </label>
    </template>

    <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
    <button class="btn-acento" :disabled="guardando">{{ guardando ? 'Guardando…' : editando === 'nueva' ? 'Crear empresa' : 'Guardar' }}</button>
  </form>

  <p v-if="cargando && !empresas.length" class="py-10 text-center text-brand-700">Cargando…</p>
  <p v-else-if="!empresas.length" class="py-10 text-center text-brand-700/70">Todavía no hay empresas.</p>

  <ul class="grid gap-2.5">
    <li v-for="e in empresas" :key="e.id" class="tarjeta flex items-start gap-3" :class="{ 'opacity-60': !e.activa }">
      <span class="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700"><Building2 :size="20" aria-hidden="true" /></span>
      <span class="grid min-w-0 flex-1 gap-0.5">
        <strong class="truncate text-brand-900">{{ e.nombre }}</strong>
        <span class="text-xs text-brand-700/80">Plan {{ e.plan }} · {{ e.usuarios }} {{ e.usuarios === 1 ? 'usuario' : 'usuarios' }}<template v-if="!e.activa"> · desactivada</template></span>
        <span v-if="e.datos?.ruc || e.datos?.telefono" class="truncate text-xs text-brand-700/70">{{ [e.datos.ruc && `RUC ${e.datos.ruc}`, e.datos.telefono].filter(Boolean).join(' · ') }}</span>
      </span>
      <span class="flex shrink-0 gap-1">
        <button class="flex size-10 items-center justify-center rounded-xl border border-brand-200 text-brand-700" aria-label="Editar datos" @click="abrir(e)"><Pencil :size="18" aria-hidden="true" /></button>
        <button class="flex size-10 items-center justify-center rounded-xl border border-brand-200" :class="e.activa ? 'text-red-600' : 'text-emerald-700'" :aria-label="e.activa ? 'Desactivar empresa' : 'Activar empresa'" @click="alternar(e)"><Power :size="18" aria-hidden="true" /></button>
      </span>
    </li>
  </ul>
</template>
