<template>
  <div class="layout" :class="{ 'sidebar-collapsed': sidebarCollapsed, 'mobile-open': mobileMenuOpen }">
    <div class="layout-orb orb-a" aria-hidden="true"></div>
    <div class="layout-orb orb-b" aria-hidden="true"></div>
    <div class="layout-orb orb-c" aria-hidden="true"></div>
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
            <span v-show="!sidebarCollapsed" class="nav-item-label">{{ item.label }}</span>
            <span v-if="!sidebarCollapsed && item.badge" class="nav-badge">{{ item.badge }}</span>
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
        <div class="content-shell">
          <slot />
        </div>
      </main>
    </div>

    <ToastContainer />
  </div>
</template>

<script setup lang="ts">
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Home,
  ListChecks,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Settings2,
  Umbrella,
} from 'lucide-vue-next'

const route = useRoute()
const supabase = useSupabaseClient()
const { user, isAdmin, profileLoaded, logout } = useCurrentUser()

const sidebarCollapsed = ref(false)
const mobileMenuOpen = ref(false)
const pendingLeaveApprovalCount = ref(0)
const leaveApprovalTableMissing = ref(false)
let pendingBadgeTimer: ReturnType<typeof setInterval> | null = null

const attendanceMenuItems = computed(() => {
  if (isAdmin.value) {
    return [
      { path: '/attendance/records', label: '출퇴근 기록', icon: Clock3 },
      { path: '/attendance/admin', label: '금일 근태 이력', icon: ClipboardCheck },
      {
        path: '/attendance/leave-approvals',
        label: '휴가 승인',
        icon: Umbrella,
        badge: pendingLeaveApprovalCount.value > 0 ? String(pendingLeaveApprovalCount.value) : '',
      },
      { path: '/attendance/weekly', label: '주별 근태 기록', icon: ListChecks },
      { path: '/attendance/calendar', label: '월별 근태 캘린더', icon: CalendarRange },
      { path: '/attendance/settings', label: '근무 기준 설정', icon: Settings2 },
    ]
  }

  return [
    { path: '/attendance/records', label: '출퇴근 기록', icon: Clock3 },
    { path: '/attendance/leave', label: '휴가 · 반차 신청', icon: Umbrella },
    { path: '/attendance/weekly', label: '주별 근태 기록', icon: ListChecks },
    { path: '/attendance/calendar', label: '월별 근태 캘린더', icon: CalendarRange },
  ]
})

