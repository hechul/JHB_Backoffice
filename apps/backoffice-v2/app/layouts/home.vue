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
          <NuxtLink to="/" class="home-nav-btn" aria-label="홈으로 이동">
            <House :size="16" :stroke-width="1.8" />
            <span>홈으로</span>
          </NuxtLink>
        </div>
      </div>
      <div class="home-header-right">
        <span class="home-date">{{ today }}</span>
        <span v-if="homeAttendanceBadge" class="home-attendance-badge" :class="homeAttendanceBadge.toneClass">
          <component :is="homeAttendanceBadge.icon" :size="13" :stroke-width="2" />
          <span>{{ homeAttendanceBadge.label }}</span>
        </span>
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
    <main class="home-content" :class="{ 'home-content--landing': route.path === '/' }">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { LogOut, House, ChevronLeft, BriefcaseBusiness, CheckCircle2, CircleAlert, CircleDashed, CircleSlash2, Plane } from 'lucide-vue-next'
import type { AttendanceRecord, AttendanceSettings, LeaveRequest } from '~/composables/useAttendance'

const { user, profileLoaded, logout } = useCurrentUser()
const route = useRoute()
const supabase = useSupabaseClient()
const {
  DEFAULT_ATTENDANCE_SETTINGS,
  computeAttendanceStatus,
  getKstDateKey,
  normalizeAttendanceSettings,
} = useAttendance()

const todayDate = ref(getKstDateKey())
const todayRecord = ref<AttendanceRecord | null>(null)
const todayApprovedLeave = ref<LeaveRequest | null>(null)
const attendanceSettings = ref<AttendanceSettings>(normalizeAttendanceSettings(DEFAULT_ATTENDANCE_SETTINGS))
const attendanceTableMissing = ref(false)
const leaveTableMissing = ref(false)
const settingsTableMissing = ref(false)

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

function isMissingTableError(error: any, tableName: string) {
  const code = String(error?.code || '').toUpperCase()
  const msg = String(error?.message || '').toLowerCase()
  return code === '42P01' || msg.includes(tableName)
}

function homeStatusIcon(code?: string) {
  const normalized = String(code || '')
  if (normalized === 'done') return CheckCircle2
  if (normalized === 'working') return BriefcaseBusiness
  if (normalized === 'late' || normalized === 'late_early' || normalized === 'early_leave') return CircleAlert
  if (normalized.includes('leave')) return Plane
  if (normalized === 'absent') return CircleSlash2
  return CircleDashed
}

function homeStatusTone(code?: string) {
  const normalized = String(code || '')
  if (normalized === 'done') return 'home-attendance-badge--done'
  if (normalized === 'working') return 'home-attendance-badge--working'
  if (normalized.includes('leave')) return 'home-attendance-badge--leave'
  if (normalized === 'late' || normalized === 'late_early' || normalized === 'early_leave') return 'home-attendance-badge--alert'
  if (normalized === 'absent') return 'home-attendance-badge--absent'
  return 'home-attendance-badge--default'
}

async function fetchHomeAttendance() {
  if (!user.value.id) return
  todayDate.value = getKstDateKey()

  const settingsQuery = supabase
    .from('attendance_settings')
    .select('id, work_start_time, work_end_time, late_grace_minutes, early_leave_grace_minutes, lunch_break_minutes, standard_work_minutes, created_at, updated_at')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()

  const recordQuery = supabase
    .from('attendance_records')
    .select('id, user_id, work_date, check_in_at, check_out_at, check_in_note, check_out_note, updated_by, created_at, updated_at')
    .eq('user_id', user.value.id)
    .eq('work_date', todayDate.value)
    .maybeSingle()

  const leaveQuery = supabase
    .from('leave_requests')
    .select('id, user_id, leave_type, start_date, end_date, status, reason, approved_by, approved_at, created_at, updated_at')
    .eq('user_id', user.value.id)
    .eq('status', 'approved')
    .lte('start_date', todayDate.value)
    .gte('end_date', todayDate.value)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

  const [settingsResult, recordResult, leaveResult] = await Promise.all([settingsQuery, recordQuery, leaveQuery])

  if (settingsResult.error) {
    if (isMissingTableError(settingsResult.error, 'attendance_settings')) settingsTableMissing.value = true
    else throw settingsResult.error
  } else {
    settingsTableMissing.value = false
    attendanceSettings.value = normalizeAttendanceSettings((settingsResult.data as any) || DEFAULT_ATTENDANCE_SETTINGS)
  }

  if (recordResult.error) {
    if (isMissingTableError(recordResult.error, 'attendance_records')) {
      attendanceTableMissing.value = true
      todayRecord.value = null
    } else {
      throw recordResult.error
    }
  } else {
    attendanceTableMissing.value = false
    todayRecord.value = (recordResult.data as AttendanceRecord | null) || null
  }

  if (leaveResult.error) {
    if (isMissingTableError(leaveResult.error, 'leave_requests')) {
      leaveTableMissing.value = true
      todayApprovedLeave.value = null
    } else {
      throw leaveResult.error
    }
  } else {
    leaveTableMissing.value = false
    todayApprovedLeave.value = (leaveResult.data as LeaveRequest | null) || null
  }
}

