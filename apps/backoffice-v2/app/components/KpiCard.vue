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
  padding: 22px 24px;
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.kpi-card.card-clickable {
  cursor: pointer;
  text-decoration: none;
  color: inherit;
  display: block;
}

.kpi-card.card-clickable:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
}

.kpi-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-md);
}

.kpi-label {
  font-size: 0.88rem;
  color: var(--color-text-secondary);
  font-weight: 600;
}

.kpi-icon-wrap {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.kpi-value {
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: -0.04em;
  color: var(--color-text);
  line-height: 1.2;
}

.kpi-change {
  margin-top: var(--space-sm);
  font-size: 0.9rem;
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