const pageTitles = computed(() => {
  const items = [
    { path: '/attendance/records', label: '출퇴근 기록' },
    { path: '/attendance/leave', label: '휴가 · 반차 신청' },
    { path: '/attendance/weekly', label: '주별 근태 기록' },
    { path: '/attendance/calendar', label: '월별 근태 캘린더' },
  ]

  if (isAdmin.value) {
    items.push(
      { path: '/attendance/admin', label: '금일 근태 이력' },
      { path: '/attendance/leave-approvals', label: '휴가 승인' },
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

function isMissingLeaveTableError(error: any) {
  const code = String(error?.code || '').toUpperCase()
  const msg = String(error?.message || '').toLowerCase()
  return code === '42P01' || msg.includes('leave_requests')
}

async function handleLogout() {
  await logout()
}

async function fetchPendingLeaveApprovalCount() {
  if (!isAdmin.value || !profileLoaded.value) {
    pendingLeaveApprovalCount.value = 0
    return
  }

  const { count, error } = await supabase
    .from('leave_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')

  if (error) {
    if (isMissingLeaveTableError(error)) {
      leaveApprovalTableMissing.value = true
      pendingLeaveApprovalCount.value = 0
      return
    }
    throw error
  }

  leaveApprovalTableMissing.value = false
  pendingLeaveApprovalCount.value = Number(count || 0)
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

watch(
  () => [profileLoaded.value, isAdmin.value, route.path],
  async ([loaded, admin]) => {
    if (!loaded || !admin) {
      pendingLeaveApprovalCount.value = 0
      return
    }
    if (leaveApprovalTableMissing.value && route.path !== '/attendance/leave-approvals') return
    try {
      await fetchPendingLeaveApprovalCount()
    } catch (error) {
      console.error('Failed to fetch pending leave approval count:', error)
    }
  },
  { immediate: true },
)

onMounted(() => {
  pendingBadgeTimer = setInterval(() => {
    void fetchPendingLeaveApprovalCount()
  }, 60 * 1000)
})

onBeforeUnmount(() => {
  if (pendingBadgeTimer) clearInterval(pendingBadgeTimer)
})
</script>

<style scoped>
.layout {
  display: flex;
  min-height: 100vh;
  position: relative;
  overflow: hidden;
  isolation: isolate;
  background:
    radial-gradient(960px 560px at 82% -8%, rgba(16, 185, 129, 0.1), transparent 68%),
    radial-gradient(940px 560px at 0% -18%, rgba(37, 99, 235, 0.1), transparent 70%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.72) 0%, rgba(244, 247, 251, 0.92) 34%, #f4f7fb 100%);
}

.layout-orb {
  position: fixed;
  border-radius: 999px;
  pointer-events: none;
  z-index: 0;
  filter: blur(10px);
  opacity: 0.72;
  animation: floatOrb 18s var(--ease-emphasized) infinite alternate;
}

.orb-a {
  width: 340px;
  height: 340px;
  top: 108px;
  right: -90px;
  background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.88), rgba(37, 99, 235, 0.2) 42%, rgba(37, 99, 235, 0.04) 78%);
}

.orb-b {
  width: 280px;
  height: 280px;
  left: -88px;
  bottom: 96px;
  background: radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.82), rgba(16, 185, 129, 0.18) 40%, rgba(16, 185, 129, 0.04) 78%);
  animation-duration: 22s;
}

.orb-c {
  width: 180px;
  height: 180px;
  top: 42%;
  left: 38%;
  background: radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.74), rgba(99, 102, 241, 0.16) 42%, rgba(99, 102, 241, 0.03) 76%);
  animation-duration: 16s;
}

.sidebar {
  width: var(--sidebar-width);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.86) 0%, rgba(255, 255, 255, 0.7) 100%);
  border-right: 1px solid rgba(255, 255, 255, 0.72);
  box-shadow: 18px 0 40px rgba(15, 23, 42, 0.1);
  backdrop-filter: blur(calc(var(--liquid-blur) + 8px)) saturate(160%);
  -webkit-backdrop-filter: blur(calc(var(--liquid-blur) + 8px)) saturate(160%);
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 100;
  transition: width var(--transition-normal), box-shadow var(--transition-normal);
}

.sidebar::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.44) 0%, rgba(255, 255, 255, 0.06) 100%),
    radial-gradient(420px 220px at 0% -10%, rgba(37, 99, 235, 0.08), transparent 72%);
  pointer-events: none;
}

.sidebar.collapsed {
  width: var(--sidebar-collapsed-width);
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: 20px 22px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.78);
  min-height: 74px;
  overflow: hidden;
  transition: background var(--transition-fast), transform var(--transition-fast);
}

.sidebar-logo:hover {
  background: rgba(255, 255, 255, 0.66);
  transform: translateY(-1px);
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
  padding: 20px 16px 24px;
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
  padding: 9px var(--space-md);
  border-radius: 12px;
  color: var(--color-sidebar-text);
  font-size: 0.92rem;
  font-weight: 450;
  white-space: nowrap;
  overflow: hidden;
  position: relative;
  transition: transform var(--transition-fast), background-color var(--transition-fast), color var(--transition-fast), box-shadow var(--transition-fast);
}

.nav-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 20%;
  width: 3px;
  height: 60%;
  border-radius: 99px;
  background: transparent;
  transition: background var(--transition-fast);
}

.nav-item-label {
  flex: 1;
  min-width: 0;
}

.nav-badge {
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 999px;
  background: linear-gradient(160deg, #4f8fff 0%, #2563eb 100%);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.76rem;
  font-weight: 800;
  box-shadow: 0 10px 22px rgba(37, 99, 235, 0.22);
  animation: badgePulse 3.4s var(--ease-emphasized) infinite;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.64);
  color: var(--color-sidebar-text-active);
  transform: translateX(2px);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.55);
}

