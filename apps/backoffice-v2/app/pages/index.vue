<template>
  <div class="home-page">
    <section class="home-hero">
      <div class="home-stage">
        <div class="welcome">
          <p class="welcome-greeting">{{ greeting }}, {{ user.name }}님</p>
          <div class="welcome-title-shell">
            <h1 class="welcome-title" aria-label="오늘 필요한 업무를 선택하세요">
              <span class="welcome-title-word welcome-title-word--first">오늘 필요한</span>
              <span class="welcome-title-word welcome-title-word--accent">업무를</span>
              <span class="welcome-title-word welcome-title-word--last">선택하세요</span>
            </h1>
          </div>
          <p v-if="welcomeNote" class="welcome-note">{{ welcomeNote }}</p>
          <div class="hero-actions">
            <button
              v-if="showQuickAction"
              type="button"
              class="hero-quick-action"
              :disabled="quickActionLoading"
              @click="handleQuickAction"
            >
              {{ quickActionLabel }}
            </button>
          </div>
        </div>

        <div class="feature-launcher">
          <NuxtLink
            v-for="item in quickMenus"
            :key="item.title"
            :to="item.to"
            class="feature-pill"
            :class="item.pillClass"
          >
            <strong class="feature-pill-label">{{ item.title }}</strong>
          </NuxtLink>
        </div>
      </div>
    </section>

    <section class="home-footer-shell">
      <div class="home-footer">
        <div class="home-footer-main">
          <div class="home-footer-brand">
            <div class="home-footer-logo-row">
              <img src="/goodforpat.png" alt="굿포펫" class="home-footer-logo" />
              <div class="home-footer-logo-copy">
                <span class="home-footer-logo-korean">굿포펫</span>
                <strong class="home-footer-logo-text">GoodForPat</strong>
              </div>
            </div>
            <p class="home-footer-copy">굿포펫 운영에 필요한 분석과 운영 업무를 한 곳에서 관리하는 내부용 백오피스입니다.</p>
            <span class="home-footer-meta">주요 데이터는 네이버 커머스 API와 내부 운영 입력값을 기준으로 관리됩니다.</span>
          </div>

          <div class="home-footer-links">
            <NuxtLink to="/dashboard" class="home-footer-link">실구매 대시보드</NuxtLink>
            <NuxtLink to="/customers" class="home-footer-link">고객 분석</NuxtLink>
            <NuxtLink to="/naver-sync" class="home-footer-link">주문 동기화</NuxtLink>
            <NuxtLink to="/coupang-sync" class="home-footer-link">쿠팡 동기화</NuxtLink>
            <NuxtLink to="/attendance/records" class="home-footer-link">근태 관리</NuxtLink>
          </div>
        </div>

        <div class="home-footer-bottom">
          <span>{{ currentYear }} JHBioFarm Backoffice</span>
          <span>Internal workspace only</span>
        </div>
      </div>
    </section>

    <NuxtLink to="/stress" class="stress-entry" aria-label="스트레스 게임 열기">
      <span class="stress-entry-line" />
      <span class="stress-entry-label">스트레스</span>
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
import type { AttendanceRecord, AttendanceSettings, AttendanceWorkSession, LeaveRequest } from '~/composables/useAttendance'

definePageMeta({ layout: 'home' })

type WorkToggleMode = 'before_start' | 'on' | 'off' | 'done'

const supabase = useSupabaseClient()
const toast = useToast()
const { isViewer, isAdmin, user, profileLoaded } = useCurrentUser()
const {
  DEFAULT_ATTENDANCE_SETTINGS,
  getKstDateKey,
  normalizeAttendanceSettings,
  computeAttendanceStatus,
} = useAttendance()
const currentYear = new Date().getFullYear()
const todayDate = ref(getKstDateKey())
const todayRecord = ref<AttendanceRecord | null>(null)
const todaySessions = ref<AttendanceWorkSession[]>([])
const todayApprovedLeave = ref<LeaveRequest | null>(null)
const attendanceSettings = ref<AttendanceSettings>(normalizeAttendanceSettings(DEFAULT_ATTENDANCE_SETTINGS))
const attendanceTableMissing = ref(false)
const sessionsTableMissing = ref(false)
const settingsTableMissing = ref(false)
const leaveTableMissing = ref(false)
const quickActionLoading = ref(false)

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 12) return '좋은 아침이에요'
  if (h < 18) return '안녕하세요'
  if (h < 22) return '좋은 저녁이에요'
  return '좋은 밤이에요'
})

