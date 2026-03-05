<template>
  <div class="home-page">
    <div class="welcome">
      <p class="welcome-greeting">JHBioFarm</p>
      <h1 class="welcome-title">업무를 선택하세요</h1>
    </div>

    <div class="feature-grid">
      <NuxtLink to="/upload" class="feature-card active">
        <div class="feature-icon">
          <BarChart3 :size="22" :stroke-width="1.8" />
        </div>
        <span class="feature-name">매출 분석</span>
      </NuxtLink>

      <NuxtLink to="/attendance" class="feature-card active">
        <div class="feature-icon">
          <Clock3 :size="22" :stroke-width="1.8" />
        </div>
        <span class="feature-name">근태 관리</span>
      </NuxtLink>

      <NuxtLink v-if="!isViewer" to="/automation" class="feature-card active">
        <div class="feature-icon">
          <Bot :size="22" :stroke-width="1.8" />
        </div>
        <span class="feature-name">업무 자동화</span>
      </NuxtLink>

      <div v-if="!isViewer" class="feature-card disabled">
        <div class="feature-icon">
          <Settings :size="22" :stroke-width="1.8" />
        </div>
        <span class="feature-name">설정</span>
        <span class="feature-badge">준비중</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  BarChart3,
  Bot,
  Clock3,
  Settings,
} from 'lucide-vue-next'

definePageMeta({ layout: 'home' })

const { isViewer } = useCurrentUser()
</script>

<style scoped>
.home-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 78vh;
  gap: var(--space-3xl);
  padding: var(--space-2xl);
}

.welcome {
  text-align: center;
}

.welcome-greeting {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--color-text-muted);
  margin-bottom: var(--space-xs);
}

.welcome-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text);
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-md);
  width: 100%;
  max-width: 520px;
}

.feature-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-xl) var(--space-md);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  text-decoration: none;
  color: inherit;
  transition: all 0.2s ease;
}

.feature-card:hover {
  border-color: var(--color-primary);
  box-shadow: 0 4px 16px rgba(37, 99, 235, 0.1);
  transform: translateY(-2px);
}

.feature-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  background: #EFF6FF;
  color: #2563EB;
}

.feature-name {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text);
}

@media (max-width: 768px) {
  .feature-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .feature-grid {
    grid-template-columns: 1fr;
  }
}

.feature-card.disabled {
  opacity: 0.38;
  pointer-events: none;
  cursor: not-allowed;
  position: relative;
}

.feature-card.disabled .feature-icon {
  background: var(--color-bg-secondary, #f3f4f6);
  color: var(--color-text-muted, #9ca3af);
}

.feature-badge {
  font-size: 0.6rem;
  font-weight: 600;
  color: var(--color-text-muted, #9ca3af);
  background: var(--color-bg-secondary, #f3f4f6);
  padding: 1px 6px;
  border-radius: 8px;
}
</style>
