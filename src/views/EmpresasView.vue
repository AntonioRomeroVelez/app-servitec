<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { Building2, KeyRound, Pencil, Plus, Power, Settings, X } from 'lucide-vue-next'
import { call } from '../api'
import { useToast } from '../composables/useToast'
import { confirmar } from '../composables/useConfirmar'
import { normalizar, validarClave } from '../utils'
import CampoClave from '../components/CampoClave.vue'
import { personaVacia, validarPersona, limpiarPersona } from '../persona'
import FormularioPersona from '../components/FormularioPersona.vue'
import CredencialesNuevas from '../components/CredencialesNuevas.vue'
import BarraFiltros from '../components/BarraFiltros.vue'
import Paginador from '../components/Paginador.vue'
import Modal from '../components/Modal.vue'
import ConfiguracionView from './ConfiguracionView.vue'
import { usePaginaLocal } from '../composables/usePaginaLocal'

// Empresas del SaaS. Solo las crea y edita el superadmin de la plataforma: pone el nombre, llena sus datos y crea
// su administrador (superadmin de esa empresa), que luego personaliza marca e informes en Ajustes.
const toast = useToast()
const empresas = ref([])
const cargando = ref(false)
const guardando = ref(false)
const error = ref('')

const PLANES = ['prueba', 'basico', 'pro']
const vacia = () => ({ nombre: '', subtitulo: '', ruc: '', direccion: '', telefono: '', correo: '', web: '', plan: 'prueba', admin: personaVacia() })
const form = reactive(vacia())
const credenciales = ref(null) // { nombre, usuario, clave } del administrador recién creado
// El servidor sugiere el usuario del administrador y dice si uno está libre (ve todos los usuarios de la plataforma)
const sugerir = (nombre, cedula) => call('usuarios_sugerir', { nombre, cedula })
const disponible = (usuario) => call('usuarios_disponible', { usuario })

const configurando = ref(null) // empresa cuyos Ajustes completos se están editando (la plataforma entra como su superadmin)
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

// Búsqueda y filtros (estado y plan) en el dispositivo; la lista llega completa y se muestra por páginas
const q = ref('')
const estado = ref('')
const plan = ref('')
const filtradas = computed(() => {
  const t = normalizar(q.value)
  return empresas.value.filter(
    (e) =>
      (!estado.value || (estado.value === 'activas') === e.activa) &&
      (!plan.value || e.plan === plan.value) &&
      (!t || [e.nombre, e.datos?.ruc, e.datos?.correo, e.datos?.telefono].some((c) => normalizar(c).includes(t))),
  )
})
const pag = usePaginaLocal(filtradas, 10)
watch([q, estado, plan], pag.volverAlInicio)

function abrir(e) {
  Object.assign(form, vacia())
  if (e) Object.assign(form, { nombre: e.nombre, plan: e.plan, ...Object.fromEntries(['subtitulo', 'ruc', 'direccion', 'telefono', 'correo', 'web'].map((k) => [k, e.datos?.[k] ?? ''])) })
  editando.value = e ? e.id : 'nueva'
  credenciales.value = null
  error.value = ''
}
const cerrar = () => {
  editando.value = null
  credenciales.value = null
}

