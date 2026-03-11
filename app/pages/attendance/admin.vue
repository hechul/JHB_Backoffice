<template>
  <div class="admin-page">
    <div v-if="!profileLoaded" class="card empty-state">
      <div class="empty-state-title">권한 확인 중</div>
    </div>

    <div v-else-if="!isAdmin" class="card empty-state">
      <div class="empty-state-title">접근 권한이 없습니다</div>
      <div class="empty-state-desc">금일 근태 이력은 관리자 계정에서만 확인할 수 있습니다.</div>
    </div>

    <template v-else>
      <div class="admin-header">
        <div>
          <h1 class="admin-title">금일 근태 이력</h1>
          <div class="admin-subtitle">오늘 출근, 중단, 퇴근 상태만 간단히 확인합니다.</div>
        </div>
        <div class="admin-actions">
          <input v-model.trim="searchText" type="text" class="input search-input" placeholder="이름/아이디 검색" />
          <NuxtLink to="/attendance/settings" class="btn btn-ghost btn-sm">근무 기준 설정</NuxtLink>
        </div>
      </div>

      <div class="card admin-hero">
        <div>
          <div class="hero-label">오늘 근태 현황</div>
          <strong class="hero-value">{{ todayDate }}</strong>
          <div class="hero-note">지금 바로 확인해야 할 상태만 모아 보여줍니다.</div>
        </div>
        <div class="hero-side">
          <span class="hero-chip">{{ summaryHeadline }}</span>
        </div>
      </div>

      <div v-if="tableMissing" class="card notice-error">
        `attendance_records` 테이블이 없어 관리자 화면을 사용할 수 없습니다.
        `docs/sql/2026-03-05_attendance_phase1.sql` 실행이 필요합니다.
      </div>
      <div v-if="sessionsTableMissing" class="card notice-neutral">
        `attendance_work_sessions` 테이블이 없어 근무 시작/중단 기록 구분 없이 기존 출퇴근 기록만 표시합니다.
        `docs/sql/2026-03-10_attendance_work_sessions_patch.sql` 실행이 필요합니다.
      </div>
      <div v-if="settingsTableMissing" class="card notice-neutral">
        `attendance_settings` 최신 설정이 없어 기본 근무 기준(09:00~18:00, 조퇴 20분)으로 상태를 계산 중입니다.
      </div>
      <div v-if="leaveTableMissing" class="card notice-neutral">
        `leave_requests` 테이블이 없어 휴가/반차 정보는 표시되지 않습니다.
        `docs/sql/2026-03-10_attendance_phase2.sql` 실행이 필요합니다.
      </div>

      <div class="summary-grid">
        <div v-for="card in summaryCards" :key="card.label" class="card summary-card" :class="card.tone">
          <span class="summary-label">{{ card.label }}</span>
          <strong class="summary-value">{{ card.value }}</strong>
        </div>
      </div>

      <div class="card table-card">
        <div class="section-head">
          <h2>오늘 근태 현황</h2>
          <span class="section-caption">{{ todayDate }}</span>
        </div>
        <div class="status-filter-row">
          <button
            v-for="filter in adminStatusFilters"
            :key="filter.value"
            type="button"
            class="status-filter-chip"
            :class="{ active: selectedStatusFilter === filter.value }"
            @click="selectedStatusFilter = filter.value"
          >
            {{ filter.label }}
          </button>
        </div>
        <div v-if="filteredTodayRows.length === 0" class="table-empty">표시할 오늘 근태가 없습니다.</div>
        <div v-else class="today-card-grid">
          <article
            v-for="row in filteredTodayRows"
            :key="`today-${row.user_id}`"
            class="today-person-card"
            :class="row.displayStatus.className"
          >
            <div class="today-person-head">
              <div>
                <div class="today-person-name">{{ row.user_name }}</div>
                <div class="today-person-id">{{ row.user_login_id }}</div>
              </div>
              <span class="status-chip" :class="row.displayStatus.className">{{ row.displayStatus.label }}</span>
            </div>

            <div class="today-metric-grid">
              <div class="today-metric">
                <span class="today-metric-label">출근 시각</span>
                <strong class="today-metric-value">{{ formatTime(row.record?.check_in_at) }}</strong>
              </div>
              <div class="today-metric">
                <span class="today-metric-label">퇴근 시각</span>
                <strong class="today-metric-value">{{ formatTime(row.record?.check_out_at) }}</strong>
              </div>
              <div class="today-metric">
                <span class="today-metric-label">총 근무시간</span>
                <strong class="today-metric-value">{{ formatWorkDuration(row.workMinutes) }}</strong>
              </div>
            </div>

            <div class="today-note-row">
              <span class="today-note-label">메모</span>
              <span class="today-note-value">{{ row.note }}</span>
            </div>
          </article>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { AttendanceRecord, AttendanceSettings, AttendanceWorkSession, LeaveRequest } from '~/composables/useAttendance'