.nav-item.active {
  background: linear-gradient(140deg, rgba(234, 242, 255, 0.92) 0%, rgba(219, 234, 254, 0.84) 100%);
  color: var(--color-sidebar-text-active);
  font-weight: 550;
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.12);
}

.nav-item.active::before {
  background: var(--color-primary);
}

.sidebar.collapsed .nav-item {
  justify-content: center;
  padding: 9px;
}

.nav-item.nav-home {
  color: var(--color-text-muted);
  font-size: 0.84rem;
  font-weight: 500;
  margin-bottom: var(--space-sm);
}

.nav-item.nav-home:hover {
  color: var(--color-primary);
  background: var(--color-sidebar-hover);
  transform: translateX(2px);
}

.sidebar-collapse-btn {
  margin: 0 var(--space-lg) var(--space-lg);
  height: 36px;
  border: 1px solid rgba(226, 232, 240, 0.84);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  background: rgba(255, 255, 255, 0.58);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
  transition: all var(--transition-fast);
}

.sidebar-collapse-btn:hover {
  background: rgba(255, 255, 255, 0.84);
  color: var(--color-text);
  transform: translateY(-1px);
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
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.94) 0%, rgba(244, 247, 251, 0.82) 100%);
  border: 1px solid rgba(255, 255, 255, 0.82);
  box-shadow: 0 10px 18px rgba(15, 23, 42, 0.06);
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
  position: relative;
  z-index: 1;
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
  background: rgba(255, 255, 255, 0.72);
  border-bottom: 1px solid rgba(255, 255, 255, 0.66);
  backdrop-filter: blur(calc(var(--liquid-blur) + 10px)) saturate(170%);
  -webkit-backdrop-filter: blur(calc(var(--liquid-blur) + 10px)) saturate(170%);
  box-shadow: 0 16px 30px rgba(15, 23, 42, 0.05);
}

.header::before {
  content: '';
  position: absolute;
  inset: auto 0 0;
  height: 1px;
  background: linear-gradient(90deg, transparent 0%, rgba(148, 163, 184, 0.2) 18%, rgba(148, 163, 184, 0.2) 82%, transparent 100%);
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
  border: 1px solid rgba(255, 255, 255, 0.74);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.62);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.04);
  color: var(--color-text-secondary);
  font-size: 0.84rem;
  font-weight: 500;
  transition: transform var(--transition-fast), background-color var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
}

.header-nav-btn:hover,
.header-refresh-btn:hover {
  background: rgba(255, 255, 255, 0.9);
  color: var(--color-text);
  border-color: rgba(255, 255, 255, 0.92);
  transform: translateY(-1px);
}

.header-date {
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.content {
  flex: 1;
  padding: 28px var(--space-2xl) 40px;
  position: relative;
}

.content-shell {
  width: min(100%, 1420px);
  margin: 0 auto;
  position: relative;
}

.content-shell::before {
  content: '';
  position: absolute;
  inset: -30px 6% auto;
  height: 220px;
  background:
    radial-gradient(360px 180px at 18% 50%, rgba(37, 99, 235, 0.08), transparent 72%),
    radial-gradient(360px 180px at 82% 50%, rgba(16, 185, 129, 0.08), transparent 72%);
  pointer-events: none;
  filter: blur(18px);
  z-index: 0;
}

.content-shell > * {
  position: relative;
  z-index: 1;
}

.mobile-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.32);
  z-index: 90;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.content-shell :deep(.records-page),
.content-shell :deep(.admin-page),
.content-shell :deep(.leave-page),
.content-shell :deep(.leave-approvals-page),
.content-shell :deep(.weekly-page),
.content-shell :deep(.calendar-page),
.content-shell :deep(.settings-page) {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  animation: attendancePageIn 0.44s var(--ease-emphasized) both;
}

.content-shell :deep(.records-page > *),
.content-shell :deep(.admin-page > *),
.content-shell :deep(.leave-page > *),
.content-shell :deep(.leave-approvals-page > *),
.content-shell :deep(.weekly-page > *),
.content-shell :deep(.calendar-page > *),
.content-shell :deep(.settings-page > *) {
  animation: attendanceSectionIn 0.46s var(--ease-emphasized) both;
}

