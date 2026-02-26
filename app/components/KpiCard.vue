<template>
  <component
    :is="to ? resolveComponent('NuxtLink') : 'div'"
    :to="to || undefined"
    class="kpi-card card"
    :class="{ 'card-clickable': !!to }"
  >
    <div class="kpi-header">
      <span class="kpi-label">{{ label }}</span>
      <div class="kpi-icon-wrap" :style="{ background: iconBg }">
        <component :is="icon" :size="16" :stroke-width="1.8" :style="{ color: iconColor }" />
      </div>
    </div>
    <div class="kpi-value">{{ formattedValue }}</div>
    <div v-if="change !== undefined" class="kpi-change" :class="changeClass">
      <TrendingUp v-if="change > 0" :size="14" :stroke-width="2" />
      <TrendingDown v-else-if="change < 0" :size="14" :stroke-width="2" />
      {{ changePrefix }}{{ change }}%
      <span class="kpi-change-label">vs 지난달</span>
    </div>
  </component>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import { resolveComponent } from 'vue'
import { TrendingUp, TrendingDown } from 'lucide-vue-next'

const props = defineProps<{
  label: string
  value: number
  icon: Component
  iconBg?: string
  iconColor?: string
  change?: number
  suffix?: string
  to?: string
}>()

const formattedValue = computed(() => {
  if (props.suffix) return props.value.toLocaleString() + props.suffix
  return props.value.toLocaleString()
})

const changeClass = computed(() => {
  if (!props.change) return ''
  return props.change > 0 ? 'positive' : 'negative'
})

const changePrefix = computed(() => {
  if (!props.change) return ''
  return props.change > 0 ? '+' : ''
})
</script>

<style scoped>
.kpi-card {
  padding: var(--space-xl);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.kpi-card.card-clickable {
  cursor: pointer;
  text-decoration: none;
  color: inherit;
  display: block;
}

.kpi-card.card-clickable:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.kpi-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-md);
}

.kpi-label {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  font-weight: 450;
}

.kpi-icon-wrap {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
}

.kpi-value {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--color-text);
  line-height: 1.2;
}

.kpi-change {
  margin-top: var(--space-sm);
  font-size: 0.75rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 2px;
}

.kpi-change.positive {
  color: var(--color-success);
}

.kpi-change.negative {
  color: var(--color-danger);
}

.kpi-change-label {
  color: var(--color-text-muted);
  font-weight: 400;
  margin-left: 4px;
}
</style>
