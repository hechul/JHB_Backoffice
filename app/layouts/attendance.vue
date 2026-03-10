<template>
  <div class="layout" :class="{ 'sidebar-collapsed': sidebarCollapsed, 'mobile-open': mobileMenuOpen }">
    <div v-if="mobileMenuOpen" class="mobile-overlay" @click="mobileMenuOpen = false"></div>

    <aside class="sidebar" :class="{ collapsed: sidebarCollapsed }">
      <NuxtLink to="/" class="sidebar-logo" @click="mobileMenuOpen = false">
        <img src="/jhbiofarm-logo.png" alt="JHBioFarm 로고" class="logo-mark" />
        <span v-show="!sidebarCollapsed" class="logo-text">JHBioFarm</span>
      </NuxtLink>

      <nav class="sidebar-nav">
        <div class="nav-group">
          <NuxtLink to="/" class="nav-item nav-home" @click="mobileMenuOpen = false">
            <Home :size="18" :stroke-width="1.8" />
            <span v-show="!sidebarCollapsed">홈으로</span>
          </NuxtLink>
        </div>

        <div class="nav-group">
          <div v-show="!sidebarCollapsed" class="nav-group-label">근태 관리</div>
          <NuxtLink
            v-for="item in attendanceMenuItems"
            :key="item.path"
            :to="item.path"
            class="nav-item"
            :class="{ active: isActive(item.path) }"
            @click="mobileMenuOpen = false"
          >
            <component :is="item.icon" :size="18" :stroke-width="1.8" />
            <span v-show="!sidebarCollapsed">{{ item.label }}</span>
          </NuxtLink>
        </div>
      </nav>

      <button class="sidebar-collapse-btn" @click="sidebarCollapsed = !sidebarCollapsed">
        <PanelLeftClose v-if="!sidebarCollapsed" :size="16" :stroke-width="1.8" />
        <PanelLeftOpen v-else :size="16" :stroke-width="1.8" />
      </button>

      <div class="sidebar-footer">
        <div class="user-info">
          <div class="user-avatar">{{ avatarInitial }}</div>
          <div v-show="!sidebarCollapsed" class="user-detail">
            <span class="user-name">{{ user.name }}</span>
            <span class="user-role">{{ roleLabel }}</span>
          </div>
        </div>
        <button class="sidebar-logout-btn" type="button" @click="handleLogout">
          <LogOut :size="16" :stroke-width="1.8" />
          <span v-show="!sidebarCollapsed">로그아웃</span>
        </button>
      </div>
    </aside>

    <div class="main-wrapper">
      <header class="header">
        <div class="header-left">
          <button class="mobile-menu-btn" @click="mobileMenuOpen = !mobileMenuOpen">
            <Menu :size="20" :stroke-width="1.8" />
          </button>

          <div class="breadcrumb">
            <span class="breadcrumb-item">근태 관리</span>
            <ChevronRight :size="12" :stroke-width="2" class="breadcrumb-separator" />
            <span class="breadcrumb-current">{{ currentPageTitle }}</span>
          </div>

          <div v-if="showHeaderNavButtons" class="header-nav-actions">
            <button type="button" class="header-nav-btn" aria-label="뒤로가기" @click="handleGoBack">
              <ChevronLeft :size="15" :stroke-width="1.8" />
              <span>뒤로</span>
            </button>
            <NuxtLink to="/" class="header-nav-btn" aria-label="홈으로 이동">
              <Home :size="15" :stroke-width="1.8" />
              <span>홈</span>
            </NuxtLink>
          </div>
        </div>

        <div class="header-actions">
          <button
            class="header-refresh-btn"
            type="button"
            title="새로고침"
            aria-label="페이지 새로고침"
            @click="handlePageRefresh"
          >
            <RefreshCw :size="16" :stroke-width="1.8" />
          </button>
          <span class="header-date">{{ today }}</span>
        </div>
      </header>

      <main class="content">
        <slot />
      </main>
    </div>

    <ToastContainer />
  </div>
</template>

<script setup lang="ts">
import {
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Home,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Settings2,
} from 'lucide-vue-next'

const route = useRoute()
const { user, isAdmin, profileLoaded, logout } = useCurrentUser()

const sidebarCollapsed = ref(false)
const mobileMenuOpen = ref(false)

const attendanceMenuItems = computed(() => {
  if (isAdmin.value) {
    return [
      { path: '/attendance/records', label: '출퇴근 기록', icon: Clock3 },
      { path: '/attendance/admin', label: '근태 전체 관리', icon: ClipboardCheck },
      { path: '/attendance/settings', label: '근무 기준 설정', icon: Settings2 },
    ]
  }

  return [
    { path: '/attendance/records', label: '출퇴근 기록', icon: Clock3 },
  ]
})

const pageTitles = computed(() => {
  const items = [
    { path: '/attendance/records', label: '출퇴근 기록' },
  ]

  if (isAdmin.value) {
    items.push(
      { path: '/attendance/admin', label: '근태 전체 관리' },
      { path: '/attendance/settings', label: '근무 기준 설정' },
    )
  }

  return items
})

const isActive = (path: string) => route.path === path || route.path.startsWith(`${path}/`)

const currentPageTitle = computed(() => {
  const item = pageTitles.value.find((entry) => entry.path === route.path)
  return item?.label || '근태 관리'
})

const avatarInitial = computed(() => user.value.name?.charAt(0) || '관')
const roleLabel = computed(() => {
  if (!profileLoaded.value) return '확인중'
  if (user.value.role === 'admin') return 'Admin'
  if (user.value.role === 'modifier') return 'Modifier'
  return 'Viewer'
})

