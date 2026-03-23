<template>
  <div class="status-badge-wrap">
    <span class="badge" :class="badgeClass">
      <span v-if="dot" class="badge-dot" :class="badgeClass"></span>
      {{ label }}
    </span>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  label: string
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'
  dot?: boolean
}>()

const badgeClass = computed(() => {
  return `badge-${props.variant || 'neutral'}`
})
</script>

<style scoped>
.status-badge-wrap {
  display: inline-flex;
}

.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 4px;
  flex-shrink: 0;
}

.badge-dot.badge-success { background: var(--color-success); }
.badge-dot.badge-danger { background: var(--color-danger); }
.badge-dot.badge-warning { background: var(--color-warning); }
.badge-dot.badge-primary { background: var(--color-primary); }
.badge-dot.badge-info { background: var(--color-info); }
.badge-dot.badge-neutral { background: #9CA3AF; }
</style>