definePageMeta({ layout: 'attendance' })

type ProfileRow = {
  profile_id: string
  user_name: string
  user_email: string
  user_login_id: string
}

type TodayAttendanceRow = ProfileRow & {
  user_id: string
  record: AttendanceRecord | null
  leave: LeaveRequest | null
  sessions: AttendanceWorkSession[]
  displayStatus: { label: string, className: string }
  note: string
  workMinutes: number
}

const supabase = useSupabaseClient()
const toast = useToast()
const { user, isAdmin, profileLoaded } = useCurrentUser()
const {
  DEFAULT_ATTENDANCE_SETTINGS,
  getKstDateKey,
  formatTime,
  calcWorkMinutes,
  calcWorkSessionMinutes,
  formatWorkDuration,
  normalizeAttendanceSettings,
  getLeaveTypeLabel,
  computeAttendanceStatus,
} = useAttendance()

const todayDate = ref(getKstDateKey())
const searchText = ref('')
const selectedStatusFilter = ref<'all' | 'working' | 'paused' | 'done' | 'leave'>('all')
const loading = ref(false)
const tableMissing = ref(false)
const sessionsTableMissing = ref(false)
const settingsTableMissing = ref(false)
const leaveTableMissing = ref(false)
const activeProfiles = ref<ProfileRow[]>([])
const todayRecords = ref<AttendanceRecord[]>([])
const todaySessions = ref<AttendanceWorkSession[]>([])
const todayLeaves = ref<LeaveRequest[]>([])
const settings = ref<AttendanceSettings>(normalizeAttendanceSettings(DEFAULT_ATTENDANCE_SETTINGS))
const liveNowIso = ref(new Date().toISOString())
let liveTimer: ReturnType<typeof setInterval> | null = null

const todaySessionMap = computed(() => {
  const map = new Map<string, AttendanceWorkSession[]>()
  for (const session of todaySessions.value) {
    const bucket = map.get(session.user_id) || []
    bucket.push(session)
    map.set(session.user_id, bucket)
  }
  for (const sessions of map.values()) {
    sessions.sort((a, b) => a.started_at.localeCompare(b.started_at))
  }
  return map
})

const todayRows = computed<TodayAttendanceRow[]>(() => {
  const recordMap = new Map(todayRecords.value.map((row) => [row.user_id, row]))
  const leaveMap = new Map(todayLeaves.value.map((row) => [row.user_id, row]))
  return activeProfiles.value.map((profile) => {
    const record = recordMap.get(profile.profile_id) || null
    const leave = leaveMap.get(profile.profile_id) || null
    const sessions = todaySessionMap.value.get(profile.profile_id) || []
    const baseStatus = computeAttendanceStatus({
      workDate: todayDate.value,
      checkInAt: record?.check_in_at,
      checkOutAt: record?.check_out_at,
      settings: settings.value,
      approvedLeave: leave,
      todayDate: todayDate.value,
    })
    const openSession = sessions.find((session) => !session.ended_at)
    let displayStatus = { label: baseStatus.label, className: baseStatus.className }
    if (!leave && record?.check_in_at && !record?.check_out_at) {
      if (openSession) displayStatus = { label: '근무 중', className: 'status-working' }
      else if (!sessionsTableMissing.value) displayStatus = { label: '중단 중', className: 'status-paused' }
    }

    const workMinutes = sessions.length
      ? calcWorkSessionMinutes(sessions, liveNowIso.value)
      : calcWorkMinutes(record?.check_in_at, record?.check_out_at)

    const noteParts: string[] = []
    if (leave) noteParts.push(getLeaveTypeLabel(leave.leave_type))
    else if (record?.check_in_at && !record?.check_out_at) noteParts.push(openSession ? '근무 중' : '중단 중')
    if (sessions.length) noteParts.push(`근무 전환 ${sessions.length}회`)

    return {
      ...profile,
      user_id: profile.profile_id,
      record,
      leave,
      sessions,
      displayStatus,
      note: noteParts.join(' · ') || '-',
      workMinutes,
    }
  })
})

const filteredTodayRows = computed(() => {
  const q = searchText.value.trim().toLowerCase()
  return todayRows.value.filter((row) => {
    const matchesText = !q || [row.user_name, row.user_login_id, row.displayStatus.label, row.note]
      .some((value) => String(value || '').toLowerCase().includes(q))
    return matchesText && matchesAdminStatus(row)
  })
})

