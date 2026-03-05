<template>
  <div class="records-page">
    <div class="records-header">
      <h1 class="records-title">출퇴근 기록</h1>
      <span class="records-subtitle">본인 근태 기록과 월별 이력을 확인합니다.</span>
    </div>

    <div class="card today-card">
      <div class="today-head">
        <div>
          <div class="today-label">오늘 ({{ todayDate }})</div>
          <strong class="today-status" :class="todayStatusClass">{{ todayStatusLabel }}</strong>
        </div>
        <div class="today-actions">
          <button class="btn btn-primary btn-sm" :disabled="!canCheckIn || saving" @click="handleCheckIn">
            출근 기록
          </button>
          <button class="btn btn-ghost btn-sm" :disabled="!canCheckOut || saving" @click="handleCheckOut">
            퇴근 기록
          </button>
        </div>
      </div>

      <div class="today-grid">
        <div class="today-item">
          <span>출근 시간</span>
          <strong>{{ formatTime(todayRecord?.check_in_at) }}</strong>
        </div>
        <div class="today-item">
          <span>퇴근 시간</span>
          <strong>{{ formatTime(todayRecord?.check_out_at) }}</strong>
        </div>
        <div class="today-item">
          <span>근무 시간</span>
          <strong>{{ todayWorkDuration }}</strong>
        </div>
      </div>

      <div v-if="tableMissing" class="today-warning">
        `attendance_records` 테이블이 없어 근태 기능을 사용할 수 없습니다.
        `docs/sql/2026-03-05_attendance_phase1.sql` 실행이 필요합니다.
      </div>
    </div>

    <div class="card history-card">
      <div class="history-head">
        <h2>월별 내 기록</h2>
        <input v-model="selectedMonth" type="month" class="input month-input" />
      </div>

      <div v-if="loading" class="history-empty">기록 불러오는 중...</div>
      <div v-else-if="monthlyRecords.length === 0" class="history-empty">해당 월 기록이 없습니다.</div>
      <div v-else class="history-table-wrap">
        <table class="history-table">
          <thead>
            <tr>
              <th>날짜</th>
              <th>출근</th>
              <th>퇴근</th>
              <th>근무시간</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in monthlyRecords" :key="row.id">
              <td>{{ formatDate(row.work_date) }}</td>
              <td>{{ formatTime(row.check_in_at) }}</td>
              <td>{{ formatTime(row.check_out_at) }}</td>
              <td>{{ formatWorkDuration(calcWorkMinutes(row.check_in_at, row.check_out_at)) }}</td>
              <td>
                <span class="status-chip" :class="statusClass(row)">
                  {{ statusLabel(row) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AttendanceRecord } from '~/composables/useAttendance'

definePageMeta({ layout: 'home' })

const supabase = useSupabaseClient()
const toast = useToast()
const { user, profileLoaded } = useCurrentUser()
const {
  getKstDateKey,
  getKstMonthKey,
  getMonthRange,
  formatDate,
  formatTime,
  calcWorkMinutes,
  formatWorkDuration,
} = useAttendance()

const todayDate = ref(getKstDateKey())
const selectedMonth = ref(getKstMonthKey())
const todayRecord = ref<AttendanceRecord | null>(null)
const monthlyRecords = ref<AttendanceRecord[]>([])
const loading = ref(false)
const saving = ref(false)
const tableMissing = ref(false)

const todayStatusLabel = computed(() => {
  if (!todayRecord.value?.check_in_at) return '미출근'
  if (!todayRecord.value?.check_out_at) return '근무중'
  return '퇴근 완료'
})

const todayStatusClass = computed(() => {
  if (!todayRecord.value?.check_in_at) return 'status-empty'
  if (!todayRecord.value?.check_out_at) return 'status-working'
  return 'status-done'
})

const canCheckIn = computed(() => profileLoaded.value && !!user.value.id && !todayRecord.value?.check_in_at && !tableMissing.value)
const canCheckOut = computed(() => {
  return profileLoaded.value
    && !!user.value.id
    && !!todayRecord.value?.check_in_at
    && !todayRecord.value?.check_out_at
    && !tableMissing.value
})

const todayWorkDuration = computed(() => {
  if (!todayRecord.value) return '-'
  const minutes = calcWorkMinutes(todayRecord.value.check_in_at, todayRecord.value.check_out_at)
  return formatWorkDuration(minutes)
})

function isMissingTableError(error: any) {
  const code = String(error?.code || '').toUpperCase()
  const msg = String(error?.message || '').toLowerCase()
  return code === '42P01' || msg.includes('attendance_records')
}

function statusLabel(row: AttendanceRecord) {
  if (!row.check_in_at) return '미출근'
  if (!row.check_out_at) return '근무중'
  return '퇴근 완료'
}

function statusClass(row: AttendanceRecord) {
  if (!row.check_in_at) return 'status-empty'
  if (!row.check_out_at) return 'status-working'
  return 'status-done'
}

async function fetchTodayRecord() {
  if (!user.value.id) return
  const { data, error } = await supabase
    .from('attendance_records')
    .select('id, user_id, work_date, check_in_at, check_out_at, check_in_note, check_out_note, updated_by, created_at, updated_at')
    .eq('user_id', user.value.id)
    .eq('work_date', todayDate.value)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error)) {
      tableMissing.value = true
      todayRecord.value = null
      return
    }
    throw error
  }

  tableMissing.value = false
  todayRecord.value = (data as AttendanceRecord | null) || null
}

