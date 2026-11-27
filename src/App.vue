<script setup>
import BarraCarga from './components/BarraCarga.vue'
import Cargando from './components/Cargando.vue'
import Vacio from './components/Vacio.vue'
import BotonNuevo from './components/BotonNuevo.vue'
import { ref, reactive, computed, watch } from 'vue'
import { useAuth } from './composables/useAuth'
import { useInformes } from './composables/useInformes'
import { useVisitas } from './composables/useVisitas'
import { useTecnicos } from './composables/useTecnicos'
import { useFotos } from './composables/useFotos'
import { useNotificaciones } from './composables/useNotificaciones'
import { useConfiguracion } from './composables/useConfiguracion'
import { modoDemo, call, offline, iniciarSincronizacion } from './api'
import { paramsAgenda } from './filtrosAgenda'
import LoginView from './views/LoginView.vue'
import DashboardView from './views/DashboardView.vue'
import AgendaView from './views/AgendaView.vue'
import FormVisita from './views/FormVisita.vue'
import DetalleVisita from './views/DetalleVisita.vue'
import ListaInformes from './views/ListaInformes.vue'
import FormInforme from './views/FormInforme.vue'
import DetalleInforme from './views/DetalleInforme.vue'
import UsuariosView from './views/UsuariosView.vue'
import EmpresasView from './views/EmpresasView.vue'
import Modal from './components/Modal.vue'
import ClaveView from './views/ClaveView.vue'
import NotificacionesView from './views/NotificacionesView.vue'
import PendientesView from './views/PendientesView.vue'
import ClientesView from './views/ClientesView.vue'
import ConfiguracionView from './views/ConfiguracionView.vue'
import WhatsappView from './views/WhatsappView.vue'
import EnvioWhatsapp from './components/EnvioWhatsapp.vue'
import InstalarView from './views/InstalarView.vue'
import QrInstalarView from './views/QrInstalarView.vue'
import { useInstalacion } from './composables/useInstalacion'
import BarraConexion from './components/BarraConexion.vue'
import { Toaster } from 'vue-sonner'
import { confirmar } from './composables/useConfirmar'
import { puedeSalir } from './composables/useSinGuardar'
import { useToast } from './composables/useToast'
import { ArrowLeft, Bell, Building2, CalendarDays, CloudUpload, FileText, KeyRound, LayoutDashboard, List, Menu, MessageCircle, Plus, QrCode, Settings, ShieldCheck, Smartphone, UserRound } from 'lucide-vue-next'
import MenuLateral from './components/MenuLateral.vue'
import { estado as estadoRed } from './offline/estado'

const { usuario, esSuper, esPlataforma, esRoot, sinOperacion, puedeUsuarios, puedeAgendar, logueado, logout } = useAuth()
const I = useInformes()
const V = useVisitas()
const T = useTecnicos()
const F = useFotos()
const N = useNotificaciones()
const CFG = useConfiguracion()
const { instalada } = useInstalacion()
// Quien llega escaneando el QR (?instalar=1) ve primero cómo instalar la app
const verInstalacion = ref(new URLSearchParams(location.search).has('instalar') && !instalada.value)
function seguirDeInstalacion() {
  verInstalacion.value = false
  const u = new URL(location.href)
  u.searchParams.delete('instalar')
  history.replaceState(null, '', u.pathname + u.search + u.hash)
}
// Marca de la empresa antes de ingresar (con la sesión abierta la pide el vigilante de más abajo)
if (!logueado.value || usuario.value?.cambiarClave) CFG.cargar()

// Vistas: dashboard (inicio) | agenda | visita-detalle | visita-editar
//         informes | informe-detalle | informe-editar | usuarios
// Crear visita o informe no es una vista: abre un modal (ver `modal`)
const vista = ref('dashboard') // el inicio de la app es el Dashboard
const seleccionadoId = ref(null)
const visitaOrigen = ref(null) // visita desde la que se crea un informe

const visita = computed(() => V.items.value.find((v) => v.id === seleccionadoId.value))
const informe = computed(() => I.items.value.find((i) => i.id === seleccionadoId.value))
const informesDeVisita = ref([]) // informes de la visita abierta (se piden al servidor al abrirla)
const prefill = computed(() => {
  const v = V.items.value.find((x) => x.id === visitaOrigen.value)
  if (!v) return undefined
  return { cliente: v.cliente, fecha: v.fecha, tipo: v.tipo, responsable: T.nombreDe(v.responsable), titulo: `${v.tipo} - ${v.cliente}`, visitaId: v.id }
})