const adminStatusFilters = [
  { label: '전체', value: 'all' },
  { label: '근무 중', value: 'working' },
  { label: '중단 중', value: 'paused' },
  { label: '퇴근 완료', value: 'done' },
  { label: '휴가/반차', value: 'leave' },
] as const

const summaryCards = computed(() => {
  const list = todayRows.value
  const countBy = (predicate: (row: TodayAttendanceRow) => boolean) => list.filter(predicate).length
  return [
    { label: '전체 인원', value: `${list.length}명`, tone: 'tone-slate' },
    { label: '근무 중', value: `${countBy((row) => row.displayStatus.label === '근무 중')}명`, tone: 'tone-blue' },
    { label: '중단 중', value: `${countBy((row) => row.displayStatus.label === '중단 중')}명`, tone: 'tone-amber' },
    { label: '퇴근 완료', value: `${countBy((row) => row.record?.check_out_at != null)}명`, tone: 'tone-green' },
    { label: '휴가/반차', value: `${countBy((row) => row.displayStatus.className === 'status-leave')}명`, tone: 'tone-purple' },
  ]
})

const summaryHeadline = computed(() => {
  const working = summaryCards.value.find((card) => card.label === '근무 중')?.value || '0명'
  const leave = summaryCards.value.find((card) => card.label === '휴가/반차')?.value || '0명'
  return `근무 중 ${working} · 휴가 ${leave}`
})

function matchesAdminStatus(row: TodayAttendanceRow) {
  if (selectedStatusFilter.value === 'all') return true
  if (selectedStatusFilter.value === 'working') return row.displayStatus.label === '근무 중'
  if (selectedStatusFilter.value === 'paused') return row.displayStatus.label === '중단 중'
  if (selectedStatusFilter.value === 'done') return row.record?.check_out_at != null
  if (selectedStatusFilter.value === 'leave') return row.displayStatus.className === 'status-leave'
  return true
}

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

function splitEmailLoginId(email: string) {
  const [idPart = ''] = String(email || '').split('@')
  return idPart || '-'
}

async function fetchSettings() {
  const { data, error } = await supabase
    .from('attendance_settings')
    .select('id, work_start_time, work_end_time, late_grace_minutes, early_leave_grace_minutes, lunch_break_minutes, standard_work_minutes, created_at, updated_at')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error, 'attendance_settings') || isMissingSettingsColumnError(error)) {
      settingsTableMissing.value = true
      settings.value = normalizeAttendanceSettings(DEFAULT_ATTENDANCE_SETTINGS)
      return
    }
    throw error
  }

  settingsTableMissing.value = false
  settings.value = normalizeAttendanceSettings((data as any) || DEFAULT_ATTENDANCE_SETTINGS)
}

async function fetchActiveProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, status')
    .eq('status', 'active')
    .order('full_name', { ascending: true })

  if (error) throw error

  activeProfiles.value = (data || []).map((row: any) => {
    const email = String(row.email || '')
    return {
      profile_id: String(row.id || ''),
      user_name: String(row.full_name || splitEmailLoginId(email) || '-'),
      user_email: email,
      user_login_id: splitEmailLoginId(email),
    }
  })
}

async function fetchTodayAttendanceRows() {
  const { data, error } = await supabase
    .from('attendance_records')
    .select('id, user_id, work_date, check_in_at, check_out_at, check_in_note, check_out_note, updated_by, created_at, updated_at')
    .eq('work_date', todayDate.value)
    .order('id', { ascending: false })

  if (error) {
    if (isMissingTableError(error, 'attendance_records')) {
      tableMissing.value = true
      todayRecords.value = []
      return
    }
    throw error
  }

  tableMissing.value = false
  todayRecords.value = (data || []) as AttendanceRecord[]
}

async function fetchTodaySessions() {
  const { data, error } = await supabase
    .from('attendance_work_sessions')
    .select('id, record_id, user_id, work_date, started_at, ended_at, created_at, updated_at')
    .eq('work_date', todayDate.value)
    .order('started_at', { ascending: true })

  if (error) {
    if (isMissingTableError(error, 'attendance_work_sessions')) {
      sessionsTableMissing.value = true
      todaySessions.value = []
      return
    }
    throw error
  }

  sessionsTableMissing.value = false
  todaySessions.value = (data || []) as AttendanceWorkSession[]
}