async function fetchMonthlyRecords() {
  if (!user.value.id) return
  const { start, end } = getMonthRange(selectedMonth.value)

  const { data, error } = await supabase
    .from('attendance_records')
    .select('id, user_id, work_date, check_in_at, check_out_at, check_in_note, check_out_note, updated_by, created_at, updated_at')
    .eq('user_id', user.value.id)
    .gte('work_date', start)
    .lte('work_date', end)
    .order('work_date', { ascending: false })
    .order('id', { ascending: false })

  if (error) {
    if (isMissingTableError(error)) {
      tableMissing.value = true
      monthlyRecords.value = []
      return
    }
    throw error
  }

  tableMissing.value = false
  monthlyRecords.value = (data || []) as AttendanceRecord[]
}

async function refreshRecords() {
  if (!profileLoaded.value || !user.value.id) return
  loading.value = true
  try {
    todayDate.value = getKstDateKey()
    await fetchTodayRecord()
    await fetchMonthlyRecords()
  } catch (error: any) {
    console.error('Failed to fetch attendance records:', error)
    toast.error(`근태 기록을 불러오지 못했습니다: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    loading.value = false
  }
}

async function handleCheckIn() {
  if (!canCheckIn.value) return
  if (!user.value.id) return

  saving.value = true
  try {
    const nowIso = new Date().toISOString()

    if (todayRecord.value?.id) {
      const { error } = await supabase
        .from('attendance_records')
        .update({
          check_in_at: nowIso,
          updated_by: user.value.id,
        })
        .eq('id', todayRecord.value.id)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('attendance_records')
        .insert({
          user_id: user.value.id,
          work_date: todayDate.value,
          check_in_at: nowIso,
          updated_by: user.value.id,
        })
      if (error) throw error
    }

    toast.success('출근 기록이 저장되었습니다.')
    await refreshRecords()
  } catch (error: any) {
    console.error('Failed to check in:', error)
    toast.error(`출근 기록 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    saving.value = false
  }
}

async function handleCheckOut() {
  if (!canCheckOut.value || !todayRecord.value?.id) return
  if (!user.value.id) return

  saving.value = true
  try {
    const nowIso = new Date().toISOString()
    const { error } = await supabase
      .from('attendance_records')
      .update({
        check_out_at: nowIso,
        updated_by: user.value.id,
      })
      .eq('id', todayRecord.value.id)

    if (error) throw error
    toast.success('퇴근 기록이 저장되었습니다.')
    await refreshRecords()
  } catch (error: any) {
    console.error('Failed to check out:', error)
    toast.error(`퇴근 기록 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    saving.value = false
  }
}

watch(
  () => [profileLoaded.value, user.value.id],
  async ([loaded, uid]) => {
    if (!loaded || !uid) return
    await refreshRecords()
  },
  { immediate: true },
)

watch(selectedMonth, async () => {
  if (!profileLoaded.value || !user.value.id) return
  try {
    await fetchMonthlyRecords()
  } catch (error: any) {
    console.error('Failed to fetch monthly attendance records:', error)
    toast.error(`월별 기록 조회 실패: ${error?.message || '알 수 없는 오류'}`)
  }
})
</script>

<style scoped>
.records-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.records-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.records-title {
  font-size: 1.125rem;
  font-weight: 700;
}

.records-subtitle {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.today-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.today-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
}

.today-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin-bottom: 4px;
}

.today-status {
  font-size: 0.9375rem;
  font-weight: 700;
}

.today-actions {
  display: flex;
  gap: var(--space-xs);
  flex-wrap: wrap;
}

.today-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-md);
}

.today-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.today-item span {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.today-item strong {
  font-size: 0.875rem;
  color: var(--color-text);
}

.today-warning {
  font-size: 0.75rem;
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 8px 10px;
}

.history-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.history-head h2 {
  font-size: 0.9375rem;
  font-weight: 700;
}

.month-input {
  max-width: 180px;
}

.history-empty {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.history-table-wrap {
  overflow-x: auto;
}

.history-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 640px;
}

.history-table th,
.history-table td {
  border-bottom: 1px solid var(--color-border-light);
  padding: 10px 8px;
  text-align: left;
  font-size: 0.8125rem;
}

.history-table th {
  color: var(--color-text-muted);
  font-weight: 600;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.6875rem;
  font-weight: 600;
}

.status-empty {
  color: #6b7280;
  background: #f3f4f6;
}

.status-working {
  color: #0369a1;
  background: #e0f2fe;
}

.status-done {
  color: #166534;
  background: #dcfce7;
}

@media (max-width: 768px) {
  .today-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .today-grid {
    grid-template-columns: 1fr;
  }
}
</style>
