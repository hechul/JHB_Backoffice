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
          <button class="mobile-menu-btn" @click="toggleMobileMenu">
            <Menu :size="20" :stroke-width="1.8" />
          </button>

          <div class="breadcrumb">
            <span class="breadcrumb-item">근태 관리</span>
            <ChevronRight :size="12" :stroke-width="2" class="breadcrumb-separator" />
            <span class="breadcrumb-current">{{ currentPageTitle }}</span>
          </div>
        </div>
      </header>

      <main class="content">
        <div class="content-shell">
          <slot />
        </div>
      </main>
    </div>

    <nav class="mobile-quick-nav" aria-label="근태 빠른 이동">
      <NuxtLink
        v-for="item in mobileQuickNavItems"
        :key="`mobile-${item.path}`"
        :to="item.path"
        class="mobile-quick-link"
        :class="{ active: isActive(item.path) }"
        @click="mobileMenuOpen = false"
      >
        <span class="mobile-quick-icon-wrap">
          <component :is="item.icon" :size="18" :stroke-width="1.9" />
        </span>
        <span class="mobile-quick-label">{{ item.label }}</span>
        <span v-if="item.badge" class="mobile-quick-badge">{{ item.badge }}</span>
      </NuxtLink>
    </nav>

    <ToastContainer />
  </div>
</template>

<script setup lang="ts">
import {
  CalendarRange,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Home,
  ListChecks,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
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
let resizeCleanup: (() => void) | null = null

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

const mobileQuickNavItems = computed(() => {
  if (isAdmin.value) {
    return [
      { path: '/attendance/records', label: '출퇴근', icon: Clock3 },
      { path: '/attendance/admin', label: '금일', icon: ClipboardCheck },
      {
        path: '/attendance/leave-approvals',
        label: '승인',
        icon: Umbrella,
        badge: pendingLeaveApprovalCount.value > 0 ? String(pendingLeaveApprovalCount.value) : '',
      },
      { path: '/attendance/weekly', label: '주별', icon: ListChecks },
      { path: '/attendance/calendar', label: '월별', icon: CalendarRange },
    ]
  }

  return [
    { path: '/attendance/records', label: '출퇴근', icon: Clock3 },
    { path: '/attendance/leave', label: '휴가', icon: Umbrella },
    { path: '/attendance/weekly', label: '주별', icon: ListChecks },
    { path: '/attendance/calendar', label: '월별', icon: CalendarRange },
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

function syncMobileSidebarState() {
  if (!import.meta.client) return
  if (window.innerWidth <= 960) {
    sidebarCollapsed.value = false
  }
}

function toggleMobileMenu() {
  syncMobileSidebarState()
  mobileMenuOpen.value = !mobileMenuOpen.value
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
  syncMobileSidebarState()
  const handleResize = () => {
    syncMobileSidebarState()
    if (window.innerWidth > 960) {
      mobileMenuOpen.value = false
    }
  }
  window.addEventListener('resize', handleResize, { passive: true })
  resizeCleanup = () => window.removeEventListener('resize', handleResize)

  pendingBadgeTimer = setInterval(() => {
    void fetchPendingLeaveApprovalCount()
  }, 60 * 1000)
})

onBeforeUnmount(() => {
  if (pendingBadgeTimer) clearInterval(pendingBadgeTimer)
  resizeCleanup?.()
})
</script>

<style scoped>
.layout {
  display: flex;
  min-height: 100vh;
  position: relative;
  background: var(--color-bg);
}

.sidebar {
  width: var(--sidebar-width);
  background: rgba(255, 255, 255, 0.96);
  border-right: 1px solid rgba(227, 233, 241, 0.92);
  box-shadow: none;
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
  content: none;
}

.sidebar.collapsed {
  width: var(--sidebar-collapsed-width);
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: 20px 20px 18px;
  border-bottom: 1px solid rgba(238, 243, 248, 0.95);
  min-height: 68px;
  overflow: hidden;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.sidebar-logo:hover {
  background: #f8fbff;
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
  padding: 20px 12px 18px;
  overflow-y: auto;
}

.nav-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 24px;
}

.nav-group-label {
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: none;
  letter-spacing: -0.01em;
  color: var(--color-text-muted);
  padding: 0 12px 2px;
  margin-bottom: 0;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  min-height: 48px;
  padding: 12px 14px;
  border-radius: 14px;
  color: var(--color-sidebar-text);
  font-size: 0.9rem;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  position: relative;
  border: 1px solid transparent;
  transition: background-color var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast);
}

.nav-item-label {
  flex: 1;
  min-width: 0;
}

.nav-badge {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: #e9f2ff;
  border: 1px solid rgba(47, 128, 237, 0.2);
  color: #2563eb;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 800;
  box-shadow: none;
}

.nav-item:hover {
  background: #f7fafd;
  color: var(--color-sidebar-text-active);
  border-color: rgba(223, 231, 240, 0.98);
  box-shadow: none;
  transform: none;
}

.nav-item.active {
  background: #f1f6ff;
  color: var(--color-sidebar-text-active);
  border-color: rgba(47, 128, 237, 0.28);
  box-shadow: none;
}

.sidebar.collapsed .nav-item {
  justify-content: center;
  padding: 11px;
}

.nav-item.nav-home {
  color: var(--color-text-secondary);
  font-size: 0.88rem;
  font-weight: 600;
  margin-bottom: 8px;
}

.nav-item.nav-home:hover {
  color: var(--color-primary);
  background: #f8fbff;
  border-color: rgba(229, 234, 240, 0.95);
  transform: none;
}

.sidebar-collapse-btn {
  margin: 0 12px;
  height: 36px;
  border: 0;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  background: transparent;
  transition: background-color var(--transition-fast), color var(--transition-fast);
}

.sidebar-collapse-btn:hover {
  background: #f6f9fd;
  color: var(--color-text);
}

.sidebar-footer {
  padding: 16px 12px 18px;
  border-top: 1px solid rgba(238, 243, 248, 0.95);
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
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #f1f4f8;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
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
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 40px;
  padding: 10px 12px;
  border-radius: 14px;
  color: var(--color-text-secondary);
  transition: background-color var(--transition-fast), color var(--transition-fast);
}

.sidebar-logout-btn:hover {
  background: #f6f9fd;
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
  background: rgba(255, 255, 255, 0.94);
  border-bottom: 1px solid rgba(227, 233, 241, 0.84);
  box-shadow: none;
}

.header-left,
.header-actions,
.header-nav-actions {
  display: flex;
  align-items: center;
}

.header-left {
  gap: 14px;
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
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text);
}

.breadcrumb-separator {
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
  content: none;
}

.content-shell > * {
  position: relative;
  z-index: 1;
}

.mobile-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.22);
  z-index: 90;
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
  animation: none;
}