const homeAttendanceBadge = computed(() => {
  if (attendanceTableMissing.value) return null

  const status = computeAttendanceStatus({
    workDate: todayDate.value,
    checkInAt: todayRecord.value?.check_in_at,
    checkOutAt: todayRecord.value?.check_out_at,
    settings: attendanceSettings.value,
    approvedLeave: todayApprovedLeave.value,
    todayDate: todayDate.value,
  })

  return {
    label: status.label,
    icon: homeStatusIcon(status.code),
    toneClass: homeStatusTone(status.code),
  }
})

watch(
  () => user.value.id,
  async (id) => {
    if (!id) return
    await fetchHomeAttendance()
  },
  { immediate: true },
)

async function goHomeWithFallback() {
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
        window.location.assign('/')
      }
    }, 320)
    return
  }
  await goHomeWithFallback()
}

async function handleLogout() {
  await logout()
}
</script>

<style scoped>
.home-layout {
  min-height: 100vh;
  background:
    radial-gradient(900px 500px at 100% -12%, rgba(37, 99, 235, 0.08), transparent 72%),
    radial-gradient(860px 500px at 0% -20%, rgba(99, 102, 241, 0.06), transparent 76%),
    var(--color-bg);
}

/* Header */
.home-header {
  height: 64px;
  background: rgba(255, 255, 255, 0.78);
  border-bottom: 1px solid rgba(255, 255, 255, 0.5);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-3xl);
  position: sticky;
  top: 0;
  z-index: 40;
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
  transition: transform var(--transition-fast), opacity var(--transition-fast);
}

.home-logo:hover {
  transform: translateY(-1px);
  opacity: 0.92;
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
  position: relative;
  z-index: 3;
}

.home-nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--liquid-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  font-weight: 500;
  transition: transform var(--transition-fast), background-color var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
}

.home-nav-btn:hover {
  background: var(--liquid-bg);
  color: var(--color-text);
  border-color: rgba(255, 255, 255, 0.78);
  transform: translateY(-1px);
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

.home-attendance-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1;
}

.home-attendance-badge--working {
  background: rgba(37, 99, 235, 0.12);
  color: #1d4ed8;
}

.home-attendance-badge--done {
  background: rgba(239, 68, 68, 0.12);
  color: #dc2626;
}

.home-attendance-badge--leave {
  background: rgba(14, 165, 233, 0.12);
  color: #0284c7;
}

.home-attendance-badge--alert {
  background: rgba(245, 158, 11, 0.14);
  color: #b45309;
}

.home-attendance-badge--absent {
  background: rgba(107, 114, 128, 0.16);
  color: #4b5563;
}

.home-attendance-badge--default {
  background: rgba(100, 116, 139, 0.14);
  color: #475569;
}

.home-user {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.home-user-avatar {
  width: 32px;
  height: 32px;
  background: var(--liquid-bg);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}

.home-user-avatar:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
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
  transition: transform var(--transition-fast), background-color var(--transition-fast), color var(--transition-fast);
}

.home-logout-btn:hover {
  background: var(--liquid-bg);
  color: var(--color-text);
  transform: rotate(-10deg);
}

/* Content */
.home-content {
  max-width: 1120px;
  margin: 0 auto;
  padding: var(--space-3xl);
}

.home-content--landing {
  max-width: none;
  width: 100%;
  padding: 0;
}

.home-content > * {
  animation: homeContentIn 0.3s var(--ease-emphasized) both;
}

.home-content > *:nth-child(2) { animation-delay: 0.04s; }
.home-content > *:nth-child(3) { animation-delay: 0.08s; }

@keyframes homeContentIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 768px) {
  .home-header {
    height: auto;
    padding: var(--space-sm) var(--space-md);
    flex-wrap: wrap;
    gap: var(--space-sm);
  }

  .home-header-left,
  .home-header-right {
    width: 100%;
  }

  .home-header-left {
    justify-content: space-between;
    gap: var(--space-sm);
  }

  .home-header-right {
    justify-content: flex-end;
    gap: var(--space-md);
    flex-wrap: wrap;
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

  .home-attendance-badge {
    margin-left: auto;
  }

  .home-user-info {
    display: none;
  }

  .home-content {
    padding: var(--space-lg) var(--space-md) var(--space-2xl);
  }
}
</style>
