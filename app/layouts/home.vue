<template>
  <div class="home-layout">
    <!-- Header -->
    <header class="home-header">
      <div class="home-header-left">
        <NuxtLink to="/" class="home-logo">
          <img src="/jhbiofarm-logo.png" alt="JHBioFarm 로고" class="home-logo-mark" />
          <span class="home-logo-text">JHBioFarm</span>
        </NuxtLink>
        <span class="home-logo-sub">백오피스</span>
        <div v-if="showHeaderNavButtons" class="home-nav-actions">
          <button type="button" class="home-nav-btn" aria-label="뒤로가기" @click="handleGoBack">
            <ChevronLeft :size="16" :stroke-width="1.8" />
            <span>뒤로</span>
          </button>
          <button type="button" class="home-nav-btn" aria-label="홈으로 이동" @click="handleGoHome">
            <House :size="16" :stroke-width="1.8" />
            <span>홈으로</span>
          </button>
        </div>
      </div>
      <div class="home-header-right">
        <span class="home-date">{{ today }}</span>
        <div class="home-user">
          <div class="home-user-avatar">{{ avatarInitial }}</div>
          <div class="home-user-info">
            <span class="home-user-name">{{ user.name }}</span>
            <span class="home-user-role">{{ roleLabel }}</span>
          </div>
        </div>
        <button class="home-logout-btn" type="button" aria-label="로그아웃" @click="handleLogout">
          <LogOut :size="16" :stroke-width="1.8" />
        </button>
      </div>
    </header>

    <!-- Content -->
    <main class="home-content">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { LogOut, House, ChevronLeft } from 'lucide-vue-next'

const { user, profileLoaded, logout } = useCurrentUser()
const route = useRoute()
const router = useRouter()

const today = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}`
})

const avatarInitial = computed(() => user.value.name?.charAt(0) || '관')
const roleLabel = computed(() => {
  if (!profileLoaded.value) return '확인중'
  const r = user.value.role
  if (r === 'admin') return 'Admin'
  if (r === 'modifier') return 'Modifier'
  return 'Viewer'
})
const showHeaderNavButtons = computed(() => route.path !== '/')

function handleGoHome() {
  navigateTo('/')
}

function handleGoBack() {
  if (import.meta.client && window.history.length > 1) {
    router.back()
    return
  }
  navigateTo('/')
}

function handleLogout() {
  logout()
}
</script>

<style scoped>
.home-layout {
  min-height: 100vh;
  background: var(--color-bg);
}

/* Header */
.home-header {
  height: 64px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-3xl);
}

.home-header-left {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
}

.home-logo {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.home-logo-mark {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.home-logo-text {
  font-weight: 700;
  font-size: 1.125rem;
  color: var(--color-text);
}

.home-logo-sub {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  padding-left: var(--space-md);
  border-left: 1px solid var(--color-border-light);
}

.home-nav-actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.home-nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  font-weight: 500;
  transition: all 0.12s ease;
}

.home-nav-btn:hover {
  background: var(--color-bg);
  color: var(--color-text);
  border-color: #D1D5DB;
}

.home-header-right {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
}

.home-date {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.home-user {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.home-user-avatar {
  width: 32px;
  height: 32px;
  background: #F3F4F6;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.home-user-info {
  display: flex;
  flex-direction: column;
}

.home-user-name {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text);
  line-height: 1.2;
}

.home-user-role {
  font-size: 0.6875rem;
  color: var(--color-text-muted);
  line-height: 1.2;
}

.home-logout-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  transition: all 0.12s ease;
}

.home-logout-btn:hover {
  background: #F3F4F6;
  color: var(--color-text);
}

/* Content */
.home-content {
  max-width: 1120px;
  margin: 0 auto;
  padding: var(--space-3xl);
}

@media (max-width: 768px) {
  .home-header {
    padding: 0 var(--space-lg);
  }

  .home-logo-sub {
    display: none;
  }

  .home-nav-btn span {
    display: none;
  }

  .home-date {
    display: none;
  }

  .home-user-info {
    display: none;
  }

  .home-content {
    padding: var(--space-xl);
  }
}
</style>