.content-shell :deep(.records-page > *:nth-child(2)),
.content-shell :deep(.admin-page > *:nth-child(2)),
.content-shell :deep(.leave-page > *:nth-child(2)),
.content-shell :deep(.leave-approvals-page > *:nth-child(2)),
.content-shell :deep(.weekly-page > *:nth-child(2)),
.content-shell :deep(.calendar-page > *:nth-child(2)),
.content-shell :deep(.settings-page > *:nth-child(2)) {
  animation-delay: 0.04s;
}

.content-shell :deep(.records-page > *:nth-child(3)),
.content-shell :deep(.admin-page > *:nth-child(3)),
.content-shell :deep(.leave-page > *:nth-child(3)),
.content-shell :deep(.leave-approvals-page > *:nth-child(3)),
.content-shell :deep(.weekly-page > *:nth-child(3)),
.content-shell :deep(.calendar-page > *:nth-child(3)),
.content-shell :deep(.settings-page > *:nth-child(3)) {
  animation-delay: 0.08s;
}

.content-shell :deep(.records-page > *:nth-child(4)),
.content-shell :deep(.admin-page > *:nth-child(4)),
.content-shell :deep(.leave-page > *:nth-child(4)),
.content-shell :deep(.leave-approvals-page > *:nth-child(4)),
.content-shell :deep(.weekly-page > *:nth-child(4)),
.content-shell :deep(.calendar-page > *:nth-child(4)),
.content-shell :deep(.settings-page > *:nth-child(4)) {
  animation-delay: 0.12s;
}

.content-shell :deep(.page-header),
.content-shell :deep(.records-header),
.content-shell :deep(.admin-header),
.content-shell :deep(.settings-header) {
  position: relative;
  padding: 20px 22px;
  border-radius: 28px;
  border: 1px solid rgba(255, 255, 255, 0.82);
  background: linear-gradient(150deg, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0.76) 100%);
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.66);
  backdrop-filter: blur(calc(var(--liquid-blur) + 6px)) saturate(160%);
  -webkit-backdrop-filter: blur(calc(var(--liquid-blur) + 6px)) saturate(160%);
  overflow: hidden;
}

.content-shell :deep(.page-header::before),
.content-shell :deep(.records-header::before),
.content-shell :deep(.admin-header::before),
.content-shell :deep(.settings-header::before) {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(360px 120px at 0% 0%, rgba(255, 255, 255, 0.62), transparent 72%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.22), transparent 80%);
  pointer-events: none;
}

.content-shell :deep(.page-title),
.content-shell :deep(.records-title),
.content-shell :deep(.admin-title),
.content-shell :deep(.settings-title) {
  font-size: clamp(1.2rem, 1rem + 0.8vw, 1.65rem);
  font-weight: 760;
  letter-spacing: -0.03em;
}

.content-shell :deep(.page-subtitle),
.content-shell :deep(.settings-subtitle),
.content-shell :deep(.admin-subtitle),
.content-shell :deep(.today-label),
.content-shell :deep(.summary-label),
.content-shell :deep(.approval-metric-label),
.content-shell :deep(.approval-reason-label),
.content-shell :deep(.today-metric-label) {
  color: var(--color-text-muted);
}

.content-shell :deep(.section-head),
.content-shell :deep(.compact-head),
.content-shell :deep(.mini-week-head) {
  align-items: center;
  gap: 14px;
}

.content-shell :deep(.card),
.content-shell :deep(.approval-card),
.content-shell :deep(.today-person-card),
.content-shell :deep(.weekly-person-card),
.content-shell :deep(.monthly-log-card),
.content-shell :deep(.detail-record-card),
.content-shell :deep(.selected-leave-item),
.content-shell :deep(.confirm-modal),
.content-shell :deep(.leave-modal),
.content-shell :deep(.detail-dialog) {
  border-radius: 28px;
}