const today = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}`
})

const showHeaderNavButtons = computed(() => route.path !== '/attendance/records')

function handleLogout() {
  logout()
}

function handlePageRefresh() {
  if (!process.client) return
  window.location.reload()
}

async function goHomeWithFallback() {
  mobileMenuOpen.value = false
  try {
    await navigateTo('/')
  } catch {
    // noop
  }
  if (import.meta.client && window.location.pathname !== '/') {
    window.location.assign('/')
  }
}

async function handleGoBack() {
  if (import.meta.client && window.history.length > 1) {
    const beforePath = window.location.pathname
    window.history.back()
    window.setTimeout(() => {
      if (window.location.pathname === beforePath) {
        window.location.assign('/attendance/records')
      }
    }, 320)
    return
  }
  await goHomeWithFallback()
}

watch(() => route.path, () => {
  mobileMenuOpen.value = false
})
</script>

<style scoped>
.layout {
  display: flex;
  min-height: 100vh;
  background:
    radial-gradient(900px 500px at 80% -10%, rgba(16, 185, 129, 0.08), transparent 70%),
    radial-gradient(900px 500px at 0% -20%, rgba(37, 99, 235, 0.06), transparent 72%),
    transparent;
}

.sidebar {
  width: var(--sidebar-width);
  background: var(--liquid-bg-strong);
  border-right: 1px solid var(--liquid-border);
  box-shadow: 12px 0 28px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 100;
  transition: width var(--transition-normal), box-shadow var(--transition-normal);
}

.sidebar.collapsed {
  width: var(--sidebar-collapsed-width);
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-xl);
  border-bottom: 1px solid var(--color-border-light);
  min-height: 65px;
  overflow: hidden;
  transition: background var(--transition-fast);
}

.sidebar-logo:hover {
  background: rgba(255, 255, 255, 0.62);
}

.logo-mark {
  width: 28px;
  height: 28px;
  object-fit: contain;
  flex-shrink: 0;
}

.logo-text {
  font-weight: 700;
  font-size: 1.05rem;
  color: var(--color-text);
  white-space: nowrap;
}

.sidebar-nav {
  flex: 1;
  padding: var(--space-lg);
  overflow-y: auto;
}

.nav-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: var(--space-lg);
}

.nav-group-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  padding: var(--space-sm) var(--space-md);
  margin-bottom: var(--space-sm);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: 12px var(--space-md);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: 0.94rem;
  font-weight: 500;
  transition: all var(--transition-fast);
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.66);
  color: var(--color-text);
}

.nav-item.active {
  background: linear-gradient(140deg, rgba(234, 242, 255, 0.92) 0%, rgba(219, 234, 254, 0.84) 100%);
  color: var(--color-text);
  font-weight: 550;
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.12);
}

.sidebar-collapse-btn {
  margin: 0 var(--space-lg) var(--space-lg);
  height: 36px;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  transition: all var(--transition-fast);
}

.sidebar-collapse-btn:hover {
  background: rgba(255, 255, 255, 0.68);
  color: var(--color-text);
}

.sidebar-footer {
  padding: var(--space-lg);
  border-top: 1px solid var(--color-border-light);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.user-info {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--liquid-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  font-size: 0.85rem;
  font-weight: 700;
}

.user-detail {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.user-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text);
  line-height: 1.2;
}

.user-role {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.sidebar-logout-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  transition: all var(--transition-fast);
}

.sidebar-logout-btn:hover {
  background: rgba(255, 255, 255, 0.62);
  color: var(--color-text);
}

.main-wrapper {
  flex: 1;
  margin-left: var(--sidebar-width);
  min-width: 0;
  display: flex;
  flex-direction: column;
  transition: margin-left var(--transition-normal);
}

.sidebar-collapsed .main-wrapper {
  margin-left: var(--sidebar-collapsed-width);
}

.header {
  height: 64px;
  padding: 0 var(--space-2xl);
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(255, 255, 255, 0.82);
  border-bottom: 1px solid rgba(255, 255, 255, 0.6);
}

.header-left,
.header-actions,
.header-nav-actions {
  display: flex;
  align-items: center;
}

.header-left {
  gap: var(--space-lg);
}

.header-actions {
  gap: var(--space-md);
}

.header-nav-actions {
  gap: var(--space-sm);
}

.mobile-menu-btn {
  display: none;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
}

.breadcrumb-item {
  font-size: 0.82rem;
  color: var(--color-text-muted);
}

.breadcrumb-current {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text);
}

.breadcrumb-separator {
  color: var(--color-text-muted);
}

.header-nav-btn,
.header-refresh-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: 0.84rem;
  font-weight: 500;
  transition: transform var(--transition-fast), background-color var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
}

.header-nav-btn:hover,
.header-refresh-btn:hover {
  background: var(--color-bg);
  color: var(--color-text);
  border-color: #D1D5DB;
  transform: translateY(-1px);
}

.header-date {
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.content {
  flex: 1;
  padding: var(--space-2xl);
}

.mobile-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.32);
  z-index: 90;
}

@media (max-width: 960px) {
  .sidebar {
    transform: translateX(-100%);
    transition: transform var(--transition-normal);
  }

  .mobile-open .sidebar {
    transform: translateX(0);
  }

  .main-wrapper,
  .sidebar-collapsed .main-wrapper {
    margin-left: 0;
  }

  .mobile-menu-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: var(--radius-md);
    color: var(--color-text-secondary);
  }

  .header {
    padding: 0 var(--space-lg);
  }

  .content {
    padding: var(--space-lg);
  }
}
</style>
