<template>
  <!-- 전체 백오피스 기본 레이아웃.
       왼쪽은 사이드바, 오른쪽은 헤더 + 실제 페이지(slot) 구조입니다. -->
  <div class="layout" :class="{ 'sidebar-collapsed': sidebarCollapsed, 'mobile-open': mobileMenuOpen }">
    <!-- Mobile Overlay -->
    <div v-if="mobileMenuOpen" class="mobile-overlay" @click="mobileMenuOpen = false"></div>

    <!-- Sidebar -->
    <aside class="sidebar" :class="{ collapsed: sidebarCollapsed }">
      <!-- 로고를 누르면 언제나 홈('/')으로 이동 -->
      <NuxtLink to="/" class="sidebar-logo" @click="mobileMenuOpen = false">
        <img src="/jhbiofarm-logo.png" alt="JHBioFarm 로고" class="logo-mark" />
        <div v-show="!sidebarCollapsed" class="logo-copy">
          <span class="logo-text">JHBioFarm</span>
          <span class="logo-subtext">Commerce backoffice</span>
        </div>
      </NuxtLink>

      <nav class="sidebar-nav">
        <!-- 홈으로 -->
        <div class="nav-group">
          <NuxtLink to="/" class="nav-item nav-home" @click="mobileMenuOpen = false">
            <Home :size="18" :stroke-width="1.8" />
            <span v-show="!sidebarCollapsed">홈으로</span>
          </NuxtLink>
        </div>

        <div
          v-for="section in navigationSections"
          :key="section.key"
          class="nav-group"
        >
          <button
            v-show="!sidebarCollapsed"
            type="button"
            class="nav-group-header"
            :aria-expanded="String(isSectionExpanded(section.key))"
            @click="toggleSection(section.key)"
          >
            <span class="nav-group-label">{{ section.label }}</span>
            <ChevronDown
              :size="16"
              :stroke-width="2"
              class="nav-group-chevron"
              :class="{ collapsed: !isSectionExpanded(section.key) }"
            />
          </button>
          <div v-show="sidebarCollapsed || isSectionExpanded(section.key)" class="nav-group-items">
            <NuxtLink
              v-for="item in section.items"
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
        </div>

      </nav>

      <!-- Collapse Toggle -->
      <!-- 사이드바 너비를 줄이거나 다시 펼치는 버튼 -->
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
          <!-- 모바일에서는 이 버튼으로 사이드바 열기/닫기 -->
          <button class="mobile-menu-btn" @click="mobileMenuOpen = !mobileMenuOpen">
            <Menu :size="20" :stroke-width="1.8" />
          </button>
          <!-- Breadcrumb -->
          <!-- 현재 페이지가 어떤 그룹/메뉴에 속하는지 상단에 표시 -->
          <div class="breadcrumb">
            <span v-if="currentGroup" class="breadcrumb-item">{{ currentGroup }}</span>
            <ChevronRight v-if="currentGroup" :size="12" :stroke-width="2" class="breadcrumb-separator" />
            <span class="breadcrumb-current">{{ currentPageTitle }}</span>
          </div>
          <div v-if="showHeaderNavButtons" class="header-nav-actions">
            <!-- 홈이 아닌 페이지에서는 뒤로/홈 이동 버튼을 보여줍니다. -->
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
          <!-- Period Selector -->
          <!-- 요약/고객/판매분석 등 월 기반 분석 페이지에서만 월 선택 UI를 보여줍니다. -->
          <div
            v-if="showPeriodSelector"
            ref="periodSelectorRef"
            class="period-selector period-selector-fixed"
          >
            <!-- prevMonth / nextMonth는 useAnalysisPeriod()에서 가져온 공통 함수입니다. -->
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
            <!-- availableMonths는 DB 기준 실제 데이터가 있는 월 목록입니다. -->
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
          <NotificationBell />
          <!-- 우측 상단 오늘 날짜 -->
          <span class="header-date">{{ today }}</span>
        </div>
      </header>

      <main class="content">
        <!-- 실제 페이지 컴포넌트가 이 자리에 렌더링됩니다. -->
        <slot />
      </main>
    </div>

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
  TrendingUp,
  LineChart,
  PieChart,
  Package,
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