.content-shell :deep(.summary-card),
.content-shell :deep(.today-card),
.content-shell :deep(.form-card),
.content-shell :deep(.table-card),
.content-shell :deep(.board-card),
.content-shell :deep(.calendar-card),
.content-shell :deep(.approval-card),
.content-shell :deep(.today-person-card),
.content-shell :deep(.weekly-person-card),
.content-shell :deep(.monthly-log-card),
.content-shell :deep(.detail-record-card),
.content-shell :deep(.selected-leave-item) {
  border: 1px solid rgba(255, 255, 255, 0.82) !important;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.92) 0%, rgba(255, 255, 255, 0.78) 100%) !important;
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.7) !important;
  backdrop-filter: blur(calc(var(--liquid-blur) + 4px)) saturate(160%);
  -webkit-backdrop-filter: blur(calc(var(--liquid-blur) + 4px)) saturate(160%);
}

.content-shell :deep(.summary-card:hover),
.content-shell :deep(.approval-card:hover),
.content-shell :deep(.today-person-card:hover),
.content-shell :deep(.weekly-person-card:hover),
.content-shell :deep(.monthly-log-card:hover),
.content-shell :deep(.detail-record-card:hover) {
  transform: translateY(-2px);
  box-shadow: 0 28px 56px rgba(15, 23, 42, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.74);
}

.content-shell :deep(.summary-grid) {
  gap: 16px;
}

.content-shell :deep(.summary-card) {
  overflow: hidden;
}

.content-shell :deep(.summary-icon-wrap) {
  width: 36px;
  height: 36px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.88);
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.06);
}

.content-shell :deep(.approval-metric),
.content-shell :deep(.today-metric),
.content-shell :deep(.today-item),
.content-shell :deep(.detail-metric),
.content-shell :deep(.detail-record-metric),
.content-shell :deep(.detail-field),
.content-shell :deep(.monthly-log-item),
.content-shell :deep(.approval-reason-box),
.content-shell :deep(.selected-leave-meta),
.content-shell :deep(.calendar-tools),
.content-shell :deep(.session-item),
.content-shell :deep(.mini-week-item),
.content-shell :deep(.today-note-row) {
  border: 1px solid rgba(226, 232, 240, 0.78);
  background: rgba(255, 255, 255, 0.72);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.64);
  backdrop-filter: blur(10px) saturate(145%);
  -webkit-backdrop-filter: blur(10px) saturate(145%);
}

.content-shell :deep(.calendar-day) {
  border-radius: 24px;
  border: 1px solid rgba(226, 232, 240, 0.76);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.04);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  transition: border-color var(--transition-fast), background-color var(--transition-fast), box-shadow var(--transition-fast);
  contain: layout paint;
}

.content-shell :deep(.calendar-day:hover:not(:disabled)) {
  transform: none;
  border-color: rgba(37, 99, 235, 0.22);
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.06);
}

.content-shell :deep(.mini-week-item),
.content-shell :deep(.session-item),
.content-shell :deep(.approval-metric),
.content-shell :deep(.today-item),
.content-shell :deep(.monthly-log-item),
.content-shell :deep(.detail-record-metric) {
  border-radius: 18px;
}

.content-shell :deep(.status-filter-chip),
.content-shell :deep(.status-chip),
.content-shell :deep(.today-pill),
.content-shell :deep(.weekly-summary-chip),
.content-shell :deep(.calendar-stat),
.content-shell :deep(.legend-item) {
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.82);
  background: rgba(255, 255, 255, 0.76);
  box-shadow: 0 10px 18px rgba(15, 23, 42, 0.04);
  backdrop-filter: blur(12px) saturate(150%);
  -webkit-backdrop-filter: blur(12px) saturate(150%);
}

.content-shell :deep(.calendar-page .calendar-stat),
.content-shell :deep(.calendar-page .legend-item) {
  border-color: rgba(226, 232, 240, 0.78);
  background: rgba(248, 250, 252, 0.94);
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.content-shell :deep(.status-filter-chip) {
  min-height: 36px;
  padding: 8px 14px;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast), border-color var(--transition-fast), background-color var(--transition-fast), color var(--transition-fast);
}

.content-shell :deep(.status-filter-chip:hover) {
  transform: translateY(-1px);
  box-shadow: 0 14px 24px rgba(15, 23, 42, 0.06);
}