const TITULOS = {
  dashboard: 'Inicio',
  agenda: 'Agenda de visitas',
  'visita-detalle': 'Visita',
  'visita-editar': 'Editar visita',
  informes: 'Informes',
  'informe-detalle': 'Informe',
  'informe-editar': 'Editar informe',
  usuarios: 'Usuarios',
  empresas: 'Empresas',
  clave: 'Cambiar clave',
  notificaciones: 'Notificaciones',
  pendientes: 'Cambios pendientes',
  clientes: 'Clientes',
  ajustes: 'Personalizar la empresa',
  whatsapp: 'WhatsApp',
  instalar: 'Instalar la app',
  qr: 'Código QR de instalación',
}
// Algunas pantallas cambian de nombre según el rol, igual que en el menú
const titulo = computed(() => {
  if (vista.value === 'agenda' && !puedeAgendar.value) return 'Mis visitas'
  if (vista.value === 'usuarios' && esSuper.value) return 'Administradores'
  return TITULOS[vista.value]
})
const esPrincipal = computed(() => ['dashboard', 'agenda', 'informes', 'clientes', 'usuarios', 'empresas', 'ajustes', 'whatsapp', 'instalar', 'qr'].includes(vista.value))
const error = computed(() => V.error.value || I.error.value)
watch(error, (e) => e && vista.value !== 'usuarios' && toast.error(e))
const cargando = computed(() => V.cargando.value || I.cargando.value)

// Crear una visita o un informe abre un modal sobre la pantalla actual ('visita' | 'informe'); navegar lo cierra
const modal = ref(null)

// Ventana de envío por WhatsApp de una visita ya guardada
const envio = ref(null) // { visitaId, plantillaId }
const claveEnvios = ref(0) // cambiarla recarga el historial en pantalla
const abrirEnvio = (visitaId, plantillaId = '') => (envio.value = { visitaId, plantillaId })

function ir(v, id = null) {
  modal.value = null
  envio.value = null
  vista.value = v
  seleccionadoId.value = id
  window.scrollTo(0, 0)
}

// Desde el Dashboard: abrir la agenda o los informes ya filtrados (los parámetros se fijan antes de mostrar la lista)
function irAgenda(periodo) {
  V.cargar(paramsAgenda(periodo)).catch(() => {})
  ir('agenda')
}

function irInformes(estado) {
  I.cargar(estado ? { estado } : {}).catch(() => {})
  ir('informes')
}

// Los accesos del inicio abren la sección por su principio (sin la subsección elegida antes en el menú)
function irDesdeInicio(v) {
  // Para el superadministrador, WhatsApp es una sección de "Personalizar la empresa"
  const seccion = v === 'whatsapp' && esSuper.value ? 'whatsapp' : null
  opcionActiva.value = seccion
  solicitudAjustes.value = seccion ? { seccion, n: Date.now() } : null
  ir(seccion ? 'ajustes' : v)
}

// Detalle de visita: muestra la visita ya cargada y pide al servidor sus informes (el listado general está paginado)
const cargandoInformes = ref(false)
function cargarInformesDeVisita(id) {
  const mostrar = (r) => {
    if (seleccionadoId.value === id) informesDeVisita.value = r.items
  }
  cargandoInformes.value = true
  call('informes_list', { visitaId: id, limit: 50 }, { previo: mostrar })
    .then(mostrar)
    .catch(() => {})
    .finally(() => (cargandoInformes.value = false))
}

function abrirVisita(id) {
  ir('visita-detalle', id)
  informesDeVisita.value = []
  if (!V.items.value.some((v) => v.id === id)) V.obtener(id).catch(() => {})
  cargarInformesDeVisita(id)
}

// Detalle/edición de informe: el listado es liviano, así que se pide el registro completo (firma, checklist, observaciones)
function abrirInforme(v, id) {
  ir(v, id)
  I.obtener(id).catch(() => {})
}

// Nueva visita: en blanco (botón +) o con los datos de un cliente registrado (pantalla Clientes)
const prefillVisita = ref(null)

