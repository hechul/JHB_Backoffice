<template>
  <div class="tooltip-wrap" @mouseenter="show = true" @mouseleave="show = false">
    <slot />
    <div v-if="show" class="tooltip-content">{{ text }}</div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  text: string
}>()

const show = ref(false)
</script>
