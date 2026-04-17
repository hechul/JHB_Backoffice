<template>
  <div class="empty-state">
    <component :is="icon" :size="48" :stroke-width="1.2" class="empty-state-icon" />
    <div class="empty-state-title">{{ title }}</div>
    <div v-if="description" class="empty-state-desc">{{ description }}</div>
    <slot name="action" />
  </div>
</template>

<script setup lang="ts">
import { Inbox } from 'lucide-vue-next'
import type { Component } from 'vue'

withDefaults(defineProps<{
  title: string
  description?: string
  icon?: Component
}>(), {
  icon: () => Inbox,
})
</script>
