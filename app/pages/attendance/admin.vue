<template>
  <div class="admin-page">
    <div v-if="!profileLoaded" class="card empty-state">
      <div class="empty-state-title">권한 확인 중</div>
    </div>

    <div v-else-if="!isAdmin" class="card empty-state">
      <div class="empty-state-title">접근 권한이 없습니다</div>
      <div class="empty-state-desc">근태 전체 관리는 관리자 계정에서만 가능합니다.</div>
    </div>

    <template v-else>
      <div class="admin-header">
        <h1 class="admin-title">근태 전체 관리</h1>
        <div class="admin-filters">
          <input v-model="selectedMonth" type="month" class="input month-input" />
          <input v-model.trim="searchText" type="text" class="input search-input" placeholder="이름/아이디 검색" />
        </div>
      </div>

      <div v-if="tableMissing" class="card notice-error">
        `attendance_records` 테이블이 없어 관리자 화면을 사용할 수 없습니다.
        `docs/sql/2026-03-05_attendance_phase1.sql` 실행이 필요합니다.
      </div>

      <div class="card table-card">
        <div v-if="loading" class="table-empty">기록 불러오는 중...</div>
        <div v-else-if="filteredRows.length === 0" class="table-empty">조건에 맞는 기록이 없습니다.</div>
        <div v-else class="table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>날짜</th>
                <th>이름</th>
                <th>아이디</th>
                <th>출근</th>
                <th>퇴근</th>
                <th>근무시간</th>
                <th>상태</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filteredRows" :key="row.id">
                <td>{{ row.work_date }}</td>
                <td>{{ row.user_name }}</td>
                <td>{{ row.user_login_id }}</td>

                <template v-if="editingRowId === row.id">
                  <td>
                    <input v-model="editCheckIn" type="datetime-local" class="input dt-input" />
                  </td>
                  <td>
                    <input v-model="editCheckOut" type="datetime-local" class="input dt-input" />
                  </td>
                  <td>{{ editDuration }}</td>
                  <td>
                    <span class="status-chip" :class="statusClassFromValues(editCheckIn, editCheckOut)">
                      {{ statusLabelFromValues(editCheckIn, editCheckOut) }}
                    </span>
                  </td>
                  <td>
                    <div class="row-actions">
                      <button class="btn btn-primary btn-sm" :disabled="saving" @click="saveEdit(row)">저장</button>
                      <button class="btn btn-ghost btn-sm" :disabled="saving" @click="cancelEdit">취소</button>
                    </div>
                  </td>
                </template>

                <template v-else>
                  <td>{{ formatTime(row.check_in_at) }}</td>
                  <td>{{ formatTime(row.check_out_at) }}</td>
                  <td>{{ formatWorkDuration(calcWorkMinutes(row.check_in_at, row.check_out_at)) }}</td>
                  <td>
                    <span class="status-chip" :class="statusClass(row)">
                      {{ statusLabel(row) }}
                    </span>
                  </td>
                  <td>
                    <div class="row-actions">
                      <button class="btn btn-ghost btn-sm" :disabled="saving" @click="startEdit(row)">수정</button>
                      <button class="btn btn-ghost btn-sm btn-danger" :disabled="saving" @click="removeRow(row)">삭제</button>
                    </div>
                  </td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { AttendanceRecord } from '~/composables/useAttendance'

definePageMeta({ layout: 'home' })

type AdminAttendanceRow = AttendanceRecord & {
  user_name: string
  user_email: string
  user_login_id: string
}

const supabase = useSupabaseClient()
const toast = useToast()
const { user, isAdmin, profileLoaded } = useCurrentUser()
const {
  getKstMonthKey,
  getMonthRange,
  formatTime,
  calcWorkMinutes,
  formatWorkDuration,
  toDateTimeLocalValue,
  parseDateTimeLocalToIso,
} = useAttendance()

const selectedMonth = ref(getKstMonthKey())
const searchText = ref('')
const loading = ref(false)
const saving = ref(false)
const tableMissing = ref(false)
const rows = ref<AdminAttendanceRow[]>([])

const editingRowId = ref<number | null>(null)
const editCheckIn = ref('')
const editCheckOut = ref('')

const filteredRows = computed(() => {
  const q = searchText.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter((row) => {
    return [
      row.user_name,
      row.user_email,
      row.user_login_id,
      row.work_date,
    ].some((v) => String(v || '').toLowerCase().includes(q))
  })
})

const editDuration = computed(() => {
  const inIso = parseDateTimeLocalToIso(editCheckIn.value)
  const outIso = parseDateTimeLocalToIso(editCheckOut.value)
  return formatWorkDuration(calcWorkMinutes(inIso, outIso))
})

function isMissingTableError(error: any) {
  const code = String(error?.code || '').toUpperCase()
  const msg = String(error?.message || '').toLowerCase()
  return code === '42P01' || msg.includes('attendance_records')
}