async function fetchTodayLeaves() {
  const { data, error } = await supabase
    .from('leave_requests')
    .select('id, user_id, leave_type, start_date, end_date, status, reason, approved_by, approved_at, created_at, updated_at')
    .eq('status', 'approved')
    .lte('start_date', todayDate.value)
    .gte('end_date', todayDate.value)
    .order('id', { ascending: false })

  if (error) {
    if (isMissingTableError(error, 'leave_requests')) {
      leaveTableMissing.value = true
      todayLeaves.value = []
      return
    }
    throw error
  }

  leaveTableMissing.value = false
  todayLeaves.value = (data || []) as LeaveRequest[]
}

async function refreshTodayRows() {
  if (!isAdmin.value || !profileLoaded.value) return
  loading.value = true
  try {
    todayDate.value = getKstDateKey()
    await Promise.all([
      fetchSettings(),
      fetchActiveProfiles(),
      fetchTodayAttendanceRows(),
      fetchTodaySessions(),
      fetchTodayLeaves(),
    ])
  } catch (error: any) {
    console.error('Failed to fetch admin today rows:', error)
    toast.error(`금일 근태 조회 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    loading.value = false
  }
}

watch(
  () => [profileLoaded.value, isAdmin.value],
  async ([loaded, admin]) => {
    if (!loaded || !admin) return
    await refreshTodayRows()
  },
  { immediate: true },
)

onMounted(() => {
  liveTimer = setInterval(() => {
    liveNowIso.value = new Date().toISOString()
  }, 30000)
})

onBeforeUnmount(() => {
  if (liveTimer) clearInterval(liveTimer)
})
</script>

<style scoped>
.admin-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.admin-header,
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.admin-title {
  font-size: 1.18rem;
  font-weight: 700;
}

.admin-subtitle {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 0.94rem;
}

.admin-actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.admin-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(16, 185, 129, 0.06));
}

.hero-label {
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}

.hero-value {
  display: block;
  margin-top: 6px;
  font-size: 1.5rem;
  font-weight: 800;
}

.hero-note {
  margin-top: 8px;
  color: var(--color-text-secondary);
  font-size: 0.94rem;
}

.hero-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 18px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(37, 99, 235, 0.14);
  font-weight: 700;
}

.search-input {
  min-width: 220px;
}

.notice-error {
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
}

.notice-neutral {
  color: var(--color-text-secondary);
  background: rgba(248, 250, 252, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--space-md);
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tone-slate {
  background: rgba(148, 163, 184, 0.08);
}

.tone-blue {
  background: rgba(37, 99, 235, 0.08);
}

.tone-amber {
  background: rgba(245, 158, 11, 0.08);
}

.tone-green {
  background: rgba(16, 185, 129, 0.08);
}

.tone-purple {
  background: rgba(139, 92, 246, 0.09);
}

.summary-label {
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}

.summary-value {
  font-size: 1.35rem;
  font-weight: 800;
}

.table-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.today-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-md);
}

.today-person-card {
  padding: 18px;
  border-radius: 22px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.88);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.today-person-card.status-working {
  background: linear-gradient(180deg, rgba(37, 99, 235, 0.08), rgba(255, 255, 255, 0.92));
}

.today-person-card.status-paused {
  background: linear-gradient(180deg, rgba(245, 158, 11, 0.08), rgba(255, 255, 255, 0.92));
}

.today-person-card.status-leave {
  background: linear-gradient(180deg, rgba(139, 92, 246, 0.08), rgba(255, 255, 255, 0.92));
}

.today-person-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.today-person-name {
  font-size: 1.04rem;
  font-weight: 800;
}

.today-person-id {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 0.88rem;
}

.today-metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.today-metric {
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.14);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.today-metric-label {
  color: var(--color-text-secondary);
  font-size: 0.84rem;
}

.today-metric-value {
  font-size: 1rem;
  font-weight: 800;
}

.today-note-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 4px;
  border-top: 1px dashed rgba(148, 163, 184, 0.22);
}

.today-note-label {
  color: var(--color-text-secondary);
  font-size: 0.88rem;
}

.today-note-value {
  text-align: right;
  font-weight: 600;
}

.status-filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.status-filter-chip {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--color-border-light);
  background: rgba(255, 255, 255, 0.82);
  color: var(--color-text-secondary);
  font-size: 0.92rem;
  font-weight: 700;
}

.status-filter-chip.active {
  border-color: rgba(37, 99, 235, 0.22);
  background: rgba(37, 99, 235, 0.08);
  color: #1d4ed8;
}

.section-caption,
.table-empty {
  color: var(--color-text-secondary);
}

@media (max-width: 960px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .today-card-grid,
  .today-metric-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .admin-header,
  .section-head,
  .admin-actions,
  .admin-hero {
    flex-direction: column;
    align-items: stretch;
  }

  .search-input {
    min-width: 0;
  }
}
</style>