function nuevaVisita() {
  prefillVisita.value = null
  modal.value = 'visita'
}

function agendarParaCliente(c) {
  prefillVisita.value = { cliente: c.nombre, direccion: c.direccion, telefono: c.telefono }
  modal.value = 'visita'
}

// Tocar un aviso lleva a la visita o al informe al que se refiere
function abrirDesdeAviso(n) {
  const [tipo, id] = String(n.ref || '').split(':')
  if (tipo === 'visita' && id) abrirVisita(id)
  else if (tipo === 'informe' && id) abrirInforme('informe-detalle', id)
}

// Salir de una pantalla por la barra o el menú: si hay algo escrito sin guardar, se pregunta antes
const salirYHacer = async (accion) => (await puedeSalir()) && accion()
const formModal = ref(null) // formulario de la ventana "Nueva visita" o "Nuevo informe"

function volver() {
  const id = seleccionadoId.value
  switch (vista.value) {
    case 'visita-editar':
      return abrirVisita(id)
    case 'informe-editar':
      return abrirInforme('informe-detalle', id)
    case 'informe-detalle':
      return ir('informes')
    default:
      return ir('dashboard')
  }
}

// --- Visitas ---
async function guardarVisita(data) {
  try {
    await V.actualizar(seleccionadoId.value, data)
    abrirVisita(seleccionadoId.value)
  } catch {
    /* el error se muestra en el banner */
  }
}

async function crearVisita(data, { enviarWhatsapp } = {}) {
  try {
    const v = await V.crear(data)
    abrirVisita(v.id) // la visita ya quedó guardada: lo que pase con WhatsApp no la afecta
    if (!enviarWhatsapp) return
    if (v._pendiente) toast.info('La visita quedó pendiente de envío. Cuando vuelva la conexión, envía el WhatsApp desde su detalle.')
    else abrirEnvio(v.id)
  } catch {
    /* el error se muestra en el banner */
  }
}

// datos: { estado, motivo? }. Cancelar ya se confirma con el motivo obligatorio; los demás cambios se preguntan aquí
async function cambiarEstadoVisita(datos) {
  const id = seleccionadoId.value
  if (datos.estado !== 'Cancelada') {
    const texto = datos.estado === 'Realizada' && !puedeAgendar.value ? 'La visita quedará cerrada. Solo un administrador podrá reabrirla.' : `La visita pasará a "${datos.estado}".`
    if (!(await confirmar({ titulo: '¿Cambiar el estado de la visita?', texto }))) return
  }
  V.actualizar(id, datos).catch(() => {})
}

async function borrarVisita() {
  if (!(await confirmar({ titulo: '¿Eliminar esta visita?', texto: 'Sus fotos irán a la papelera de Drive. Sus informes no se borran.', confirmar: 'Eliminar', peligro: true }))) return
  try {
    await V.eliminar(seleccionadoId.value)
    ir('agenda')
  } catch {
    /* banner */
  }
}

function crearInformeDeVisita() {
  visitaOrigen.value = seleccionadoId.value
  modal.value = 'informe'
}

// --- Informes ---
function nuevoInforme() {
  visitaOrigen.value = null
  modal.value = 'informe'
}

function cerrarModal() {
  modal.value = null
  visitaOrigen.value = null
}

async function guardarInforme(data) {
  try {
    await I.actualizar(seleccionadoId.value, data)
    abrirInforme('informe-detalle', seleccionadoId.value)
  } catch {
    /* banner */
  }
}

async function crearInforme(data) {
  try {
    const item = await I.crear(data)
    visitaOrigen.value = null
    abrirInforme('informe-detalle', item.id)
  } catch {
    /* banner */
  }
}

async function borrarInforme() {
  if (!(await confirmar({ titulo: '¿Eliminar este informe?', texto: 'Esta acción no se puede deshacer.', confirmar: 'Eliminar', peligro: true }))) return
  try {
    await I.eliminar(seleccionadoId.value)
    ir('informes')
  } catch {
    /* banner */
  }
}

// Agenda: filtros y páginas resueltos en el servidor (ver filtrosAgenda.js). Recargar conserva el filtro y la página.
async function cargarVisitas() {
  await V.cargar(V.parametros.value.limit ? V.parametros.value : paramsAgenda())
}