async function guardar() {
  error.value = ''
  if (editando.value === 'nueva') {
    const msg = validarPersona(form.admin)
    if (msg) return (error.value = msg)
  }
  guardando.value = true
  try {
    const { admin, plan, nombre, ...datos } = form
    if (editando.value === 'nueva') {
      const r = await call('empresas_create', { data: { ...form, admin: limpiarPersona(admin) } })
      credenciales.value = { nombre: admin.nombre.trim(), usuario: r.usuario, clave: admin.cedula.trim() } // la clave temporal es la cédula
      toast.exito(`Empresa "${nombre}" creada.`)
      await cargar()
      return // el modal queda abierto mostrando el usuario generado y la clave temporal
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

// ---------- Restablecer la clave del administrador de una empresa (solo la plataforma) ----------
// Sirve cuando el superadmin de una empresa olvida su clave y nadie de su empresa puede restablecérsela.
// La clave temporal vuelve a ser su cédula; si no tiene cédula (cuentas antiguas) se escribe una a mano.
const adminsDe = ref(null) // empresa abierta
const admins = ref([])
const cargandoAdmins = ref(false)
const errorAdmins = ref('')
const clavesManuales = reactive({}) // id de administrador -> clave escrita a mano
const claveRestablecida = ref(null) // { nombre, usuario, clave } para entregar

async function abrirAdmins(e) {
  adminsDe.value = e
  admins.value = []
  errorAdmins.value = ''
  cargandoAdmins.value = true
  try {
    admins.value = await call('empresas_admins', { id: e.id })
  } catch (err) {
    errorAdmins.value = err.message
  } finally {
    cargandoAdmins.value = false
  }
}

async function restablecerAdmin(a) {
  errorAdmins.value = ''
  const manual = !a.cedula
  const clave = manual ? String(clavesManuales[a.id] || '') : a.cedula
  if (manual) {
    const msg = validarClave(clave, a.usuario)
    if (msg) return (errorAdmins.value = msg)
  }
  const quien = `${a.nombre} (@${a.usuario})`
  if (!(await confirmar({ titulo: '¿Restablecer la clave?', texto: `Se cerrarán las sesiones de ${quien} y deberá crear una clave nueva al ingresar.`, confirmar: 'Restablecer', peligro: true }))) return
  try {
    await call('empresas_restablecer_admin', { id: a.id, clave, temporal: !manual })
    claveRestablecida.value = { nombre: a.nombre, usuario: a.usuario, clave }
    clavesManuales[a.id] = ''
    adminsDe.value = null
  } catch (err) {
    errorAdmins.value = err.message
  }
}

async function alternar(e) {
  const ok = await confirmar(
    e.activa
      ? { titulo: `¿Desactivar "${e.nombre}"?`, texto: 'Todos sus usuarios dejarán de poder entrar hasta que la actives de nuevo. Sus datos no se borran.', confirmar: 'Desactivar', peligro: true }
      : { titulo: `¿Activar "${e.nombre}"?`, texto: 'Sus usuarios podrán volver a entrar.', confirmar: 'Activar' },
  )
  if (!ok) return
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
  <BarraFiltros v-model="q" placeholder="Buscar nombre, RUC o correo" :activos="(estado ? 1 : 0) + (plan ? 1 : 0)">
    <template #filtros>
      <select v-model="estado" class="campo !min-h-10 !py-1.5 text-sm" aria-label="Filtrar por estado">
        <option value="">Activas y desactivadas</option>
        <option value="activas">Solo activas</option>
        <option value="desactivadas">Solo desactivadas</option>
      </select>
      <select v-model="plan" class="campo !min-h-10 !py-1.5 text-sm" aria-label="Filtrar por plan">
        <option value="">Todos los planes</option>
        <option v-for="p in PLANES" :key="p" :value="p">{{ p }}</option>
      </select>
    </template>
    <template #acciones>
      <button class="btn-acento !min-h-10 !px-3 flex-none" aria-label="Nueva empresa" @click="abrir(null)">
        <Plus :size="18" aria-hidden="true" />
        <span class="sr-only sm:not-sr-only">Nueva</span>
      </button>
    </template>
  </BarraFiltros>

  <p v-if="error && !editando" class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>

  <Modal v-if="editando" :titulo="credenciales ? 'Empresa creada' : editando === 'nueva' ? 'Nueva empresa' : 'Datos de la empresa'" @cerrar="cerrar">
  <CredencialesNuevas v-if="credenciales" v-bind="credenciales" @listo="cerrar" />
  <form v-else class="grid gap-3" @submit.prevent="guardar">
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
      <FormularioPersona :form="form.admin" nueva-cuenta :sugerir="sugerir" :disponible="disponible" />
    </template>

    <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
    <button class="btn-acento" :disabled="guardando">{{ guardando ? 'Guardando…' : editando === 'nueva' ? 'Crear empresa' : 'Guardar' }}</button>
  </form>
  </Modal>

  <!-- Ajustes completos de la empresa: datos, colores y logo, informes y tipos de visita -->
  <Modal v-if="configurando" :titulo="`Ajustes de ${configurando.nombre}`" @cerrar="configurando = null; cargar()">
    <ConfiguracionView :empresa-id="configurando.id" />
  </Modal>

  <!-- Administradores de la empresa: restablecer la clave de uno -->
  <Modal v-if="adminsDe" :titulo="`Administradores de ${adminsDe.nombre}`" @cerrar="adminsDe = null">
    <p v-if="cargandoAdmins" class="py-4 text-center text-brand-700">Cargando…</p>
    <p v-else-if="!admins.length && !errorAdmins" class="py-4 text-center text-sm text-brand-700/70">Esta empresa no tiene administradores.</p>
    <ul class="grid gap-3">
      <li v-for="a in admins" :key="a.id" class="grid gap-2 rounded-xl bg-brand-50 p-3" :class="{ 'opacity-60': !a.activo }">
        <div>
          <b class="text-brand-900">{{ a.nombre }}</b>
          <p class="text-sm text-brand-700">@{{ a.usuario }}<template v-if="!a.activo"> · inactivo</template></p>
          <p v-if="a.correo" class="text-xs break-all text-brand-700/70">{{ a.correo }}</p>
        </div>
        <template v-if="a.cedula">
          <p class="text-xs text-brand-800">La clave volverá a ser su número de cédula (<b class="font-mono">{{ a.cedula }}</b>). Deberá cambiarla al ingresar y se cerrarán sus sesiones abiertas.</p>
          <button class="btn min-h-11" @click="restablecerAdmin(a)"><KeyRound :size="18" aria-hidden="true" />Restablecer a la cédula</button>
        </template>
        <form v-else class="grid gap-2" @submit.prevent="restablecerAdmin(a)">
          <label class="etiqueta">No tiene cédula: escribe una clave temporal (mínimo 10 caracteres, con letras y números)
            <CampoClave v-model="clavesManuales[a.id]" autocomplete="new-password" required minlength="10" />
          </label>
          <button class="btn min-h-11"><KeyRound :size="18" aria-hidden="true" />Restablecer clave</button>
        </form>
      </li>
    </ul>
    <p v-if="errorAdmins" class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ errorAdmins }}</p>
  </Modal>
  <Modal v-if="claveRestablecida" titulo="Clave restablecida" @cerrar="claveRestablecida = null">
    <CredencialesNuevas accion="Clave restablecida" v-bind="claveRestablecida" @listo="claveRestablecida = null" />
  </Modal>

  <p v-if="cargando && !empresas.length" class="py-10 text-center text-brand-700">Cargando…</p>
  <p v-else-if="!empresas.length" class="py-10 text-center text-brand-700/70">Todavía no hay empresas.</p>
  <p v-else-if="!filtradas.length" class="py-10 text-center text-brand-700/70">No hay empresas que coincidan.</p>

  <ul class="grid gap-2.5">
    <li v-for="e in pag.visibles.value" :key="e.id" class="tarjeta flex items-start gap-3" :class="{ 'opacity-60': !e.activa }">
      <span class="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700"><Building2 :size="20" aria-hidden="true" /></span>
      <span class="grid min-w-0 flex-1 gap-0.5">
        <strong class="truncate text-brand-900">{{ e.nombre }}</strong>
        <span class="text-xs text-brand-700/80">Plan {{ e.plan }} · {{ e.usuarios }} {{ e.usuarios === 1 ? 'usuario' : 'usuarios' }}<template v-if="!e.activa"> · desactivada</template></span>
        <span v-if="e.datos?.ruc || e.datos?.telefono" class="truncate text-xs text-brand-700/70">{{ [e.datos.ruc && `RUC ${e.datos.ruc}`, e.datos.telefono].filter(Boolean).join(' · ') }}</span>
      </span>
      <span class="flex shrink-0 gap-1">
        <button class="flex size-10 items-center justify-center rounded-xl border border-brand-200 text-brand-700" aria-label="Configurar la empresa (colores, logo, informes, tipos de visita)" @click="configurando = e"><Settings :size="18" aria-hidden="true" /></button>
        <button class="flex size-10 items-center justify-center rounded-xl border border-brand-200 text-brand-700" aria-label="Editar datos" @click="abrir(e)"><Pencil :size="18" aria-hidden="true" /></button>
        <button class="flex size-10 items-center justify-center rounded-xl border border-brand-200 text-brand-700" aria-label="Restablecer la clave del administrador" @click="abrirAdmins(e)"><KeyRound :size="18" aria-hidden="true" /></button>
        <button class="flex size-10 items-center justify-center rounded-xl border border-brand-200" :class="e.activa ? 'text-red-600' : 'text-emerald-700'" :aria-label="e.activa ? 'Desactivar empresa' : 'Activar empresa'" @click="alternar(e)"><Power :size="18" aria-hidden="true" /></button>
      </span>
    </li>
  </ul>

  <Paginador :total="pag.total.value" :offset="pag.offset.value" :limite="pag.limite" @ir="pag.ir" />
</template>
