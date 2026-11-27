<script setup>
import { ref, h, render, onMounted, onBeforeUnmount } from 'vue'
import { Check, CircleAlert, ExternalLink, LocateFixed, MapPin, Search } from 'lucide-vue-next'
import Modal from './Modal.vue'
import { CENTRO_INICIAL, leerUbicacion, textoUbicacion, enlaceGoogleMaps, direccionDelPunto, buscarDireccion } from '../mapa'

// Elegir en el mapa el punto de una visita: se busca, se toca el mapa o se arrastra el marcador, y se obtiene la dirección.
// Entrega { ubicacion: "lat,lng", direccion }. Leaflet se carga solo al abrir esta ventana.
const props = defineProps({ ubicacion: { type: String, default: '' }, direccion: { type: String, default: '' } })
const emit = defineEmits(['aceptar', 'cerrar'])

const caja = ref(null)
const punto = ref(leerUbicacion(props.ubicacion))
const direccion = ref(props.direccion)
const busqueda = ref(props.direccion)
const resultados = ref(null) // null = no se ha buscado
const ocupado = ref('') // '' | 'mapa' | 'buscar' | 'direccion' | 'gps'
const error = ref('')

let L
let mapa
let marcador
let turno = 0 // descarta respuestas de un punto anterior
let desmontado = false

function dibujarMarcador(p) {
  if (marcador) return marcador.setLatLng(p)
  const el = document.createElement('div')
  render(h(MapPin, { size: 40, class: 'fill-red-600 text-white drop-shadow', 'aria-hidden': 'true' }), el)
  marcador = L.marker(p, { draggable: true, icon: L.divIcon({ html: el, className: '', iconSize: [40, 40], iconAnchor: [20, 37] }), title: 'Punto de la visita' }).addTo(mapa)
  marcador.on('dragend', () => elegir(marcador.getLatLng()))
}

async function elegir({ lat, lng }, centrar = false) {
  punto.value = { lat, lng }
  dibujarMarcador(punto.value)
  if (centrar) mapa.setView(punto.value, 17)
  const mio = ++turno
  ocupado.value = 'direccion'
  error.value = ''
  try {
    const d = await direccionDelPunto(punto.value)
    if (mio === turno && d) direccion.value = d
  } catch {
    if (mio === turno) error.value = 'No se pudo obtener la dirección de ese punto. Puedes escribirla.'
  } finally {
    if (mio === turno) ocupado.value = ''
  }
}

async function buscar() {
  if (!busqueda.value.trim() || !mapa) return
  ocupado.value = 'buscar'
  error.value = ''
  resultados.value = null
  try {
    resultados.value = await buscarDireccion(busqueda.value.trim())
  } catch {
    error.value = 'No se pudo buscar. Revisa tu conexión o toca el mapa.'
  } finally {
    ocupado.value = ''
  }
}

function elegirResultado(r) {
  resultados.value = null
  elegir(r, true)
}

function miUbicacion() {
  if (!navigator.geolocation) return (error.value = 'Este dispositivo no permite obtener la ubicación.')
  ocupado.value = 'gps'
  error.value = ''
  navigator.geolocation.getCurrentPosition(
    (p) => !desmontado && elegir({ lat: p.coords.latitude, lng: p.coords.longitude }, true),
    () => {
      ocupado.value = ''
      error.value = 'No se pudo obtener tu ubicación. Permite el acceso en el navegador o toca el mapa.'
    },
    { enableHighAccuracy: true, timeout: 15000 },
  )
}