// 현재 URL 정보
const route = useRoute()
// 로그인 사용자, 권한, 로그아웃 함수
const { user, isViewer, isAdmin, profileLoaded, profileRevision, logout } = useCurrentUser()
// 분석 화면 공통 월 선택 상태/함수
const { selectedMonth, selectedPeriodLabel, availableMonths, monthsLoading, monthsError, refreshMonths, selectMonth, prevMonth, nextMonth } = useAnalysisPeriod()

// 사이드바 접힘 여부
const sidebarCollapsed = ref(false)
// 모바일 메뉴 열림 여부
const mobileMenuOpen = ref(false)
const expandedSections = ref<Record<string, boolean>>({})
// 월 선택 드롭다운 DOM 참조 (바깥 클릭 감지용)
const periodSelectorRef = ref<HTMLElement | null>(null)
// 월 선택 UI를 보여줄 페이지 경로 목록
const periodEnabledPaths = ['/dashboard', '/growth-stages', '/product-trends', '/channel-analysis', '/customers', '/logs', '/upload', '/filter']

const analysisMenuItems = computed(() => {
  return [
    { path: '/dashboard', label: '실구매 요약', icon: BarChart3 },
    { path: '/customers', label: '고객 분석', icon: Users },
    { path: '/growth-stages', label: '재구매·리텐션', icon: TrendingUp },
    { path: '/product-trends', label: '상품 추이', icon: LineChart },
    { path: '/channel-analysis', label: '채널 분석', icon: PieChart },
  ]
})

const operationsMenuItems = computed(() => {
  if (isViewer.value) {
    return [
      { path: '/naver-sync', label: '주문 동기화', icon: RefreshCw },
      { path: '/logs', label: '실행 이력', icon: FileText },
    ]
  }

  return [
    { path: '/naver-sync', label: '주문 동기화', icon: RefreshCw },
    { path: '/upload', label: '데이터 업로드', icon: Upload },
    { path: '/filter', label: '필터링', icon: Filter },
    { path: '/logs', label: '실행 이력', icon: FileText },
  ]
})

const managementMenuItems = computed(() => {
  if (isViewer.value) return []
  return [
    { path: '/products', label: '상품 목록', icon: Package },
  ]
})

const navigationSections = computed(() => {
  const sections = [
    { key: 'analysis', label: '실구매 분석', items: analysisMenuItems.value },
    { key: 'operations', label: '데이터 운영', items: operationsMenuItems.value },
  ]

  if (managementMenuItems.value.length) {
    sections.push({ key: 'management', label: '마스터 관리', items: managementMenuItems.value })
  }

  return sections
})

const allMenuItems = computed(() => {
  return navigationSections.value.flatMap((section) =>
    section.items.map((item) => ({
      path: item.path,
      label: item.label,
      group: section.label,
    }))
  )
})

// 현재 route가 특정 path와 같거나 하위 경로면 active 처리
const isActive = (path: string) => route.path === path || route.path.startsWith(`${path}/`)

function isSectionExpanded(key: string) {
  return expandedSections.value[key] ?? true
}

function toggleSection(key: string) {
  expandedSections.value = {
    ...expandedSections.value,
    [key]: !isSectionExpanded(key),
  }
}

function expandSectionForPath(path: string) {
  const section = navigationSections.value.find((entry) =>
    entry.items.some((item) => path === item.path || path.startsWith(`${item.path}/`))
  )
  if (!section) return
  expandedSections.value = {
    ...expandedSections.value,
    [section.key]: true,
  }
}

const currentPageTitle = computed(() => {
  // 현재 path에 맞는 화면 제목
  const item = allMenuItems.value.find((m) => m.path === route.path)
  return item ? item.label : '페이지'
})

const currentGroup = computed(() => {
  // 현재 path에 맞는 상위 그룹명
  const item = allMenuItems.value.find((m) => m.path === route.path)
  return item?.group || ''
})

// 사용자 이름 첫 글자를 아바타로 사용
const avatarInitial = computed(() => user.value.name?.charAt(0) || '관')
const roleLabel = computed(() => {
  // 프로필이 아직 안 왔으면 "확인중"으로 표기
  if (!profileLoaded.value) return '확인중'
  const r = user.value.role
  if (r === 'admin') return 'Admin'
  if (r === 'modifier') return 'Modifier'
  return 'Viewer'
})
// 현재 페이지가 월 선택을 지원하는 페이지인지 여부
const showPeriodSelector = computed(() => periodEnabledPaths.some((path) => route.path.startsWith(path)))
// 홈이 아닌 곳에서만 뒤로/홈 버튼 표시
const showHeaderNavButtons = computed(() => route.path !== '/')
// 조회 가능한 월 데이터가 하나라도 있는지 여부
const hasMonthData = computed(() => availableMonths.value.length > 0)
const periodDisplayLabel = computed(() => {
  // 로딩 중이면서 데이터가 비어 있으면 별도 메시지를 보여줍니다.
  if (monthsLoading.value && !hasMonthData.value) return '기간 불러오는 중...'
  return selectedPeriodLabel.value
})