const recargar = () => Promise.allSettled([cargarVisitas(), I.recargar(), T.cargar()])

// Tras volver la conexión o enviar cambios en cola: recarga los datos y refresca la pantalla abierta
const claveRefresco = ref(0) // cambiarla vuelve a montar el detalle de la visita (recarga sus fotos)
const toast = useToast()

async function refrescarTodo() {
  F.limpiar()
  claveRefresco.value++
  await recargar()
  if (vista.value === 'informe-detalle' || vista.value === 'informe-editar') I.obtener(seleccionadoId.value).catch(() => {})
  if (vista.value === 'visita-detalle') cargarInformesDeVisita(seleccionadoId.value)
}

if (offline) {
  offline.ganchos.alSincronizar = (n) => {
    toast.exito(n === 1 ? 'Se envió 1 cambio.' : `Se enviaron ${n} cambios.`)
    refrescarTodo()
  }
}

let detenerConexion = () => {}

// Al iniciar sesión se carga todo; al cerrarla se limpia
watch(
  () => logueado.value && !usuario.value?.cambiarClave, // con clave temporal el backend no entrega datos: se carga tras cambiarla
  (si) => {
    if (si) {
      ir('dashboard')
      CFG.recordarEmpresa(usuario.value?.empresaId) // para mostrar su marca en el ingreso (el root no tiene)
      CFG.cargar()
      if (sinOperacion.value) return // root y superadministrador no tienen visitas, informes ni avisos
      recargar()
      N.iniciar()
      detenerConexion = iniciarSincronizacion({ alRecuperar: refrescarTodo })
    } else {
      N.detener()
      detenerConexion()
      detenerConexion = () => {}
      V.limpiar()
      I.limpiar()
      T.limpiar()
      F.limpiar()
    }
  },
  { immediate: true },
)

// ---------- Menú lateral (botón hamburguesa) ----------
// Árbol de botones y subbotones en cascada. Un grupo con un solo subbotón se muestra directamente como botón.
const menuAbierto = ref(false)
const abiertos = reactive(new Set()) // grupos desplegados
const opcionActiva = ref(null) // subbotón que abre una sección concreta (p. ej. "Nuevo cliente" o una sección de Ajustes)
const solicitudClientes = ref(null)
const solicitudAjustes = ref(null)