function splitEmailLoginId(email: string) {
  const [idPart = ''] = String(email || '').split('@')
  return idPart || '-'
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

function statusLabelFromValues(checkIn: string, checkOut: string) {
  if (!checkIn) return '미출근'
  if (!checkOut) return '근무중'
  return '퇴근 완료'
}

function statusClassFromValues(checkIn: string, checkOut: string) {
  if (!checkIn) return 'status-empty'
  if (!checkOut) return 'status-working'
  return 'status-done'
}

async function fetchAttendanceRows() {
  const { start, end } = getMonthRange(selectedMonth.value)
  const { data, error } = await supabase
    .from('attendance_records')
    .select('id, user_id, work_date, check_in_at, check_out_at, check_in_note, check_out_note, updated_by, created_at, updated_at')
    .gte('work_date', start)
    .lte('work_date', end)
    .order('work_date', { ascending: false })
    .order('id', { ascending: false })

  if (error) {
    if (isMissingTableError(error)) {
      tableMissing.value = true
      rows.value = []
      return [] as AttendanceRecord[]
    }
    throw error
  }

  tableMissing.value = false
  return (data || []) as AttendanceRecord[]
}

async function fetchUserMap(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, { name: string; email: string; loginId: string }>()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', userIds)

  if (error) throw error

  const map = new Map<string, { name: string; email: string; loginId: string }>()
  for (const row of data || []) {
    const email = String((row as any).email || '')
    map.set(String((row as any).id), {
      name: String((row as any).full_name || splitEmailLoginId(email) || '-'),
      email,
      loginId: splitEmailLoginId(email),
    })
  }
  return map
}

async function refreshRows() {
  if (!isAdmin.value || !profileLoaded.value) return
  loading.value = true
  try {
    const attendanceRows = await fetchAttendanceRows()
    const userIds = Array.from(new Set(attendanceRows.map((r) => r.user_id).filter(Boolean)))
    const profileMap = await fetchUserMap(userIds)

    rows.value = attendanceRows.map((row) => {
      const profile = profileMap.get(row.user_id)
      return {
        ...row,
        user_name: profile?.name || '-',
        user_email: profile?.email || '',
        user_login_id: profile?.loginId || '-',
      }
    })
  } catch (error: any) {
    console.error('Failed to fetch admin attendance rows:', error)
    toast.error(`근태 목록 조회 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    loading.value = false
  }
}

function startEdit(row: AdminAttendanceRow) {
  editingRowId.value = row.id
  editCheckIn.value = toDateTimeLocalValue(row.check_in_at)
  editCheckOut.value = toDateTimeLocalValue(row.check_out_at)
}

function cancelEdit() {
  editingRowId.value = null
  editCheckIn.value = ''
  editCheckOut.value = ''
}

async function saveEdit(row: AdminAttendanceRow) {
  if (!editingRowId.value) return
  const checkInIso = parseDateTimeLocalToIso(editCheckIn.value)
  const checkOutIso = parseDateTimeLocalToIso(editCheckOut.value)

  if (checkOutIso && !checkInIso) {
    toast.error('퇴근 시간만 단독 저장할 수 없습니다.')
    return
  }
  if (checkInIso && checkOutIso && new Date(checkOutIso).getTime() < new Date(checkInIso).getTime()) {
    toast.error('퇴근 시간은 출근 시간보다 빠를 수 없습니다.')
    return
  }

  saving.value = true
  try {
    const { error } = await supabase
      .from('attendance_records')
      .update({
        check_in_at: checkInIso,
        check_out_at: checkOutIso,
        updated_by: user.value.id || null,
      })
      .eq('id', row.id)

    if (error) throw error
    toast.success('근태 기록이 수정되었습니다.')
    cancelEdit()
    await refreshRows()
  } catch (error: any) {
    console.error('Failed to save admin attendance edit:', error)
    toast.error(`수정 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    saving.value = false
  }
}

async function removeRow(row: AdminAttendanceRow) {
  if (!confirm(`${row.user_name}님의 ${row.work_date} 근태 기록을 삭제할까요?`)) return
  saving.value = true
  try {
    const { error } = await supabase
      .from('attendance_records')
      .delete()
      .eq('id', row.id)
    if (error) throw error
    toast.success('근태 기록이 삭제되었습니다.')
    await refreshRows()
  } catch (error: any) {
    console.error('Failed to delete attendance row:', error)
    toast.error(`삭제 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    saving.value = false
  }
}

watch(
  () => [profileLoaded.value, isAdmin.value],
  async ([loaded, admin]) => {
    if (!loaded || !admin) return
    await refreshRows()
  },
  { immediate: true },
)

watch(selectedMonth, async () => {
  if (!profileLoaded.value || !isAdmin.value) return
  await refreshRows()
})
</script>

<style scoped>
.admin-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.admin-title {
  font-size: 1.125rem;
  font-weight: 700;
}

.admin-filters {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.month-input {
  width: 170px;
}

.search-input {
  width: 220px;
}

.notice-error {
  font-size: 0.8125rem;
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
}

.table-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.table-empty {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.table-wrap {
  overflow-x: auto;
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 920px;
}

.admin-table th,
.admin-table td {
  border-bottom: 1px solid var(--color-border-light);
  padding: 10px 8px;
  text-align: left;
  font-size: 0.8125rem;
}

.admin-table th {
  color: var(--color-text-muted);
  font-weight: 600;
}

.dt-input {
  min-width: 168px;
}

.row-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
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

.btn-danger {
  color: #dc2626;
}

@media (max-width: 768px) {
  .admin-header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