const openTodaySession = computed(() => {
  return [...todaySessions.value].reverse().find((session) => !session.ended_at) || null
})

const workToggleMode = computed<WorkToggleMode>(() => {
  if (!todayRecord.value?.check_in_at) return 'before_start'
  if (todayRecord.value?.check_out_at) return 'done'
  if (openTodaySession.value) return 'on'
  return 'off'
})

const todayStatus = computed(() => {
  return computeAttendanceStatus({
    workDate: todayDate.value,
    checkInAt: todayRecord.value?.check_in_at,
    checkOutAt: todayRecord.value?.check_out_at,
    settings: attendanceSettings.value,
    approvedLeave: todayApprovedLeave.value,
    todayDate: todayDate.value,
  })
})

const blocksAttendanceToday = computed(() => {
  return !!todayApprovedLeave.value && ['annual', 'sick', 'official', 'other'].includes(todayApprovedLeave.value.leave_type)
})

const welcomeNote = computed(() => {
  if (todayApprovedLeave.value && blocksAttendanceToday.value) {
    return '오늘은 승인된 휴가 일정이 반영되어 있어요.'
  }
  if (attendanceTableMissing.value) {
    return '근태 테이블이 없어 빠른 실행은 사용할 수 없어요.'
  }
  if (workToggleMode.value === 'before_start') {
    return new Date().getHours() < 12
      ? '오늘 업무를 시작하기 전에 출근을 먼저 기록해보세요.'
      : '아직 출근 기록이 없다면 지금 바로 남길 수 있어요.'
  }
  if (workToggleMode.value === 'on') return '오늘 근무가 진행 중이에요.'
  if (workToggleMode.value === 'off') return '근무가 잠시 중단된 상태예요. 필요하면 다시 시작할 수 있어요.'
  if (todayStatus.value.code === 'done') return '오늘 근무 기록이 저장되어 있어요.'
  return `${todayStatus.value.label} 상태예요.`
})

const showQuickAction = computed(() => {
  if (!profileLoaded.value || !user.value.id) return false
  if (attendanceTableMissing.value) return false
  if (todayApprovedLeave.value && blocksAttendanceToday.value) return false
  return true
})

const quickActionLabel = computed(() => {
  if (workToggleMode.value === 'before_start') return '오늘 출근하기'
  return '근태 관리 열기'
})

const quickMenus = computed(() => {
  const items = [
    {
      title: '굿포펫',
      to: '/dashboard',
      pillClass: 'feature-pill--primary',
    },
    {
      title: '근태 관리',
      to: '/attendance/records',
      pillClass: 'feature-pill--soft',
    },
  ]

  if (!isViewer.value) {
    items.push({
      title: '업무 자동화',
      to: '/automation',
      pillClass: 'feature-pill--soft',
    })
  }

  if (isAdmin.value) {
    items.push({
      title: '계정 관리',
      to: '/settings/users',
      pillClass: 'feature-pill--soft',
    })
  }

  return items
})

function isMissingTableError(error: any, tableName: string) {
  const code = String(error?.code || '').toUpperCase()
  const msg = String(error?.message || '').toLowerCase()
  return code === '42P01' || msg.includes(tableName)
}

function isMissingSettingsColumnError(error: any) {
  const code = String(error?.code || '').toUpperCase()
  const msg = String(error?.message || '').toLowerCase()
  return code === '42703' || msg.includes('early_leave_grace_minutes')
}

