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
import { formatCurrency } from '~/composables/useMoneyFormat'

const props = defineProps<{
  label: string
  value: number
  icon: Component
  iconBg?: string
  iconColor?: string
  change?: number
  format?: 'number' | 'currency'
  suffix?: string
  to?: string | Record<string, any>
}>()

const formattedValue = computed(() => {
  if (props.format === 'currency') return formatCurrency(props.value)
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
  min-height: 146px;
  padding: 20px;
  border-radius: 18px;
  border-color: rgba(229, 235, 242, 0.96);
  background: #FFFFFF;
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.kpi-card.card-clickable {
  cursor: pointer;
  text-decoration: none;
  color: inherit;
  display: block;
}

.kpi-card.card-clickable:hover {
  transform: translateY(-1px);
  border-color: rgba(49, 130, 246, 0.14);
  box-shadow: none;
}

.kpi-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.kpi-label {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
  font-weight: 700;
  letter-spacing: -0.01em;
}

.kpi-icon-wrap {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.kpi-value {
  font-size: clamp(1.82rem, 2vw, 2.12rem);
  font-weight: 800;
  letter-spacing: -0.05em;
  color: var(--color-text);
  line-height: 1.04;
}

.kpi-change {
  margin-top: 10px;
  font-size: 0.8rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 4px;
  padding-top: 10px;
  border-top: 1px solid rgba(229, 235, 242, 0.96);
}

.kpi-change.positive {
  color: var(--color-success);
}

.kpi-change.negative {
  color: var(--color-danger);
}

.kpi-change-label {
  color: var(--color-text-muted);
  font-weight: 600;
  margin-left: 4px;
}
</style>
