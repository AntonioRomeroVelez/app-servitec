<script setup>
import { useConfiguracion } from '../composables/useConfiguracion'

// Marca de la empresa: el logo si el superadmin subió uno; si no, el nombre y el subtítulo. Por defecto va en blanco
// (para fondos de color); con `oscuro` se usan los colores de la marca (para fondos claros).
defineProps({ grande: Boolean, oscuro: Boolean })
const { empresa, logo } = useConfiguracion()
</script>

<template>
  <div class="text-center" :class="oscuro ? 'text-brand-800' : 'text-white'">
    <!-- El logo va sobre una placa blanca para que se vea bien con cualquier color de fondo -->
    <span v-if="logo" class="inline-block rounded-2xl px-4 py-3" :class="oscuro ? '' : 'bg-white shadow-md'">
      <img :src="logo" :alt="empresa.nombre" class="mx-auto w-auto object-contain" :class="grande ? 'max-h-20 max-w-56' : 'max-h-12 max-w-44'" />
    </span>
    <template v-else>
      <p class="font-black tracking-wide" :class="grande ? 'text-4xl' : 'text-3xl'">{{ empresa.nombre }}</p>
      <p v-if="empresa.subtitulo" class="text-xs font-semibold tracking-[0.35em]" :class="oscuro ? 'text-brand-600' : 'text-acento'">{{ empresa.subtitulo }}</p>
    </template>
  </div>
</template>