onMounted(async () => {
  ocupado.value = 'mapa'
  try {
    ;[{ default: L }] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')])
  } catch {
    ocupado.value = ''
    return (error.value = 'No se pudo cargar el mapa. Revisa tu conexión.')
  }
  if (desmontado) return
  // Sin animación de zoom: si la ventana se cierra a media animación, Leaflet falla al terminarla
  mapa = L.map(caja.value, { zoomAnimation: false }).setView(punto.value || CENTRO_INICIAL, punto.value ? 17 : 12)
  mapa.attributionControl.setPrefix(false) // sin el logotipo de la librería; se mantiene el crédito de OpenStreetMap
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(mapa)
  mapa.on('click', (e) => elegir(e.latlng))
  setTimeout(() => mapa?.invalidateSize(), 250) // la ventana termina de colocarse después de crear el mapa
  ocupado.value = ''
  if (punto.value) dibujarMarcador(punto.value)
  else if (busqueda.value.trim()) buscar() // con la dirección ya escrita se muestran las coincidencias
})
onBeforeUnmount(() => {
  desmontado = true
  mapa?.remove()
  mapa = null
})
</script>

<template>
  <Modal titulo="Ubicar en el mapa" @cerrar="emit('cerrar')">
    <div class="grid gap-3">
      <div class="flex gap-2">
        <input v-model="busqueda" type="search" class="campo min-w-0 flex-1" placeholder="Buscar calle, lugar o ciudad" aria-label="Buscar en el mapa" enterkeyhint="search" @keydown.enter.prevent="buscar" />
        <button type="button" class="btn !min-w-0 !flex-none !px-3" :disabled="!!ocupado" aria-label="Buscar" @click="buscar"><Search :size="18" aria-hidden="true" /></button>
        <button type="button" class="btn-borde !min-w-0 !flex-none !px-3" :disabled="!!ocupado" aria-label="Usar mi ubicación" title="Usar mi ubicación" @click="miUbicacion"><LocateFixed :size="18" aria-hidden="true" /></button>
      </div>

      <ul v-if="resultados" class="grid max-h-40 gap-1 overflow-y-auto rounded-xl border border-brand-100 p-1.5">
        <li v-for="r in resultados" :key="`${r.lat},${r.lng}`">
          <button type="button" class="min-h-11 w-full rounded-lg px-2.5 py-1.5 text-left text-sm text-brand-900 active:bg-brand-100" @click="elegirResultado(r)">{{ r.texto }}</button>
        </li>
        <li v-if="!resultados.length" class="px-2.5 py-2 text-sm text-brand-700">No se encontró. Toca el mapa para marcar el punto.</li>
      </ul>

      <!-- isolate: las capas de Leaflet usan z-index altos y no deben salirse de esta caja -->
      <div ref="caja" class="isolate h-[52dvh] min-h-56 w-full shrink-0 overflow-hidden rounded-xl border border-brand-200 bg-brand-50" aria-label="Mapa" />
      <p class="text-xs text-brand-700/80" aria-live="polite">{{ ocupado === 'mapa' ? 'Cargando el mapa…' : ocupado === 'buscar' ? 'Buscando…' : ocupado === 'gps' ? 'Obteniendo tu ubicación…' : ocupado === 'direccion' ? 'Obteniendo la dirección…' : 'Toca el mapa o arrastra el marcador para ajustar el punto.' }}</p>

      <label class="etiqueta">Dirección
        <input v-model="direccion" class="campo" maxlength="200" placeholder="Se completa al marcar el punto; puedes corregirla" />
      </label>
      <p v-if="error" class="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert"><CircleAlert :size="16" class="mt-0.5 shrink-0" aria-hidden="true" />{{ error }}</p>
      <a v-if="punto" :href="enlaceGoogleMaps({ ubicacion: textoUbicacion(punto) })" target="_blank" rel="noopener" class="enlace flex items-center gap-1 self-start"><ExternalLink :size="14" aria-hidden="true" />Ver en Google Maps</a>

      <div class="pie-fijo !flex sm:justify-end">
        <button type="button" class="btn-borde" @click="emit('cerrar')">Cancelar</button>
        <button type="button" class="btn" :disabled="!punto || ocupado === 'direccion'" @click="emit('aceptar', { ubicacion: textoUbicacion(punto), direccion: direccion.trim() })"><Check :size="18" aria-hidden="true" />Usar esta ubicación</button>
      </div>
    </div>
  </Modal>
</template>