const arbol = computed(() => {
  const v = vista.value
  const op = opcionActiva.value
  const hoja = (id, texto, vistas, extra = {}) => ({ id, texto, vistas, activo: vistas.includes(v) && (extra.opcion ?? null) === op, ...extra })
  const grupo = (id, texto, icono, hijos, extra = {}) => {
    const lista = hijos.filter(Boolean)
    if (!lista.length) return null // p. ej. un técnico con la app ya instalada
    if (lista.length === 1) return { ...lista[0], texto, icono, ...extra }
    return { id, texto, icono, hijos: lista, activo: lista.some((h) => h.activo), ...extra }
  }
  const sinEnviar = estadoRed.pendientes + estadoRed.fallidas || null

  // Lo personal y la instalación, juntos al final. Las notificaciones se abren con la campana de arriba.
  const cuenta = () => {
    const opciones = [
      sinEnviar && hoja('pendientes', 'Cambios pendientes', ['pendientes'], { icono: CloudUpload, insignia: sinEnviar }),
      hoja('clave', 'Cambiar mi clave', ['clave'], { icono: KeyRound }),
      (puedeAgendar.value || esSuper.value) && !esRoot.value && hoja('qr', 'Código QR para instalar', ['qr'], { icono: QrCode }),
      !instalada.value && hoja('instalar', 'Instalar en este equipo', ['instalar'], { icono: Smartphone }),
    ].filter(Boolean)
    // Con una sola opción se muestra directamente, con su propio nombre
    return opciones.length === 1 ? opciones[0] : grupo('cuenta', 'Mi cuenta', UserRound, opciones, { insignia: sinEnviar })
  }

  if (esRoot.value) {
    return [
      hoja('dashboard', 'Inicio', ['dashboard'], { icono: LayoutDashboard }),
      hoja('empresas', 'Empresas', ['empresas'], { icono: Building2 }),
      cuenta(),
    ].filter(Boolean)
  }

  const ajustes = () =>
    grupo(
      'ajustes',
      'Personalizar la empresa',
      Settings,
      [['portada', 'Todos los ajustes'], ['empresa', 'Datos de la empresa'], ['tema', 'Colores y logo'], ['informes', 'Informes'], ['tipos', 'Tipos de visita y checklists'], ['whatsapp', 'Mensajes de WhatsApp']].map(([seccion, texto]) =>
        hoja(`ajustes-${seccion}`, texto, ['ajustes'], { opcion: seccion }),
      ),
      { desplegado: true },
    )

  if (esSuper.value) {
    return [
      hoja('dashboard', 'Inicio', ['dashboard'], { icono: LayoutDashboard }),
      ajustes(),
      hoja('usuarios', 'Administradores', ['usuarios'], { icono: ShieldCheck }),
      cuenta(),
    ].filter(Boolean)
  }

  return [
    hoja('dashboard', 'Inicio', ['dashboard'], { icono: LayoutDashboard }),
    grupo(
      'visitas',
      puedeAgendar.value ? 'Visitas' : 'Mis visitas',
      CalendarDays,
      [
        hoja('agenda', 'Agenda', ['agenda', 'visita-detalle', 'visita-editar'], { icono: List }),
        puedeAgendar.value && hoja('visita-nueva', 'Nueva visita', ['visita-nueva'], { icono: Plus }),
      ],
      { desplegado: true },
    ),
    grupo(
      'informes',
      'Informes',
      FileText,
      [
        hoja('informes', 'Lista de informes', ['informes', 'informe-detalle', 'informe-editar'], { icono: List }),
        hoja('informe-nuevo', 'Nuevo informe', ['informe-nuevo'], { icono: Plus }),
      ],
      { desplegado: true },
    ),
    puedeAgendar.value &&
      grupo(
        'clientes',
        'Clientes',
        Building2,
        [
          hoja('clientes', 'Lista de clientes', ['clientes'], { icono: List }),
          hoja('cliente-nuevo', 'Nuevo cliente', ['clientes'], { icono: Plus, opcion: 'nuevo' }),
        ],
      ),
    puedeAgendar.value && hoja('whatsapp', 'WhatsApp', ['whatsapp'], { icono: MessageCircle }),
    esPlataforma.value && hoja('empresas', 'Empresas', ['empresas'], { icono: Building2 }),
    puedeUsuarios.value && hoja('usuarios', 'Usuarios', ['usuarios'], { icono: ShieldCheck }),
    cuenta(),
  ].filter(Boolean)
})

// Despliega la rama de la sección en la que se está, para que el menú abra "donde estás"
function desplegarActivos(nodos) {
  for (const n of nodos) {
    if (!n.hijos) continue
    desplegarActivos(n.hijos)
    if (n.activo) abiertos.add(n.id)
  }
}

function abrirMenu() {
  abiertos.clear()
  for (const n of arbol.value) if (n.desplegado) abiertos.add(n.id) // trabajo diario: a un solo toque
  desplegarActivos(arbol.value)
  menuAbierto.value = true
}

const alternarGrupo = (id) => (abiertos.has(id) ? abiertos.delete(id) : abiertos.add(id))

async function elegir(n) {
  menuAbierto.value = false
  // Cambiar de sección dentro de Ajustes no pierde nada: la pantalla conserva lo escrito
  if (!(vista.value === 'ajustes' && n.id.startsWith('ajustes-'))) {
    if (!(await puedeSalir())) return
    // "Nueva visita" y "Nuevo informe" abren una ventana encima: antes se cierra la edición ya descartada
    if (vista.value.endsWith('-editar')) volver()
  }
  opcionActiva.value = n.opcion ?? null
  if (n.id === 'visita-nueva') return nuevaVisita()
  if (n.id === 'informe-nuevo') return nuevoInforme()
  if (n.id === 'cliente-nuevo') solicitudClientes.value = { tipo: 'nuevo', n: Date.now() }
  if (n.id.startsWith('ajustes-')) solicitudAjustes.value = { seccion: n.opcion, n: Date.now() }
  ir(n.vistas[0])
}

async function salirDelMenu() {
  menuAbierto.value = false
  if (await puedeSalir()) logout()
}
</script>

