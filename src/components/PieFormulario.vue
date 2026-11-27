<script setup>
// Pie común de los formularios en ventana: error a la vista y los botones Cancelar y Guardar siempre fijos abajo.
defineProps({ texto: { type: String, default: 'Guardar' }, cargando: Boolean, error: { type: String, default: '' } })
defineEmits(['cancelar'])
</script>

<template>
  <div class="pie-fijo">
    <p v-if="error" class="aviso-error" role="alert">{{ error }}</p>
    <div class="flex gap-2.5 sm:justify-end">
      <button type="button" class="btn-borde" @click="$emit('cancelar')">Cancelar</button>
      <button type="submit" class="btn" :disabled="cargando">{{ cargando ? 'Guardando…' : texto }}</button>
    </div>
  </div>
</template>