async function fetchHomeAttendanceState() {
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

  const sessionsQuery = supabase
    .from('attendance_work_sessions')
    .select('id, record_id, user_id, work_date, started_at, ended_at, created_at, updated_at')
    .eq('user_id', user.value.id)
    .eq('work_date', todayDate.value)
    .order('started_at', { ascending: true })

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

  const [settingsResult, recordResult, sessionsResult, leaveResult] = await Promise.all([
    settingsQuery,
    recordQuery,
    sessionsQuery,
    leaveQuery,
  ])

  if (settingsResult.error) {
    if (isMissingTableError(settingsResult.error, 'attendance_settings') || isMissingSettingsColumnError(settingsResult.error)) {
      settingsTableMissing.value = true
      attendanceSettings.value = normalizeAttendanceSettings(DEFAULT_ATTENDANCE_SETTINGS)
    } else {
      throw settingsResult.error
    }
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

  if (sessionsResult.error) {
    if (isMissingTableError(sessionsResult.error, 'attendance_work_sessions')) {
      sessionsTableMissing.value = true
      todaySessions.value = []
    } else {
      throw sessionsResult.error
    }
  } else {
    sessionsTableMissing.value = false
    todaySessions.value = (sessionsResult.data || []) as AttendanceWorkSession[]
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

async function ensureTodayRecord(startIso: string) {
  if (!user.value.id) throw new Error('로그인 정보가 없습니다.')

  if (todayRecord.value?.id) {
    if (!todayRecord.value.check_in_at) {
      const { data, error } = await supabase
        .from('attendance_records')
        .update({
          check_in_at: startIso,
          updated_by: user.value.id,
        })
        .eq('id', todayRecord.value.id)
        .select('id, user_id, work_date, check_in_at, check_out_at, check_in_note, check_out_note, updated_by, created_at, updated_at')
        .single()

      if (error) throw error
      todayRecord.value = data as AttendanceRecord
    }
    return todayRecord.value
  }

  const { data, error } = await supabase
    .from('attendance_records')
    .insert({
      user_id: user.value.id,
      work_date: todayDate.value,
      check_in_at: startIso,
      updated_by: user.value.id,
    })
    .select('id, user_id, work_date, check_in_at, check_out_at, check_in_note, check_out_note, updated_by, created_at, updated_at')
    .single()

  if (error) throw error
  todayRecord.value = data as AttendanceRecord
  return todayRecord.value
}

async function handleHomeCheckIn() {
  if (!user.value.id || quickActionLoading.value) return
  quickActionLoading.value = true

  try {
    const nowIso = new Date().toISOString()

    if (sessionsTableMissing.value) {
      await ensureTodayRecord(nowIso)
    } else {
      const record = await ensureTodayRecord(nowIso)
      const { error } = await supabase
        .from('attendance_work_sessions')
        .insert({
          record_id: record.id,
          user_id: user.value.id,
          work_date: todayDate.value,
          started_at: nowIso,
        })

      if (isMissingTableError(error, 'attendance_work_sessions')) {
        sessionsTableMissing.value = true
      } else if (error) {
        throw error
      }
    }

    toast.success('출근 기록이 저장되었습니다.')
    await fetchHomeAttendanceState()
  } catch (error: any) {
    console.error('Failed to check in from home:', error)
    toast.error(`출근 기록 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    quickActionLoading.value = false
  }
}

async function handleQuickAction() {
  if (workToggleMode.value === 'before_start') {
    await handleHomeCheckIn()
    return
  }
  await navigateTo('/attendance/records')
}

watch(
  () => [profileLoaded.value, user.value.id],
  async ([loaded, uid]) => {
    if (!loaded || !uid) return
    await fetchHomeAttendanceState()
  },
  { immediate: true },
)
</script>

<style scoped>
.home-page {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  min-height: calc(100vh - 64px);
  gap: 0;
  padding: 0;
  position: relative;
  color: #0f172a;
  background:
    radial-gradient(760px 320px at 0% 0%, rgba(59, 130, 246, 0.06), transparent 68%),
    radial-gradient(820px 420px at 100% 0%, rgba(59, 130, 246, 0.05), transparent 70%),
    linear-gradient(180deg, #ffffff 0%, #fafcff 48%, #f6f9fe 100%);
}

.home-hero {
  width: min(100%, 1100px);
  margin: 0 auto;
  padding: 52px var(--space-2xl) 44px;
  display: flex;
  min-height: clamp(460px, 62vh, 680px);
  justify-content: center;
}

.home-stage {
  display: flex;
  flex-direction: column;
  gap: 34px;
  padding: 34px 20px 18px;
}

.welcome {
  text-align: center;
  animation: fadeUp 0.35s var(--ease-emphasized) both;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  max-width: 820px;
  margin: 0 auto;
}

.welcome-greeting {
  margin: 0;
  font-size: 0.98rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: #6b7280;
}

.welcome-title {
  font-size: clamp(2.3rem, 4.2vw, 3.4rem);
  font-weight: 800;
  color: #191f28;
  letter-spacing: -0.04em;
  line-height: 1.06;
  margin: 0;
}

.welcome-title-shell {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 12px;
}

.welcome-title-shell .welcome-title {
  position: relative;
  z-index: 1;
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.28em;
  text-shadow: 0 14px 28px rgba(148, 163, 184, 0.1);
}

.welcome-title-word {
  display: inline-block;
  opacity: 0;
  transform: translateY(18px);
  animation: titleWordReveal 620ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.welcome-title-word--first {
  animation-delay: 80ms;
}

.welcome-title-word--accent {
  animation-delay: 180ms;
  background: linear-gradient(135deg, #111827 10%, #2563eb 48%, #1d4ed8 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: none;
  position: relative;
}

.welcome-title-word--accent::after {
  content: '';
  position: absolute;
  left: 0.08em;
  right: 0.08em;
  bottom: 0.08em;
  height: 0.18em;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(191, 219, 254, 0.15), rgba(96, 165, 250, 0.3), rgba(191, 219, 254, 0.12));
  z-index: -1;
  filter: blur(1px);
}

.welcome-title-word--last {
  animation-delay: 280ms;
}

.welcome-copy {
  margin: 0;
  font-size: 1.02rem;
  line-height: 1.7;
  color: #8b95a1;
}

.welcome-note {
  margin: 0;
  font-size: 0.96rem;
  line-height: 1.6;
  color: #6b7280;
}

.hero-actions {
  display: flex;
  justify-content: center;
  margin-top: 6px;
}

.hero-quick-action {
  min-height: 52px;
  padding: 0 22px;
  border-radius: 999px;
  border: 1px solid rgba(191, 219, 254, 0.95);
  background: #2563eb;
  color: #ffffff;
  font-size: 0.96rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  box-shadow: 0 16px 30px rgba(37, 99, 235, 0.22);
  transition: transform var(--transition-normal), box-shadow var(--transition-normal), background var(--transition-normal);
}

.hero-quick-action:hover:not(:disabled) {
  transform: translateY(-1px);
  background: #1d4ed8;
  box-shadow: 0 20px 34px rgba(37, 99, 235, 0.24);
}

.hero-quick-action:disabled {
  cursor: wait;
  opacity: 0.68;
}

.feature-launcher {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 18px 20px;
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
}

.home-footer-shell {
  width: 100%;
  margin-top: auto;
  padding: 0 0 18px;
}

.home-footer {
  width: 100%;
  padding: 18px max(20px, calc((100vw - 1100px) / 2 + 20px)) 14px;
  background: rgba(255, 255, 255, 0.6);
  color: #334155;
  border-top: 1px solid rgba(203, 213, 225, 0.8);
  animation: fadeUp 0.42s var(--ease-emphasized) both;
  animation-delay: 0.2s;
  backdrop-filter: blur(20px);
}

.home-footer-main {
  max-width: 1100px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: center;
}

.home-footer-brand {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  flex: 1 1 0;
}

.home-footer-logo-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.home-footer-logo {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.home-footer-logo-copy {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.home-footer-logo-korean {
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: #64748b;
}

.home-footer-logo-text {
  font-size: 0.84rem;
  font-weight: 700;
  color: #0f172a;
}

.home-footer-copy {
  margin: 0;
  max-width: 540px;
  font-size: 0.78rem;
  line-height: 1.5;
  color: #64748b;
}

.home-footer-meta {
  font-size: 0.72rem;
  color: #94a3b8;
}

.home-footer-links {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  flex-wrap: wrap;
  flex: 0 0 auto;
}

.home-footer-link {
  font-size: 0.78rem;
  color: #475569;
  font-weight: 600;
  transition: color var(--transition-fast), transform var(--transition-fast);
}

.home-footer-link:hover {
  color: #0f172a;
  transform: translateX(2px);
}

.home-footer-bottom {
  max-width: 1100px;
  margin: 12px auto 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(226, 232, 240, 0.9);
  font-size: 0.68rem;
  color: #94a3b8;
}

.stress-entry {
  position: fixed;
  right: 24px;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 22px);
  z-index: 25;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(18px);
  color: rgba(17, 24, 39, 0.68);
  text-decoration: none;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    color 0.18s ease,
    border-color 0.18s ease;
}

.stress-entry:hover {
  transform: translateY(-2px);
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.12);
  border-color: rgba(59, 130, 246, 0.24);
  color: rgba(17, 24, 39, 0.88);
}

.stress-entry-line {
  width: 18px;
  height: 1px;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.5);
}

.stress-entry-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.feature-pill {
  min-width: 198px;
  min-height: 96px;
  padding: 0 34px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f2f4f6;
  border: 1px solid rgba(229, 232, 235, 0.9);
  box-shadow: none;
  color: #4e5968;
  text-decoration: none;
  transition: transform var(--transition-normal), background var(--transition-normal), border-color var(--transition-normal), color var(--transition-normal);
  animation: fadeUp 0.34s var(--ease-emphasized) both;
}

.feature-pill:nth-child(1) { animation-delay: 0.04s; }
.feature-pill:nth-child(2) { animation-delay: 0.08s; }
.feature-pill:nth-child(3) { animation-delay: 0.12s; }
.feature-pill:nth-child(4) { animation-delay: 0.16s; }

.feature-pill:hover {
  transform: translateY(-1px);
  border-color: rgba(209, 213, 219, 0.95);
  background: #e9edf1;
}

.feature-pill--primary {
  background: #4b5563;
  border-color: #4b5563;
  color: #ffffff;
}

.feature-pill--primary:hover {
  background: #374151;
  border-color: #374151;
}

.feature-pill--soft {
  background: #f2f4f6;
}

.feature-pill-label {
  font-size: 1.14rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  white-space: nowrap;
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

@keyframes titleWordReveal {
  0% {
    opacity: 0;
    transform: translateY(18px) scale(0.985);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (max-width: 768px) {
  .home-page {
    min-height: calc(100vh - 64px);
  }

  .home-hero {
    padding: 34px var(--space-md) 36px;
    min-height: auto;
  }

  .home-stage {
    gap: 24px;
    padding: 16px 0 10px;
  }

  .welcome {
    gap: 12px;
  }

  .feature-launcher {
    gap: 14px;
    max-width: 620px;
  }

  .home-footer {
    padding: 14px 18px 12px;
  }

  .home-footer-main {
    flex-direction: column;
    gap: 14px;
    align-items: flex-start;
  }

  .home-footer-links {
    width: 100%;
    justify-content: flex-start;
    gap: 12px;
    flex-wrap: wrap;
  }

  .home-footer-bottom {
    flex-direction: column;
    align-items: flex-start;
  }

  .stress-entry {
    right: 16px;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 84px);
    padding: 9px 12px;
    gap: 8px;
  }

  .stress-entry-label {
    font-size: 11px;
  }
}

@media (max-width: 480px) {
  .welcome-title-shell {
    padding: 0;
  }

  .welcome-title {
    font-size: 1.9rem;
  }

  .welcome-copy {
    font-size: 0.94rem;
  }

  .feature-launcher {
    gap: 12px;
  }

  .feature-pill {
    min-width: calc(50% - 6px);
    min-height: 76px;
    padding: 0 18px;
  }

  .feature-pill-label {
    font-size: 0.98rem;
  }

  .home-footer-links {
    gap: 10px;
  }
}

</style>
