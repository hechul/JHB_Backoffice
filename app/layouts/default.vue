<template>
  <div class="layout" :class="{ 'sidebar-collapsed': sidebarCollapsed, 'mobile-open': mobileMenuOpen }">
    <!-- Mobile Overlay -->
    <div v-if="mobileMenuOpen" class="mobile-overlay" @click="mobileMenuOpen = false"></div>

    <!-- Sidebar -->
    <aside class="sidebar" :class="{ collapsed: sidebarCollapsed }">
      <div class="sidebar-logo">
        <img src="/jhbiofarm-logo.png" alt="JHBioFarm 로고" class="logo-mark" />
        <span v-show="!sidebarCollapsed" class="logo-text">JHBioFarm</span>
      </div>

      <nav class="sidebar-nav">
        <!-- 홈으로 -->
        <div class="nav-group">
          <NuxtLink to="/" class="nav-item nav-home" @click="mobileMenuOpen = false">
            <Home :size="18" :stroke-width="1.8" />
            <span v-show="!sidebarCollapsed">홈으로</span>
          </NuxtLink>
        </div>

        <!-- 매출 분석 -->
        <div class="nav-group">
          <div v-show="!sidebarCollapsed" class="nav-group-label">매출 분석</div>
          <template v-for="item in analysisMenuItems" :key="item.path">
            <!-- 비활성 항목 -->
            <div
              v-if="item.disabled"
              class="nav-item nav-item-disabled"
            >
              <component :is="item.icon" :size="18" :stroke-width="1.8" />
              <span v-show="!sidebarCollapsed">{{ item.label }}</span>
              <span v-show="!sidebarCollapsed" class="nav-badge-soon">준비중</span>
            </div>
            <!-- 활성 항목 -->
            <NuxtLink
              v-else
              :to="item.path"
              class="nav-item"
              :class="{ active: isActive(item.path) }"
              @click="mobileMenuOpen = false"
            >
              <component :is="item.icon" :size="18" :stroke-width="1.8" />
              <span v-show="!sidebarCollapsed">{{ item.label }}</span>
            </NuxtLink>
          </template>
        </div>

        <!-- 상품 관리 -->
        <div v-if="!isViewer" class="nav-group">
          <div v-show="!sidebarCollapsed" class="nav-group-label">상품 관리</div>
          <NuxtLink
            to="/products"
            class="nav-item"
            :class="{ active: isActive('/products') }"
            @click="mobileMenuOpen = false"
          >
            <Package :size="18" :stroke-width="1.8" />
            <span v-show="!sidebarCollapsed">상품 목록</span>
          </NuxtLink>
        </div>

        <!-- 설정 -->
        <div v-if="!isViewer" class="nav-group">
          <div v-show="!sidebarCollapsed" class="nav-group-label">설정</div>
          <div class="nav-item nav-item-disabled">
            <UserCog :size="18" :stroke-width="1.8" />
            <span v-show="!sidebarCollapsed">계정 관리</span>
            <span v-show="!sidebarCollapsed" class="nav-badge-soon">준비중</span>
          </div>
        </div>
      </nav>

      <!-- Collapse Toggle -->
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

    <!-- Main -->
    <div class="main-wrapper">
      <header class="header">
        <div class="header-left">
          <!-- Mobile Menu Button -->
          <button class="mobile-menu-btn" @click="mobileMenuOpen = !mobileMenuOpen">
            <Menu :size="20" :stroke-width="1.8" />
          </button>
          <!-- Breadcrumb -->
          <div class="breadcrumb">
            <span v-if="currentGroup" class="breadcrumb-item">{{ currentGroup }}</span>
            <ChevronRight v-if="currentGroup" :size="12" :stroke-width="2" class="breadcrumb-separator" />
            <span class="breadcrumb-current">{{ currentPageTitle }}</span>
          </div>
        </div>
        <div class="header-actions">
          <!-- Period Selector -->
          <div v-if="showPeriodSelector" class="period-selector period-selector-fixed">
            <button class="period-nav" @click="prevMonth">
              <ChevronLeft :size="16" :stroke-width="2" />
            </button>
            <button class="period-current" @click="togglePeriodMenu">
              <CalendarDays :size="14" :stroke-width="2" />
              <span>{{ periodDisplayLabel }}</span>
              <ChevronDown :size="14" :stroke-width="2" />
            </button>
            <button class="period-nav" @click="nextMonth">
              <ChevronRight :size="16" :stroke-width="2" />
            </button>

            <!-- Period Dropdown -->
            <div v-if="showPeriodMenu" class="period-dropdown">
              <div class="period-dropdown-header">기간 선택</div>
              <div v-if="availableMonths.length === 0" class="period-dropdown-empty">
                <span>{{ monthsLoading ? '기간 불러오는 중...' : '업로드된 월 데이터가 없습니다.' }}</span>
                <button v-if="!monthsLoading" class="period-retry-btn" @click="retryLoadMonths">다시 불러오기</button>
              </div>
              <button
                v-for="m in availableMonths"
                :key="m.value"
                class="period-option"
                :class="{ active: m.value === selectedMonth }"
                @click="selectPeriodMonth(m.value)"
              >
                <span>{{ m.label }}</span>
                <span class="period-count">{{ m.count.toLocaleString() }}건</span>
              </button>
              <div class="period-divider"></div>
              <button class="period-option" :class="{ active: selectedMonth === 'all' }" @click="selectPeriodMonth('all')">
                <span>전체 기간</span>
              </button>
            </div>
          </div>
          <span v-if="showPeriodSelector && monthsError && !monthsLoading" class="period-error">
            {{ monthsError }}
          </span>
          <button
            class="header-refresh-btn"
            type="button"
            title="새로고침"
            aria-label="페이지 새로고침"
            @click="handlePageRefresh"
          >
            <RefreshCw :size="16" :stroke-width="1.8" />
          </button>
          <!-- Notifications (Phase 2) -->
          <div class="header-icon-disabled" title="준비중">
            <Bell :size="18" :stroke-width="1.8" />
          </div>
          <span class="header-date">{{ today }}</span>
        </div>
      </header>

      <main class="content">
        <slot />
      </main>
    </div>

    <!-- Overlay for dropdown -->
    <div v-if="showPeriodMenu" class="overlay" @click="showPeriodMenu = false"></div>

    <!-- Global Toast -->
    <ToastContainer />
  </div>