.content-shell :deep(.records-page > *),
.content-shell :deep(.admin-page > *),
.content-shell :deep(.leave-page > *),
.content-shell :deep(.leave-approvals-page > *),
.content-shell :deep(.weekly-page > *),
.content-shell :deep(.calendar-page > *),
.content-shell :deep(.settings-page > *) {
  animation: none;
}

.content-shell :deep(.records-page > *:nth-child(2)),
.content-shell :deep(.admin-page > *:nth-child(2)),
.content-shell :deep(.leave-page > *:nth-child(2)),
.content-shell :deep(.leave-approvals-page > *:nth-child(2)),
.content-shell :deep(.weekly-page > *:nth-child(2)),
.content-shell :deep(.calendar-page > *:nth-child(2)),
.content-shell :deep(.settings-page > *:nth-child(2)) {
  animation-delay: 0s;
}

.content-shell :deep(.records-page > *:nth-child(3)),
.content-shell :deep(.admin-page > *:nth-child(3)),
.content-shell :deep(.leave-page > *:nth-child(3)),
.content-shell :deep(.leave-approvals-page > *:nth-child(3)),
.content-shell :deep(.weekly-page > *:nth-child(3)),
.content-shell :deep(.calendar-page > *:nth-child(3)),
.content-shell :deep(.settings-page > *:nth-child(3)) {
  animation-delay: 0s;
}

.content-shell :deep(.records-page > *:nth-child(4)),
.content-shell :deep(.admin-page > *:nth-child(4)),
.content-shell :deep(.leave-page > *:nth-child(4)),
.content-shell :deep(.leave-approvals-page > *:nth-child(4)),
.content-shell :deep(.weekly-page > *:nth-child(4)),
.content-shell :deep(.calendar-page > *:nth-child(4)),
.content-shell :deep(.settings-page > *:nth-child(4)) {
  animation-delay: 0s;
}

.content-shell :deep(.page-header),
.content-shell :deep(.records-header),
.content-shell :deep(.admin-header),
.content-shell :deep(.settings-header) {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  overflow: visible;
}