.content-shell :deep(.status-filter-chip.active) {
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.98) 0%, rgba(238, 244, 255, 0.9) 100%);
  border-color: rgba(191, 219, 254, 0.94);
  color: var(--color-text);
}

.content-shell :deep(.status-chip) {
  padding: 6px 12px;
  font-size: 0.78rem;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.content-shell :deep(.btn) {
  min-height: 40px;
  border-radius: 15px;
}

.content-shell :deep(.btn-primary) {
  background: linear-gradient(160deg, #5b9bff 0%, #2f74f2 52%, #2457c6 100%);
  box-shadow: 0 16px 30px rgba(47, 116, 242, 0.2), 0 2px 8px rgba(15, 23, 42, 0.06);
}

.content-shell :deep(.btn-primary:hover:not(:disabled)) {
  transform: translateY(-1px);
  box-shadow: 0 18px 34px rgba(47, 116, 242, 0.24), 0 2px 10px rgba(15, 23, 42, 0.08);
}

.content-shell :deep(.btn-ghost),
.content-shell :deep(.btn-secondary) {
  border: 1px solid rgba(255, 255, 255, 0.82);
  background: rgba(255, 255, 255, 0.74);
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.04);
}

.content-shell :deep(.btn-ghost:hover:not(:disabled)),
.content-shell :deep(.btn-secondary:hover:not(:disabled)) {
  background: rgba(255, 255, 255, 0.92);
}

.content-shell :deep(.input),
.content-shell :deep(.select-input),
.content-shell :deep(.textarea-input),
.content-shell :deep(.dt-input) {
  border-radius: 16px;
  border: 1px solid rgba(226, 232, 240, 0.86);
  background: rgba(255, 255, 255, 0.86);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7), 0 10px 18px rgba(15, 23, 42, 0.04);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast), background-color var(--transition-fast), transform var(--transition-fast);
}

.content-shell :deep(.input:focus),
.content-shell :deep(.select-input:focus),
.content-shell :deep(.textarea-input:focus),
.content-shell :deep(.dt-input:focus) {
  border-color: rgba(96, 165, 250, 0.82);
  box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.12), 0 16px 26px rgba(15, 23, 42, 0.06);
  outline: none;
  transform: translateY(-1px);
}

.content-shell :deep(.modal-backdrop),
.content-shell :deep(.detail-modal) {
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  animation: backdropFadeIn 0.22s var(--ease-standard);
}

.content-shell :deep(.confirm-modal),
.content-shell :deep(.leave-modal),
.content-shell :deep(.detail-dialog) {
  border: 1px solid rgba(255, 255, 255, 0.84);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(255, 255, 255, 0.84) 100%);
  box-shadow: 0 28px 56px rgba(15, 23, 42, 0.14);
  backdrop-filter: blur(calc(var(--liquid-blur) + 8px)) saturate(170%);
  -webkit-backdrop-filter: blur(calc(var(--liquid-blur) + 8px)) saturate(170%);
  animation: attendanceModalIn 0.34s var(--ease-emphasized);
}

.content-shell :deep(.table-empty),
.content-shell :deep(.history-empty),
.content-shell :deep(.empty-state-desc) {
  color: var(--color-text-muted);
}

@keyframes floatOrb {
  from {
    transform: translate3d(0, 0, 0) scale(1);
  }
  to {
    transform: translate3d(18px, -16px, 0) scale(1.08);
  }
}

@keyframes badgePulse {
  0%, 100% {
    transform: scale(1);
    box-shadow: 0 10px 22px rgba(37, 99, 235, 0.22);
  }
  50% {
    transform: scale(1.05);
    box-shadow: 0 14px 28px rgba(37, 99, 235, 0.28);
  }
}

@keyframes attendancePageIn {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes attendanceSectionIn {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes attendanceModalIn {
  from {
    opacity: 0;
    transform: translateY(22px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes backdropFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (max-width: 960px) {
  .layout-orb {
    display: none;
  }

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

  .content-shell::before {
    inset: -20px 2% auto;
    height: 160px;
  }
}
</style>