const today = computed(() => {
  // 우측 상단 날짜 라벨
  const d = new Date()
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}`
})

// 월 드롭다운 열림 여부
const showPeriodMenu = ref(false)
async function handleLogout() {
  // 현재 로그인 세션 종료
  await logout()
}

function handlePageRefresh() {
  // 강제 새로고침으로 페이지 상태 초기화
  if (!process.client) return
  window.location.reload()
}

async function goHomeWithFallback() {
  // 뒤로가기 실패 시 홈으로 안전하게 보내기 위한 공통 함수
  showPeriodMenu.value = false
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
  // 브라우저 히스토리가 있으면 뒤로가고,
  // 없거나 이동 실패하면 홈으로 보냅니다.
  if (import.meta.client && window.history.length > 1) {
    const beforePath = window.location.pathname
    window.history.back()
    window.setTimeout(() => {
      if (window.location.pathname === beforePath) {
        window.location.assign('/')
      }
    }, 320)
    return
  }
  await goHomeWithFallback()
}

function selectPeriodMonth(value: string) {
  // 드롭다운에서 월을 고르면 공통 상태를 바꾸고 메뉴를 닫습니다.
  selectMonth(value)
  showPeriodMenu.value = false
}

async function retryLoadMonths() {
  // "다시 불러오기" 버튼용
  showPeriodMenu.value = false
  await refreshMonths()
}

function togglePeriodMenu() {
  // 월 목록이 하나도 없으면 열 필요가 없으므로 막습니다.
  if (availableMonths.value.length === 0) return
  showPeriodMenu.value = !showPeriodMenu.value
}

function handleDocumentPointerDown(event: PointerEvent) {
  // 드롭다운 바깥 클릭 시 월 선택 메뉴를 닫습니다.
  if (!showPeriodMenu.value) return
  const root = periodSelectorRef.value
  if (!root) {
    showPeriodMenu.value = false
    return
  }
  const target = event.target as Node | null
  if (target && root.contains(target)) return
  showPeriodMenu.value = false
}

function handleEscapeKey(event: KeyboardEvent) {
  // Escape 키로 모바일 메뉴/월 드롭다운 닫기
  if (event.key !== 'Escape') return
  showPeriodMenu.value = false
  mobileMenuOpen.value = false
}

function handleWindowBlur() {
  // 브라우저 포커스를 잃으면 드롭다운을 닫아 두어 UI 꼬임을 줄입니다.
  showPeriodMenu.value = false
}

watch(() => route.path, () => {
  // 페이지가 바뀌면 모바일 메뉴/드롭다운을 닫아 줍니다.
  mobileMenuOpen.value = false
  showPeriodMenu.value = false
  expandSectionForPath(route.path)
})

watch(showPeriodSelector, (visible) => {
  // 월 선택 UI가 없는 페이지로 가면 드롭다운도 닫습니다.
  if (!visible) showPeriodMenu.value = false
})

watch(
  navigationSections,
  (sections) => {
    const nextState: Record<string, boolean> = {}
    for (const section of sections) {
      nextState[section.key] = expandedSections.value[section.key] ?? true
    }
    expandedSections.value = nextState
    expandSectionForPath(route.path)
  },
  { immediate: true }
)

onMounted(() => {
  // 전역 클릭/Escape/blur 핸들러 등록
  if (!import.meta.client) return
  document.addEventListener('pointerdown', handleDocumentPointerDown, true)
  window.addEventListener('keydown', handleEscapeKey)
  window.addEventListener('blur', handleWindowBlur)
})

onBeforeUnmount(() => {
  if (!import.meta.client) return
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
  window.removeEventListener('keydown', handleEscapeKey)
  window.removeEventListener('blur', handleWindowBlur)
})

watch(
  () => [profileLoaded.value, profileRevision.value],
  async ([loaded]) => {
    // 사용자 프로필이 준비되면 월 목록을 한 번 로드합니다.
    // 권한/사용자 상태에 따라 볼 수 있는 데이터가 달라질 수 있기 때문입니다.
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
  background:
    radial-gradient(960px 520px at 84% -16%, rgba(49, 130, 246, 0.08), transparent 72%),
    linear-gradient(180deg, #FCFDFE 0%, #F4F7FB 46%, #EFF3F8 100%);
}

/* Sidebar */
.sidebar {
  width: var(--sidebar-width);
  background: rgba(255, 255, 255, 0.92);
  border-right: 1px solid rgba(223, 230, 239, 0.9);
  box-shadow: 10px 0 30px rgba(15, 23, 42, 0.05);
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 100;
  transition: width var(--transition-normal), box-shadow var(--transition-normal);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.sidebar.collapsed {
  width: var(--sidebar-collapsed-width);
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: 20px 18px 16px;
  border-bottom: 1px solid rgba(236, 241, 246, 0.9);
  min-height: 72px;
  overflow: hidden;
  transition: background var(--transition-fast);
}

.sidebar-logo:hover {
  background: rgba(248, 250, 253, 0.9);
}

.logo-mark {
  width: 28px;
  height: 28px;
  object-fit: contain;
  flex-shrink: 0;
}

.logo-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.logo-text {
  font-weight: 700;
  font-size: 1rem;
  color: var(--color-text);
  white-space: nowrap;
}

.logo-subtext {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--color-text-muted);
  white-space: nowrap;
  line-height: 1.2;
}

.header-nav-actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  position: relative;
  z-index: 3;
}

.header-nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: 0.84rem;
  font-weight: 500;
  transition: transform var(--transition-fast), background-color var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
}

.header-nav-btn:hover {
  background: var(--color-bg);
  color: var(--color-text);
  border-color: #D1D5DB;
  transform: translateY(-1px);
}

.sidebar-nav {
  flex: 1;
  padding: 14px 12px 18px;
  overflow-y: auto;
}

.nav-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 18px;
}

.nav-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0 10px 2px;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.nav-group-label {
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--color-text-muted);
  padding: 0;
}

.nav-group-chevron {
  color: var(--color-text-muted);
  transition: transform var(--transition-fast), color var(--transition-fast);
}

.nav-group-chevron.collapsed {
  transform: rotate(-90deg);
}

.nav-group-header:hover .nav-group-label,
.nav-group-header:hover .nav-group-chevron {
  color: var(--color-text-secondary);
}

.nav-group-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: 11px 12px;
  border-radius: 14px;
  font-size: 0.93rem;
  font-weight: 600;
  color: var(--color-sidebar-text);
  transition: background-color var(--transition-fast), color var(--transition-fast), box-shadow var(--transition-fast), border-color var(--transition-fast);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  position: relative;
  border: 1px solid transparent;
}

.sidebar.collapsed .nav-item {
  justify-content: center;
  padding: 11px;
}

.nav-item:hover {
  background: #F7F9FC;
  color: var(--color-sidebar-text-active);
  border-color: rgba(229, 234, 240, 0.95);
}

.nav-item.active {
  background: linear-gradient(180deg, rgba(238, 245, 255, 0.98) 0%, rgba(231, 240, 255, 0.96) 100%);
  color: var(--color-sidebar-text-active);
  border-color: rgba(49, 130, 246, 0.18);
  box-shadow: 0 8px 18px rgba(49, 130, 246, 0.08);
}

.nav-item.nav-home {
  color: var(--color-text-secondary);
  font-size: 0.88rem;
  font-weight: 600;
  margin-bottom: 8px;
}
.nav-item.nav-home:hover {
  color: var(--color-primary);
  background: #F7F9FC;
  border-color: rgba(229, 234, 240, 0.95);
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
  margin: 0 12px;
  padding: var(--space-sm);
  border-radius: 12px;
  color: var(--color-text-muted);
  transition: background-color var(--transition-fast), color var(--transition-fast);
}
.sidebar-collapse-btn:hover {
  background: #F7F9FC;
  color: var(--color-text);
}

.sidebar-footer {
  padding: 14px 12px 18px;
  border-top: 1px solid rgba(236, 241, 246, 0.9);
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
  background: #F4F7FB;
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
  font-size: 0.92rem;
  font-weight: 500;
  color: var(--color-text);
}

.user-role {
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.sidebar-logout-btn {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  width: 100%;
  padding: 10px 12px;
  border-radius: 12px;
  color: var(--color-text-muted);
  transition: background-color var(--transition-fast), color var(--transition-fast);
}

.sidebar-logout-btn:hover {
  background: #F7F9FC;
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
  transition: margin-left var(--transition-normal);
  width: calc(100% - var(--sidebar-width));
}

.sidebar-collapsed .main-wrapper {
  margin-left: var(--sidebar-collapsed-width);
  width: calc(100% - var(--sidebar-collapsed-width));
}

.header {
  height: var(--header-height);
  background: rgba(255, 255, 255, 0.84);
  border-bottom: 1px solid rgba(223, 230, 239, 0.82);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-2xl);
  position: sticky;
  top: 0;
  z-index: 50;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
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
  border: 1px solid var(--liquid-border);
  border-radius: var(--radius-sm);
  background: var(--liquid-bg);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: transform var(--transition-fast), background-color var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
}

.period-nav:hover {
  background: var(--color-bg);
  color: var(--color-text);
  transform: translateY(-1px);
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
  border: 1px solid var(--liquid-border);
  border-radius: 999px;
  background: var(--liquid-bg);
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text);
  cursor: pointer;
  transition: transform var(--transition-fast), background-color var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast);
  font-family: var(--font-sans);
}

.period-current:hover {
  background: var(--liquid-bg-strong);
  border-color: var(--color-primary);
  box-shadow: 0 4px 10px rgba(37, 99, 235, 0.1);
  transform: translateY(-1px);
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
  background: var(--liquid-bg-strong);
  border: 1px solid var(--liquid-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  z-index: 200;
  padding: var(--space-sm);
  animation: dropdownIn 0.18s var(--ease-emphasized);
  transform-origin: top right;
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
  transition: background-color var(--transition-fast), color var(--transition-fast), transform var(--transition-fast);
}

.period-option:hover {
  background: rgba(255, 255, 255, 0.72);
  transform: translateX(2px);
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
  color: var(--color-text-muted);
  background: #F3F4F6;
  padding: 1px 6px;
  border-radius: 8px;
  letter-spacing: 0.02em;
}

.header-refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: 1px solid var(--liquid-border);
  background: var(--liquid-bg);
  color: var(--color-text-secondary);
  transition: transform var(--transition-fast), background-color var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
}

.header-refresh-btn:hover {
  background: var(--liquid-bg-strong);
  color: var(--color-text);
  transform: rotate(-10deg);
}

.content {
  flex: 1;
  padding: var(--space-2xl);
  max-width: 1480px;
  width: 100%;
  margin: 0 auto;
}

.content > * {
  animation: contentIn 0.28s var(--ease-emphasized) both;
}

.content > *:nth-child(2) { animation-delay: 0.03s; }
.content > *:nth-child(3) { animation-delay: 0.06s; }
.content > *:nth-child(4) { animation-delay: 0.09s; }
.content > *:nth-child(5) { animation-delay: 0.12s; }

/* Mobile Overlay */
.mobile-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 99;
  animation: fadeIn 0.2s var(--ease-standard);
}

@keyframes dropdownIn {
  from {
    opacity: 0;
    transform: translateY(-6px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes contentIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
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
    width: 100% !important;
  }

  .mobile-menu-btn {
    display: flex;
  }

  .sidebar-collapse-btn {
    display: none;
  }

  .header {
    height: auto;
    min-height: var(--header-height);
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
    font-size: 0.9375rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .header-actions {
    width: 100%;
    justify-content: space-between;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .header-nav-btn span {
    display: none;
  }

  .header-nav-actions {
    justify-self: end;
  }

  .header-date {
    display: none;
  }

  .content {
    padding: var(--space-md);
  }

  .period-selector {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
  }

  .period-nav {
    display: none;
  }

  .period-current {
    width: 100%;
    justify-content: center;
    min-width: 0;
    padding: 5px 10px;
    font-size: 0.75rem;
  }

  .period-current span {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .period-dropdown {
    width: 100%;
    min-width: 0;
    left: 0;
    right: 0;
    transform-origin: top center;
  }

  .period-error {
    order: 4;
    width: 100%;
    max-width: none;
  }
}
</style>