.content-shell :deep(.page-title),
.content-shell :deep(.records-title),
.content-shell :deep(.admin-title),
.content-shell :deep(.settings-title) {
  font-size: clamp(1.125rem, 1rem + 0.55vw, 1.45rem);
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

.mobile-quick-nav {
  display: none;
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
  border-radius: 18px;
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
.content-shell :deep(.selected-leave-item),
.content-shell :deep(.leave-draft-card),
.content-shell :deep(.approval-focus-banner),
.content-shell :deep(.calendar-mobile-week-card),
.content-shell :deep(.weekly-self-row) {
  border: 1px solid var(--color-border) !important;
  background: #ffffff !important;
  box-shadow: none !important;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.content-shell :deep(.summary-card:hover),
.content-shell :deep(.approval-card:hover),
.content-shell :deep(.today-person-card:hover),
.content-shell :deep(.weekly-person-card:hover),
.content-shell :deep(.monthly-log-card:hover),
.content-shell :deep(.detail-record-card:hover) {
  transform: none;
  box-shadow: none;
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
  border-radius: 12px;
  background: #f7f9fc;
  border: 1px solid var(--color-border);
  box-shadow: none;
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
  border: 1px solid rgba(230, 236, 242, 0.95);
  background: #fbfcfe;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.content-shell :deep(.calendar-day) {
  border-radius: 18px;
  border: 1px solid rgba(230, 236, 242, 0.95);
  background: #ffffff;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  transition: border-color var(--transition-fast), background-color var(--transition-fast), box-shadow var(--transition-fast);
  contain: layout paint;
}

.content-shell :deep(.calendar-day:hover:not(:disabled)) {
  transform: none;
  border-color: rgba(37, 99, 235, 0.22);
  box-shadow: none;
}

.content-shell :deep(.mini-week-item),
.content-shell :deep(.session-item),
.content-shell :deep(.approval-metric),
.content-shell :deep(.today-item),
.content-shell :deep(.monthly-log-item),
.content-shell :deep(.detail-record-metric) {
  border-radius: 14px;
}

.content-shell :deep(.status-filter-chip),
.content-shell :deep(.status-chip),
.content-shell :deep(.today-pill),
.content-shell :deep(.weekly-summary-chip),
.content-shell :deep(.calendar-stat),
.content-shell :deep(.legend-item),
.content-shell :deep(.today-helper-chip),
.content-shell :deep(.approval-focus-count),
.content-shell :deep(.leave-draft-meta span) {
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: #ffffff;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
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
  transition: box-shadow var(--transition-fast), border-color var(--transition-fast), background-color var(--transition-fast), color var(--transition-fast);
}

.content-shell :deep(.status-filter-chip:hover) {
  box-shadow: none;
}

.content-shell :deep(.status-filter-chip.active) {
  background: #f1f6ff;
  border-color: rgba(47, 128, 237, 0.24);
  color: var(--color-text);
}

.content-shell :deep(.status-chip) {
  padding: 6px 12px;
  font-size: 0.78rem;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.content-shell :deep(.today-helper-chip.accent) {
  background: #f1f6ff;
  border-color: rgba(47, 128, 237, 0.24);
  color: #2563eb;
}

.content-shell :deep(.btn) {
  min-height: 40px;
  border-radius: 12px;
}

.content-shell :deep(.btn-primary) {
  background: var(--color-primary);
  box-shadow: none;
}

.content-shell :deep(.btn-primary:hover:not(:disabled)) {
  transform: none;
  box-shadow: none;
}

.content-shell :deep(.btn-ghost),
.content-shell :deep(.btn-secondary) {
  border: 1px solid var(--color-border);
  background: #ffffff;
  box-shadow: none;
}

.content-shell :deep(.btn-ghost:hover:not(:disabled)),
.content-shell :deep(.btn-secondary:hover:not(:disabled)) {
  background: #f7fafd;
}

.content-shell :deep(.input),
.content-shell :deep(.select-input),
.content-shell :deep(.textarea-input),
.content-shell :deep(.dt-input) {
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: #ffffff;
  box-shadow: none;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast), background-color var(--transition-fast);
}

.content-shell :deep(.input:focus),
.content-shell :deep(.select-input:focus),
.content-shell :deep(.textarea-input:focus),
.content-shell :deep(.dt-input:focus) {
  border-color: rgba(96, 165, 250, 0.82);
  box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.12);
  outline: none;
}

.content-shell :deep(.modal-backdrop),
.content-shell :deep(.detail-modal) {
  animation: backdropFadeIn 0.22s var(--ease-standard);
}

.content-shell :deep(.confirm-modal),
.content-shell :deep(.leave-modal),
.content-shell :deep(.detail-dialog) {
  border: 1px solid var(--color-border);
  background: #ffffff;
  box-shadow: var(--shadow-lg);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  animation: attendanceModalIn 0.34s var(--ease-emphasized);
}

.content-shell :deep(.table-empty),
.content-shell :deep(.history-empty),
.content-shell :deep(.empty-state-desc) {
  color: var(--color-text-muted);
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
  .sidebar {
    width: min(248px, calc(100vw - 24px));
    max-width: calc(100vw - 24px);
    overflow: hidden;
    transform: translateX(-100%);
    transition: transform var(--transition-normal);
  }

  .sidebar.collapsed {
    width: min(248px, calc(100vw - 24px));
  }

  .mobile-open .sidebar {
    transform: translateX(0);
  }

  .mobile-open .mobile-overlay {
    display: block;
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

  .sidebar-collapse-btn {
    display: none;
  }

  .header {
    height: auto;
    min-height: 64px;
    padding: var(--space-sm) var(--space-md);
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-sm);
  }

  .header-left {
    width: 100%;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-sm);
  }

  .breadcrumb {
    min-width: 0;
  }

  .breadcrumb-item,
  .breadcrumb-separator {
    display: none;
  }

  .breadcrumb-current {
    display: block;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .content {
    padding: var(--space-md) var(--space-md) calc(96px + env(safe-area-inset-bottom));
  }

  .mobile-quick-nav {
    position: fixed;
    left: 12px;
    right: 12px;
    bottom: calc(12px + env(safe-area-inset-bottom));
    z-index: 95;
    display: flex;
    align-items: stretch;
    gap: 6px;
    padding: 6px;
    border-radius: 18px;
    border: 1px solid rgba(227, 233, 241, 0.92);
    background: rgba(255, 255, 255, 0.96);
    box-shadow: none;
  }

  .mobile-quick-link {
    flex: 1;
    min-width: 0;
    padding: 10px 6px 8px;
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    color: var(--color-text-muted);
    position: relative;
    transition: background-color var(--transition-fast), color var(--transition-fast), transform var(--transition-fast);
  }

  .mobile-quick-link.active {
    background: #f1f6ff;
    color: var(--color-sidebar-text-active);
  }

  .mobile-quick-link:active {
    transform: scale(0.98);
  }

  .mobile-quick-icon-wrap {
    width: auto;
    height: auto;
    border-radius: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 0;
    box-shadow: none;
  }

  .mobile-quick-link.active .mobile-quick-icon-wrap {
    background: transparent;
    border-color: transparent;
  }

  .mobile-quick-label {
    max-width: 100%;
    font-size: 0.72rem;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.02em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mobile-quick-badge {
    position: absolute;
    top: 4px;
    right: calc(50% - 24px);
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 999px;
    background: #e9f2ff;
    color: #2563eb;
    font-size: 0.68rem;
    font-weight: 800;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(47, 128, 237, 0.2);
    box-shadow: none;
  }
}

@media (max-width: 768px) {
  .content-shell :deep(.summary-grid) {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(168px, 76vw);
    overflow-x: auto;
    gap: 12px;
    padding: 2px 2px 8px;
    margin: 0 -2px;
    scrollbar-width: none;
  }

  .content-shell :deep(.summary-grid::-webkit-scrollbar) {
    display: none;
  }

  .content-shell :deep(.status-filter-row),
  .content-shell :deep(.week-nav),
  .content-shell :deep(.calendar-tools) {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: 4px;
    scrollbar-width: none;
  }

  .content-shell :deep(.status-filter-row::-webkit-scrollbar),
  .content-shell :deep(.week-nav::-webkit-scrollbar),
  .content-shell :deep(.calendar-tools::-webkit-scrollbar) {
    display: none;
  }

  .content-shell :deep(.status-filter-chip),
  .content-shell :deep(.week-nav .btn),
  .content-shell :deep(.calendar-tools .btn) {
    flex: 0 0 auto;
  }

  .content-shell :deep(.page-header),
  .content-shell :deep(.records-header),
  .content-shell :deep(.admin-header),
  .content-shell :deep(.settings-header) {
    gap: 12px;
  }

  .content-shell :deep(.modal-backdrop),
  .content-shell :deep(.detail-modal) {
    align-items: flex-end;
    padding: 0;
  }

  .content-shell :deep(.confirm-modal),
  .content-shell :deep(.leave-modal),
  .content-shell :deep(.detail-dialog) {
    width: 100%;
    max-width: none;
    max-height: min(88vh, 920px);
    margin-top: auto;
    border-radius: 22px 22px 0 0;
    padding: 20px 18px calc(20px + env(safe-area-inset-bottom));
  }
}
</style>