</template>

<script setup lang="ts">
import {
  Upload,
  Filter,
  Users,
  FileText,
  Home,
  BarChart3,
  Package,
  UserCog,
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  LogOut,
  RefreshCw,
} from 'lucide-vue-next'

const route = useRoute()
const { user, isViewer, profileLoaded, profileRevision, logout } = useCurrentUser()
const { selectedMonth, selectedPeriodLabel, availableMonths, monthsLoading, monthsError, refreshMonths, selectMonth, prevMonth, nextMonth } = useAnalysisPeriod()

const sidebarCollapsed = ref(false)
const mobileMenuOpen = ref(false)
const periodEnabledPaths = ['/dashboard', '/customers', '/logs', '/upload', '/filter']

const analysisMenuItems = computed(() => {
  const items = [
    { path: '/dashboard', label: '대시보드', icon: BarChart3, disabled: true },
    { path: '/customers', label: '고객 분석', icon: Users, disabled: false },
    { path: '/logs', label: '실행 이력', icon: FileText, disabled: false },
  ]
  if (isViewer.value) return items
  return [
    { path: '/dashboard', label: '대시보드', icon: BarChart3, disabled: true },
    { path: '/upload', label: '데이터 업로드', icon: Upload, disabled: false },
    { path: '/filter', label: '필터링', icon: Filter, disabled: false },
    { path: '/customers', label: '고객 분석', icon: Users, disabled: false },
    { path: '/logs', label: '실행 이력', icon: FileText, disabled: false },
  ]
})

const allMenuItems = computed(() => {
  const items = [
    { path: '/dashboard', label: '대시보드', group: '매출 분석' },
    { path: '/customers', label: '고객 분석', group: '매출 분석' },
    { path: '/logs', label: '실행 이력', group: '매출 분석' },
  ]
  if (isViewer.value) return items
  return [
    { path: '/dashboard', label: '대시보드', group: '매출 분석' },
    { path: '/upload', label: '데이터 업로드', group: '매출 분석' },
    { path: '/filter', label: '필터링', group: '매출 분석' },
    { path: '/customers', label: '고객 분석', group: '매출 분석' },
    { path: '/logs', label: '실행 이력', group: '매출 분석' },
    { path: '/products', label: '상품 목록', group: '상품 관리' },
    { path: '/settings/users', label: '계정 관리', group: '설정' },
  ]
})

const isActive = (path: string) => route.path === path

const currentPageTitle = computed(() => {
  const item = allMenuItems.value.find((m) => m.path === route.path)
  return item ? item.label : '페이지'
})

const currentGroup = computed(() => {
  const item = allMenuItems.value.find((m) => m.path === route.path)
  return item?.group || ''
})

