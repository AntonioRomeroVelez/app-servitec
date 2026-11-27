<script setup>
import { computed } from 'vue'
import { Menu, Bell } from 'lucide-vue-next'
import { estiloFondo } from '../tema'

// Maqueta de cómo quedan el ingreso, el menú, la barra superior y una tarjeta con lo que se está editando (sin guardar).
// Los colores principal y de acento ya están aplicados a la app mientras la pantalla de Ajustes está abierta.
const props = defineProps({ empresa: Object, tema: Object, logo: String, logoClaro: String, fondoImagen: String })
const fondo = computed(() => estiloFondo(props.tema, props.fondoImagen))
const encabezado = computed(() => ({ backgroundColor: props.tema.encabezado || 'var(--color-brand-800)' }))
</script>

<template>
  <div class="grid content-start gap-3" aria-label="Vista previa">
    <h3 class="font-semibold text-brand-800">Vista previa</h3>

    <figure class="grid gap-1">
      <figcaption class="text-xs text-brand-700">Pantalla de ingreso</figcaption>
      <div class="grid justify-items-center gap-3 rounded-xl px-4 py-5" :style="fondo">
        <img v-if="logoClaro" :src="logoClaro" :alt="empresa.nombre" class="max-h-12 max-w-40 object-contain" />
        <span v-else-if="logo" class="rounded-xl bg-white px-3 py-2"><img :src="logo" :alt="empresa.nombre" class="max-h-10 max-w-36 object-contain" /></span>
        <b v-else class="text-xl text-white">{{ empresa.nombre }}</b>
        <div class="grid w-full max-w-52 gap-2 rounded-xl bg-white p-3">
          <span class="h-6 rounded-lg border border-brand-200" />
          <span class="h-6 rounded-lg border border-brand-200" />
          <span class="rounded-lg bg-brand-600 py-1 text-center text-xs font-semibold text-white">Entrar</span>
        </div>
      </div>
    </figure>

    <figure class="grid gap-1">
      <figcaption class="text-xs text-brand-700">Menú</figcaption>
      <div class="rounded-xl px-4 py-3 text-white" :style="encabezado">
        <img v-if="logoClaro" :src="logoClaro" :alt="empresa.nombre" class="max-h-8 max-w-36 object-contain" />
        <span v-else-if="logo" class="inline-block rounded-lg bg-white px-2 py-1"><img :src="logo" :alt="empresa.nombre" class="max-h-7 max-w-32 object-contain" /></span>
        <b v-else>{{ empresa.nombre }}</b>
      </div>
    </figure>

    <figure class="grid gap-1">
      <figcaption class="text-xs text-brand-700">Barra superior y contenido</figcaption>
      <div class="overflow-hidden rounded-xl border border-brand-200">
        <div class="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white" :style="encabezado">
          <Menu :size="18" aria-hidden="true" /><span class="flex-1">Agenda de visitas</span><Bell :size="16" aria-hidden="true" />
        </div>
        <div class="grid gap-2 bg-brand-50 p-3">
          <div class="grid gap-1 rounded-xl border-l-4 border-brand-500 bg-white p-2.5 shadow-sm">
            <b class="text-sm text-brand-900">Cliente de ejemplo</b>
            <span class="flex flex-wrap gap-1.5 text-xs font-semibold">
              <span class="rounded-full bg-brand-100 px-2 py-0.5 text-brand-800">Programada</span>
              <span class="rounded-full bg-acento px-2 py-0.5 text-acento-texto">En curso</span>
            </span>
          </div>
          <div class="flex gap-2">
            <span class="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">Botón principal</span>
            <span class="rounded-lg bg-acento px-3 py-1.5 text-xs font-semibold text-acento-texto">Botón destacado</span>
          </div>
        </div>
      </div>
    </figure>
  </div>
</template>