<template>
  <BarraCarga />
  <InstalarView v-if="verInstalacion" completa @continuar="seguirDeInstalacion" />
  <LoginView v-else-if="!logueado" />
  <ClaveView v-else-if="usuario.cambiarClave" obligatorio />

  <template v-else>
    <header class="sticky top-0 z-10 print:hidden bg-encabezado pt-[env(safe-area-inset-top)] text-white shadow">
      <div class="flex w-full items-center gap-0.5 px-2 py-1 lg:px-6">
        <button class="flex size-10 shrink-0 items-center justify-center rounded-full active:bg-white/10" aria-label="Abrir menú" aria-haspopup="dialog" :aria-expanded="menuAbierto" aria-controls="menu-lateral" @click="abrirMenu">
          <Menu :size="22" aria-hidden="true" />
        </button>
        <button v-if="!esPrincipal" class="flex size-10 shrink-0 items-center justify-center rounded-full active:bg-white/10" aria-label="Volver" @click="salirYHacer(volver)">
          <ArrowLeft :size="20" aria-hidden="true" />
        </button>
        <h1 class="flex-1 truncate px-2 text-base font-semibold">{{ titulo }}</h1>
        <button v-if="!sinOperacion" class="relative flex size-10 shrink-0 items-center justify-center rounded-full text-brand-100 active:bg-white/10" aria-label="Notificaciones" @click="salirYHacer(() => ir('notificaciones'))">
          <Bell :size="20" aria-hidden="true" />
          <span v-if="N.noLeidas.value" class="absolute top-1 right-0.5 flex min-w-4 items-center justify-center rounded-full bg-acento px-1 text-[10px] leading-4 font-bold text-acento-texto">{{ N.noLeidas.value > 9 ? '9+' : N.noLeidas.value }}</span>
        </button>
      </div>
    </header>

    <MenuLateral :abierto="menuAbierto" :arbol="arbol" :abiertos="abiertos" :usuario="usuario" @cerrar="menuAbierto = false" @elegir="elegir" @alternar="alternarGrupo" @salir="salirDelMenu" />

    <BarraConexion @ver="salirYHacer(() => ir('pendientes'))" />
    <p v-if="modoDemo" class="print:hidden bg-acento/90 px-4 py-1.5 text-xs text-acento-texto">Modo demo: datos solo en este dispositivo. Configura <code>VITE_SCRIPT_URL</code> para usar Google Sheets.</p>
    <Toaster position="top-center" rich-colors close-button :visible-toasts="3" class="print:hidden" />

    <main class="w-full px-4 pt-3 pb-24 lg:px-8 lg:pt-5 print:p-0">
      <!-- Agenda -->
      <DashboardView
        v-if="vista === 'dashboard'"
        :key="claveRefresco"
        @agenda="irAgenda"
        @informes="irInformes"
        @ir="irDesdeInicio"
        @visita="(id) => abrirVisita(id)"
        @informe="(id) => abrirInforme('informe-detalle', id)"
        @nueva-visita="nuevaVisita"
        @nuevo-informe="nuevoInforme"
      />
      <AgendaView v-else-if="vista === 'agenda'" :visitas="V.items.value" :cargando="V.cargando.value" :nombre-de="T.nombreDe" :total="V.meta.value.total" :offset="V.parametros.value.offset || 0" :limite="V.limite" :filtros="V.parametros.value" @abrir="(id) => abrirVisita(id)" @refrescar="recargar" @buscar="(p) => V.cargar(p).catch(() => {})" @pagina="(o) => V.irAPagina(o).catch(() => {})" />
      <FormVisita v-else-if="vista === 'visita-editar' && visita && puedeAgendar" :tecnicos="T.tecnicos.value" :inicial="visita" :cargando="cargando" @guardar="guardarVisita" @cancelar="abrirVisita(seleccionadoId)" />
      <DetalleVisita
        v-else-if="vista === 'visita-detalle' && visita"
        :key="claveRefresco"
        :visita="visita"
        :informes="informesDeVisita"
        :cargando-informes="cargandoInformes"
        :puede-gestionar="puedeAgendar"
        :nombre-de="T.nombreDe"
        @editar="ir('visita-editar', seleccionadoId)"
        @eliminar="borrarVisita"
        @estado="cambiarEstadoVisita"
        @crear-informe="crearInformeDeVisita"
        @abrir-informe="(id) => abrirInforme('informe-detalle', id)"
        :whatsapp="puedeAgendar && CFG.config.value.whatsapp.activo"
        :clave-envios="claveEnvios"
        @whatsapp="abrirEnvio(seleccionadoId)"
      />

      <!-- Informes -->
      <ListaInformes
        v-else-if="vista === 'informes'"
        :informes="I.items.value"
        :cargando="I.cargando.value"
        :total="I.meta.value.total"
        :offset="I.parametros.value.offset || 0"
        :limite="I.limite"
        :filtros="I.parametros.value"
        @abrir="(id) => abrirInforme('informe-detalle', id)"
        @refrescar="recargar"
        @buscar="(p) => I.cargar(p).catch(() => {})"
        @pagina="(o) => I.irAPagina(o).catch(() => {})"
      />
      <FormInforme v-else-if="vista === 'informe-editar' && informe?._completo" :inicial="informe" :cargando="cargando" @guardar="guardarInforme" @cancelar="abrirInforme('informe-detalle', seleccionadoId)" />
      <DetalleInforme v-else-if="vista === 'informe-detalle' && informe?._completo" :informe="informe" @editar="abrirInforme('informe-editar', seleccionadoId)" @eliminar="borrarInforme" />

      <template v-else-if="vista === 'informe-detalle' || vista === 'informe-editar'">
        <Cargando v-if="I.cargando.value" texto="Cargando informe…" />
        <Vacio v-else texto="No se pudo abrir el informe." />
      </template>
      <template v-else-if="(vista === 'visita-detalle' || vista === 'visita-editar') && !visita">
        <Cargando v-if="V.cargando.value" texto="Cargando visita…" />
        <Vacio v-else texto="No se pudo abrir la visita." />
      </template>
      <NotificacionesView v-else-if="vista === 'notificaciones'" @abrir="abrirDesdeAviso" />
      <PendientesView v-else-if="vista === 'pendientes'" />
      <ClientesView v-else-if="vista === 'clientes' && puedeAgendar" :solicitud="solicitudClientes" @agendar="agendarParaCliente" @abrir-visita="abrirVisita" />
      <ConfiguracionView v-else-if="vista === 'ajustes' && esSuper" :solicitud="solicitudAjustes" />
      <WhatsappView v-else-if="vista === 'whatsapp' && (puedeAgendar || esSuper)" :clave-envios="claveEnvios" @reenviar="(e) => abrirEnvio(e.visitaId, e.plantillaId)" />
      <InstalarView v-else-if="vista === 'instalar'" @continuar="ir('dashboard')" />
      <QrInstalarView v-else-if="vista === 'qr' && (puedeAgendar || esSuper)" />
      <ClaveView v-else-if="vista === 'clave'" @listo="ir('dashboard')" />
      <UsuariosView v-else-if="vista === 'usuarios' && puedeUsuarios" />
      <EmpresasView v-else-if="vista === 'empresas' && esPlataforma" />
    </main>

    <Modal v-if="modal === 'visita' && puedeAgendar" titulo="Nueva visita" @cerrar="formModal?.cancelar()">
      <FormVisita ref="formModal" :tecnicos="T.tecnicos.value" :prefill="prefillVisita" :cargando="cargando" @guardar="crearVisita" @cancelar="cerrarModal" />
    </Modal>
    <Modal v-if="modal === 'informe'" titulo="Nuevo informe" @cerrar="formModal?.cancelar()">
      <FormInforme ref="formModal" :prefill="prefill" :cargando="cargando" @guardar="crearInforme" @cancelar="cerrarModal" />
    </Modal>

    <EnvioWhatsapp v-if="envio && puedeAgendar" :visita-id="envio.visitaId" :plantilla-inicial="envio.plantillaId" @cerrar="envio = null" @registrado="claveEnvios++" />

    <BotonNuevo v-if="(vista === 'agenda' && puedeAgendar) || vista === 'informes'" :texto="vista === 'agenda' ? 'Nueva visita' : 'Nuevo informe'" @click="vista === 'agenda' ? nuevaVisita() : nuevoInforme()" />
  </template>
</template>
