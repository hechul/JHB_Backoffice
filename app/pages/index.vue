<template>
  <div class="home-page">
    <div class="welcome">
      <p class="welcome-greeting">{{ greeting }}, {{ user.name }}님</p>
      <h1 class="welcome-title">업무를 선택하세요</h1>
    </div>

    <div class="feature-grid">
      <NuxtLink to="/dashboard" class="feature-card active">
        <div class="feature-icon feature-icon-logo">
          <img src="/goodforpat.png" alt="굿포펫" class="feature-brand-mark" />
        </div>
        <span class="feature-name">굿포펫</span>
      </NuxtLink>

      <NuxtLink to="/attendance/records" class="feature-card active">
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

      <NuxtLink v-if="isAdmin" to="/settings/users" class="feature-card active">
        <div class="feature-icon">
          <UserCog :size="22" :stroke-width="1.8" />
        </div>
        <span class="feature-name">계정 관리</span>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  Bot,
  Clock3,
  UserCog,
} from 'lucide-vue-next'

definePageMeta({ layout: 'home' })

const { isViewer, isAdmin, user } = useCurrentUser()

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 12) return '좋은 아침이에요'
  if (h < 18) return '안녕하세요'
  if (h < 22) return '좋은 저녁이에요'
  return '좋은 밤이에요'
})
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
  position: relative;
}

.welcome {
  text-align: center;
  animation: fadeUp 0.35s var(--ease-emphasized) both;
}

.welcome-greeting {
  font-size: 0.95rem;
  font-weight: 500;
  letter-spacing: 0.01em;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-xs);
}

.welcome-title {
  font-size: 2.05rem;
  font-weight: 700;
  color: transparent;
  background: linear-gradient(135deg, #0f172a 0%, #1d4ed8 54%, #0f766e 100%);
  -webkit-background-clip: text;
  background-clip: text;
  letter-spacing: -0.01em;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-md);
  width: 100%;
  max-width: 540px;
}

.feature-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-xl) var(--space-md);
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  text-decoration: none;
  color: inherit;
  transition: transform var(--transition-normal), border-color var(--transition-normal), box-shadow var(--transition-normal), background var(--transition-normal);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08), 0 1px 4px rgba(15, 23, 42, 0.04);
  position: relative;
  overflow: hidden;
  animation: fadeUp 0.34s var(--ease-emphasized) both;
  backdrop-filter: blur(10px) saturate(130%);
  -webkit-backdrop-filter: blur(10px) saturate(130%);
}

.feature-card:nth-child(1) { animation-delay: 0.04s; }
.feature-card:nth-child(2) { animation-delay: 0.08s; }
.feature-card:nth-child(3) { animation-delay: 0.12s; }
.feature-card:nth-child(4) { animation-delay: 0.16s; }

.feature-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.36), rgba(255, 255, 255, 0.05));
  opacity: 0.6;
  transition: opacity var(--transition-normal);
  pointer-events: none;
}

.feature-card:hover {
  border-color: var(--color-primary);
  box-shadow: 0 14px 26px rgba(29, 99, 233, 0.14), 0 2px 8px rgba(15, 23, 42, 0.06);
  transform: translateY(-1px);
}

.feature-card:hover::before {
  opacity: 0.78;
}

.feature-icon {
  width: 52px;
  height: 52px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, rgba(239, 246, 255, 0.9) 0%, rgba(219, 234, 254, 0.82) 100%);
  color: #1f5ecf;
  transition: transform var(--transition-normal), box-shadow var(--transition-normal), background var(--transition-normal);
}

.feature-icon-logo {
  padding: 8px;
}

.feature-brand-mark {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.feature-card:hover .feature-icon {
  transform: translateY(-1px) scale(1.02);
  background: linear-gradient(145deg, rgba(219, 234, 254, 0.95) 0%, rgba(191, 219, 254, 0.85) 100%);
  box-shadow: 0 6px 12px rgba(29, 78, 216, 0.15);
}

.feature-name {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text);
  letter-spacing: 0.01em;
}

@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
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

</style>