const avatarInitial = computed(() => user.value.name?.charAt(0) || '관')
const roleLabel = computed(() => {
  if (!profileLoaded.value) return '확인중'
  const r = user.value.role
  if (r === 'admin') return 'Admin'
  if (r === 'modifier') return 'Modifier'
  return 'Viewer'
})
const showPeriodSelector = computed(() => periodEnabledPaths.some((path) => route.path.startsWith(path)))
const hasMonthData = computed(() => availableMonths.value.length > 0)
const periodDisplayLabel = computed(() => {
  if (monthsLoading.value && !hasMonthData.value) return '기간 불러오는 중...'
  return selectedPeriodLabel.value
})

const today = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}`
})

const showPeriodMenu = ref(false)
function handleLogout() {
  logout()
}

function handlePageRefresh() {
  if (!process.client) return
  window.location.reload()
}

function selectPeriodMonth(value: string) {
  selectMonth(value)
  showPeriodMenu.value = false
}

async function retryLoadMonths() {
  showPeriodMenu.value = false
  await refreshMonths()
}

function togglePeriodMenu() {
  if (availableMonths.value.length === 0) return
  showPeriodMenu.value = !showPeriodMenu.value
}

watch(() => route.path, () => {
  mobileMenuOpen.value = false
  showPeriodMenu.value = false
})

watch(showPeriodSelector, (visible) => {
  if (!visible) showPeriodMenu.value = false
})

onMounted(async () => {
  // 인증 로직 후 데이터 조회
})

watch(
  () => [profileLoaded.value, profileRevision.value],
  async ([loaded]) => {
    if (!loaded) return
    await refreshMonths()
  },
  { immediate: true }
)
</script>

<style scoped>
.layout {
  display: flex;
  min-height: 100vh;
}

/* Sidebar */
.sidebar {
  width: var(--sidebar-width);
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 100;
  transition: width 0.2s ease;
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
}

.logo-mark {
  width: 28px;
  height: 28px;
  object-fit: contain;
  flex-shrink: 0;
}

.logo-text {
  font-weight: 700;
  font-size: 1rem;
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
  font-size: 0.6875rem;
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
  border-radius: var(--radius-md);
  font-size: 0.8125rem;
  font-weight: 450;
  color: var(--color-sidebar-text);
  transition: all 0.12s ease;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
}

.sidebar.collapsed .nav-item {
  justify-content: center;
  padding: 9px;
}

.nav-item:hover {
  background: var(--color-sidebar-hover);
  color: var(--color-sidebar-text-active);
}

.nav-item.active {
  background: var(--color-sidebar-active);
  color: var(--color-sidebar-text-active);
  font-weight: 550;
}

.nav-item.nav-home {
  color: var(--color-text-muted);
  font-size: 0.75rem;
  font-weight: 500;
  margin-bottom: var(--space-sm);
}
.nav-item.nav-home:hover {
  color: var(--color-primary);
  background: var(--color-sidebar-hover);
}

.nav-item.disabled {
  opacity: 0.5;
  cursor: default;
}
.nav-item.disabled:hover {
  background: transparent;
  color: var(--color-sidebar-text);
}

.coming-badge {
  margin-left: auto;
  font-size: 0.625rem;
  padding: 1px 6px;
  border-radius: 100px;
  background: #F3F4F6;
  color: var(--color-text-muted);
  font-weight: 500;
}

/* Collapse Button */
.sidebar-collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 var(--space-lg);
  padding: var(--space-sm);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  transition: all 0.12s ease;
}
.sidebar-collapse-btn:hover {
  background: var(--color-sidebar-hover);
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

.sidebar.collapsed .user-info {
  justify-content: center;
}

.user-avatar {
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
  flex-shrink: 0;
}

.user-detail {
  display: flex;
  flex-direction: column;
}

.user-name {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text);
}

.user-role {
  font-size: 0.6875rem;
  color: var(--color-text-muted);
}

.sidebar-logout-btn {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  width: 100%;
  padding: 8px var(--space-sm);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  transition: all 0.12s ease;
}

.sidebar-logout-btn:hover {
  background: var(--color-sidebar-hover);
  color: var(--color-text);
}

.sidebar.collapsed .sidebar-logout-btn {
  justify-content: center;
}

/* Main */
.main-wrapper {
  flex: 1;
  margin-left: var(--sidebar-width);
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  transition: margin-left 0.2s ease;
}

.sidebar-collapsed .main-wrapper {
  margin-left: var(--sidebar-collapsed-width);
}

.header {
  height: var(--header-height);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-2xl);
  position: sticky;
  top: 0;
  z-index: 50;
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.mobile-menu-btn {
  display: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
}
.mobile-menu-btn:hover {
  background: var(--color-bg);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
}

.header-date {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

/* Period Selector */
.period-selector {
  display: flex;
  align-items: center;
  gap: 2px;
  position: relative;
}

/* Keep month control visual stable even during refresh/hydration states */
.period-selector-fixed .period-nav,
.period-selector-fixed .period-current {
  opacity: 1 !important;
  filter: none !important;
}

.period-selector-fixed .period-nav,
.period-selector-fixed .period-nav svg {
  color: var(--color-text-secondary) !important;
  stroke: currentColor;
}

.period-selector-fixed .period-current,
.period-selector-fixed .period-current span,
.period-selector-fixed .period-current svg {
  color: var(--color-text) !important;
  stroke: currentColor;
}

.period-selector-fixed button[disabled] {
  opacity: 1 !important;
  cursor: pointer !important;
}

.period-empty {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 0 var(--space-sm);
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.period-nav {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.12s ease;
}

.period-nav:hover {
  background: var(--color-bg);
  color: var(--color-text);
}

.period-nav:disabled {
  opacity: 1;
  cursor: pointer;
  color: var(--color-text-secondary);
  background: var(--color-surface);
}

.period-current {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 5px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text);
  cursor: pointer;
  transition: all 0.12s ease;
  font-family: var(--font-sans);
}

.period-current:hover {
  background: var(--color-bg);
  border-color: var(--color-primary);
}

.period-current:disabled {
  opacity: 1;
  cursor: pointer;
  color: var(--color-text);
  background: var(--color-surface);
  border-color: var(--color-border);
}

.period-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 240px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  z-index: 200;
  padding: var(--space-sm);
}

.period-dropdown-header {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  padding: var(--space-sm) var(--space-md);
  margin-bottom: 2px;
}

.period-dropdown-empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.period-retry-btn {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 0.6875rem;
  padding: 4px 8px;
}

.period-retry-btn:hover {
  background: var(--color-bg);
  color: var(--color-text);
}

.period-error {
  max-width: 180px;
  font-size: 0.6875rem;
  color: var(--color-text-muted);
  line-height: 1.2;
}

.period-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px var(--space-md);
  border: none;
  border-radius: var(--radius-md);
  background: none;
  font-size: 0.8125rem;
  color: var(--color-text);
  cursor: pointer;
  font-family: var(--font-sans);
  transition: background 0.1s ease;
}

.period-option:hover {
  background: var(--color-sidebar-hover);
}

.period-option.active {
  background: var(--color-sidebar-active);
  font-weight: 550;
  color: var(--color-primary);
}

.period-count {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.period-divider {
  height: 1px;
  background: var(--color-border-light);
  margin: var(--space-sm) var(--space-md);
}

.overlay {
  position: fixed;
  inset: 0;
  z-index: 49;
}

/* Disabled nav item */
.nav-item-disabled {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
  position: relative;
}

.nav-badge-soon {
  margin-left: auto;
  font-size: 0.6rem;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--bg-secondary);
  padding: 1px 6px;
  border-radius: 8px;
  letter-spacing: 0.02em;
}

.header-icon-disabled {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  color: var(--text-muted);
  opacity: 0.35;
  cursor: not-allowed;
}

.header-refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  transition: all 0.12s ease;
}

.header-refresh-btn:hover {
  background: var(--color-bg);
  color: var(--color-text);
}

.content {
  flex: 1;
  padding: var(--space-2xl);
}

/* Mobile Overlay */
.mobile-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 99;
}

/* Responsive */
@media (max-width: 768px) {
  .sidebar {
    transform: translateX(-100%);
    width: 248px;
    z-index: 110;
  }

  .mobile-open .sidebar {
    transform: translateX(0);
  }

  .mobile-open .mobile-overlay {
    display: block;
  }

  .main-wrapper {
    margin-left: 0 !important;
  }

  .mobile-menu-btn {
    display: flex;
  }

  .sidebar-collapse-btn {
    display: none;
  }

  .header {
    padding: 0 var(--space-lg);
  }

  .header-actions {
    gap: var(--space-sm);
  }

  .header-date {
    display: none;
  }

  .content {
    padding: var(--space-lg);
  }

  .period-selector {
    display: flex;
  }

  .period-nav {
    display: none;
  }

  .period-current {
    padding: 5px 10px;
    font-size: 0.75rem;
  }
}
</style>
