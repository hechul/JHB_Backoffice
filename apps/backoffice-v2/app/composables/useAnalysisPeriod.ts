// 분석 화면에서 월 선택 드롭다운 1개를 여러 페이지가 공통으로 쓰기 때문에
// 값/목록/로딩/에러 상태를 composable 하나로 묶어서 관리합니다.
interface AnalysisMonthOption {
  // 실제 내부 값. 예: 2026-02
  value: string
  // 화면에 보여줄 라벨. 예: 2026년 2월
  label: string
  // 해당 월에 존재하는 주문 건수
  count: number
}

// 마지막으로 사용자가 선택한 월을 브라우저에 저장하는 키
const STORAGE_KEY = 'jhbiofarm_analysis_month'
// 월 옵션 목록 자체를 캐시해 두는 키
const MONTH_OPTIONS_CACHE_KEY = 'jhbiofarm_analysis_month_options_v1'
// DB/RPC 조회 1회 타임아웃
const REFRESH_TIMEOUT_MS = 6000
// 조회 실패 시 재시도 횟수
const REFRESH_RETRY_COUNT = 2
// 너무 오래 걸릴 때 사용자에게 "지연" 메시지를 보여주기 위한 안전 타이머
const REFRESH_SAFETY_MS = 8000
// DB를 직접 훑을 때 과도하게 오래된 월까지 가지 않도록 제한하는 개월 수
const MAX_DB_RANGE_MONTHS = 60
// Supabase RPC 이름. 월별 purchase 건수를 빠르게 세기 위한 함수
const MONTH_COUNT_RPC_NAME = 'get_purchase_month_counts'

function isValidMonthToken(value: string): boolean {
  // YYYY-MM 형식만 유효한 분석 월로 인정합니다.
  return /^\d{4}-\d{2}$/.test(value)
}

function toMonthToken(date: Date): string {
  // Date를 YYYY-MM 문자열로 바꿉니다.
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function getCurrentMonthToken(): string {
  // 현재 시각 기준의 "이번 달" 토큰을 돌려줍니다.
  return toMonthToken(new Date())
}

function buildRollingMonths(windowSize = 3): string[] {
  // 최근 N개월을 기본 후보군으로 만듭니다.
  // DB 조회가 실패해도 최소한 최근 월은 드롭다운에 보이게 하려는 목적입니다.
  const result: string[] = []
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)

  for (let i = 0; i < windowSize; i++) {
    const d = new Date(firstDay.getFullYear(), firstDay.getMonth() - i, 1)
    result.push(toMonthToken(d))
  }
  return result
}

function formatMonthLabel(value: string): string {
  // YYYY-MM을 "2026년 2월" 같은 한국어 라벨로 바꿉니다.
  if (!isValidMonthToken(value)) return value
  const [year, month] = value.split('-')
  return `${Number(year)}년 ${Number(month)}월`
}

function nextMonthToken(value: string): string {
  // 주어진 월에서 +1개월 이동한 월 토큰을 계산합니다.
  const [yearRaw, monthRaw] = value.split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  if (!Number.isFinite(year) || !Number.isFinite(month)) return value
  const d = new Date(year, month - 1, 1)
  d.setMonth(d.getMonth() + 1)
  return toMonthToken(d)
}

function buildMonthRange(fromMonth: string, toMonth: string): string[] {
  // 시작 월 ~ 종료 월 사이를 한 달씩 채운 배열을 만듭니다.
  // 예: 2025-12 ~ 2026-02 -> [2025-12, 2026-01, 2026-02]
  if (!isValidMonthToken(fromMonth) || !isValidMonthToken(toMonth)) return []
  if (fromMonth > toMonth) return []
  const result: string[] = []
  let cursor = fromMonth
  let guard = 0
  while (cursor <= toMonth && guard < 240) {
    result.push(cursor)
    if (cursor === toMonth) break
    cursor = nextMonthToken(cursor)
    guard += 1
  }
  return result
}

function normalizeMonthOptions(raw: unknown): AnalysisMonthOption[] {
  // localStorage나 RPC 응답처럼 구조가 느슨한 입력을
  // 화면에서 바로 쓸 수 있는 표준 월 옵션 배열로 정리합니다.
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      const value = String((item as any)?.value || '').trim()
      const count = Number((item as any)?.count || 0)
      if (!isValidMonthToken(value)) return null
      return {
        value,
        label: formatMonthLabel(value),
        count: Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0,
      } satisfies AnalysisMonthOption
    })
    .filter(Boolean)
    .sort((a, b) => String((b as AnalysisMonthOption).value).localeCompare(String((a as AnalysisMonthOption).value))) as AnalysisMonthOption[]
}

function pickPreferredMonth(months: AnalysisMonthOption[], currentMonth = getCurrentMonthToken()): string {
  // 월 목록을 갱신했을 때 기본 선택할 월을 고릅니다.
  // 우선순위:
  // 1) 실제 데이터가 있는 가장 최신 월
  // 2) 현재 달
  // 3) 목록의 첫 번째 월
  const withData = months.find((month) => month.count > 0)?.value
  if (withData) return withData
  const current = months.find((month) => month.value === currentMonth)?.value
  if (current) return current
  return months[0]?.value || currentMonth
}

export function useAnalysisPeriod() {
  // 이 composable은 분석 화면 공통 상태이므로 useState를 사용해
  // 페이지가 달라도 같은 선택값을 공유합니다.
  const supabase = useSupabaseClient()
  // 현재 사용자가 보고 있는 월
  const selectedMonth = useState<string>('analysis_selected_month', () => getCurrentMonthToken())
  // localStorage에서 초기값을 한 번만 읽게 하기 위한 플래그
  const initialized = useState<boolean>('analysis_selected_month_initialized', () => false)
  // 사용자가 직접 월을 고른 적이 있는지 여부
  const hasStoredSelection = useState<boolean>('analysis_selected_month_has_storage', () => false)
  // 월 목록 조회 로딩 여부
  const monthsLoading = useState<boolean>('analysis_available_months_loading', () => false)
  // 월 목록 조회 실패 메시지
  const monthsError = useState<string>('analysis_available_months_error', () => '')
  // 드롭다운에 보여줄 월 옵션 목록
  const availableMonths = useState<AnalysisMonthOption[]>('analysis_available_months', () => [])
  // 가장 최근 refresh 호출 순번. 오래 걸린 이전 요청 결과가 뒤늦게 덮어쓰지 못하게 합니다.
  const refreshSeq = useState<number>('analysis_available_months_refresh_seq', () => 0)
  // 이미 진행 중인 refresh 작업이 있으면 재사용하기 위한 Promise 참조
  const refreshInFlight = useState<Promise<void> | null>('analysis_available_months_refresh_inflight', () => null)

  // 현재 선택 가능한 월 목록 집합. 여기 없는 값은 selectMonth에서 거릅니다.
  const validMonthValues = computed(() => new Set(['all', ...availableMonths.value.map((month) => month.value)]))

  const selectedPeriodLabel = computed(() => {
    // 전체 기간은 고정 라벨을 사용하고,
    // 특정 월이면 availableMonths에 있는 예쁜 라벨을 우선 사용합니다.
    if (selectedMonth.value === 'all') return '전체 기간'
    const match = availableMonths.value.find((month) => month.value === selectedMonth.value)
    return match ? match.label : selectedMonth.value
  })

  function persistSelection() {
    // 서버에서는 localStorage가 없으므로 브라우저에서만 저장합니다.
    if (!process.client) return
    localStorage.setItem(STORAGE_KEY, selectedMonth.value)
  }

  function persistMonthOptionsCache() {
    // 마지막으로 성공한 월 옵션을 캐시해 두면
    // 다음 진입 시 DB 조회 전에도 드롭다운을 빠르게 채울 수 있습니다.
    if (!process.client) return
    localStorage.setItem(MONTH_OPTIONS_CACHE_KEY, JSON.stringify(availableMonths.value))
  }

  function readMonthOptionsCache() {
    // 캐시 파싱에 실패하면 잘못된 값이므로 localStorage에서 제거합니다.
    if (!process.client) return []
    const raw = localStorage.getItem(MONTH_OPTIONS_CACHE_KEY)
    if (!raw) return []
    try {
      return normalizeMonthOptions(JSON.parse(raw))
    } catch {
      localStorage.removeItem(MONTH_OPTIONS_CACHE_KEY)
      return []
    }
  }

  function hydrateFromStorage() {
    // 분석 화면 첫 진입 시 localStorage의 마지막 월/월목록을 복원합니다.
    if (!process.client || initialized.value) return

    const cachedOptions = readMonthOptionsCache()
    if (cachedOptions.length > 0) {
      availableMonths.value = cachedOptions
    }

    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && stored !== 'all') {
      selectedMonth.value = stored
      hasStoredSelection.value = true
    } else {
      selectedMonth.value = getCurrentMonthToken()
      hasStoredSelection.value = false
    }
    initialized.value = true
  }

  async function runQueryWithTimeout<T>(
    queryFn: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    // Supabase 조회가 멈춰 있을 때 화면이 영원히 로딩되지 않게
    // timeout + retry를 공통 래퍼로 처리합니다.
    let lastError: unknown = null
    for (let attempt = 1; attempt <= REFRESH_RETRY_COUNT; attempt += 1) {
      // 매 시도마다 별도의 AbortController를 만들어 timeout을 걸어 둡니다.
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS)
      try {
        const result = await queryFn(controller.signal)
        // Supabase는 throw 대신 result.error를 담아 주는 경우가 많아서
        // 에러 필드를 직접 확인합니다.
        const responseError = (result as any)?.error
        if (responseError && attempt < REFRESH_RETRY_COUNT) {
          lastError = responseError
          continue
        }
        return result
      } catch (error) {
        lastError = error
        if (attempt < REFRESH_RETRY_COUNT) continue
        throw error
      } finally {
        clearTimeout(timer)
      }
    }
    if (lastError instanceof Error) throw lastError
    throw new Error('기간 조회 실패')
  }

  async function fetchMonthCountMapViaRpc(): Promise<Map<string, number> | null> {
    // 가장 이상적인 경로: DB의 전용 RPC로 월별 주문 수를 한 번에 받습니다.
    try {
      const { data, error } = await runQueryWithTimeout(async (signal) => {
        const query = supabase.rpc(MONTH_COUNT_RPC_NAME as any)
        if (typeof (query as any).abortSignal === 'function') {
          return await (query as any).abortSignal(signal)
        }
        return await query
      })

      if (error) {
        // RPC가 아예 없거나 배포가 덜 된 경우에는 legacy 경로로 자연스럽게 fallback 합니다.
        const code = String((error as any)?.code || '').toUpperCase()
        const message = String((error as any)?.message || '').toLowerCase()
        const rpcMissing = code === 'PGRST202' || code === '42883' || message.includes('does not exist')
        if (!rpcMissing) {
          console.warn('Month count RPC failed, fallback to legacy query path:', error)
        }
        return null
      }

      const rows = Array.isArray(data) ? (data as any[]) : []
      const countMap = new Map<string, number>()
      for (const row of rows) {
        // RPC마다 컬럼 이름이 조금 다를 수 있어 후보 키를 모두 허용합니다.
        const month = String(row?.target_month ?? row?.month ?? row?.period ?? '').trim()
        if (!isValidMonthToken(month)) continue
        const rawCount = Number(row?.count ?? row?.total ?? row?.order_count ?? row?.purchase_count ?? 0)
        const count = Number.isFinite(rawCount) ? Math.max(0, Math.floor(rawCount)) : 0
        countMap.set(month, count)
      }
      return countMap
    } catch (error) {
      console.warn('Month count RPC call failed, fallback to legacy query path:', error)
      return null
    }
  }

  async function fetchMonthCountMapLegacy(baseMonths: string[]): Promise<{ candidateMonths: string[]; countMap: Map<string, number> }> {
    // RPC가 없을 때의 백업 경로입니다.
    // purchases에서 가장 오래된 월/최신 월을 조회한 뒤 그 사이 월 범위를 만들고,
    // 각 월의 건수를 직접 세는 방식입니다.
    const [{ data: latestRow, error: latestError }, { data: oldestRow, error: oldestError }] = await Promise.all([
      runQueryWithTimeout(async (signal) => {
        const query = supabase
          .from('purchases')
          .select('target_month')
          .order('target_month', { ascending: false })
          .limit(1)
          .maybeSingle()
        return await (query as any).abortSignal(signal)
      }),
      runQueryWithTimeout(async (signal) => {
        const query = supabase
          .from('purchases')
          .select('target_month')
          .order('target_month', { ascending: true })
          .limit(1)
          .maybeSingle()
        return await (query as any).abortSignal(signal)
      }),
    ])

    if (latestError) throw latestError
    if (oldestError) throw oldestError

    const latestMonth = String(latestRow?.target_month || '').trim()
    const oldestMonth = String(oldestRow?.target_month || '').trim()
    const dbRange = isValidMonthToken(latestMonth) && isValidMonthToken(oldestMonth)
      ? buildMonthRange(oldestMonth, latestMonth)
      : []

    const dbRangeMonths = dbRange.length > MAX_DB_RANGE_MONTHS
      ? dbRange.slice(-MAX_DB_RANGE_MONTHS)
      : dbRange

    const candidateMonths = Array.from(new Set<string>([
      ...baseMonths,
      ...dbRangeMonths,
    ])).filter(isValidMonthToken)

    const countMap = new Map<string, number>()
    // 월 수가 많을 수 있으므로 worker 개수를 제한해 병렬로 count를 조회합니다.
    const workers = Math.max(1, Math.min(6, candidateMonths.length))
    let cursor = 0

    const runWorker = async () => {
      while (cursor < candidateMonths.length) {
        // cursor를 공유하면서 각 worker가 다음 월 하나씩 가져갑니다.
        const idx = cursor
        cursor += 1
        const month = candidateMonths[idx]
        if (!month) continue
        try {
          const { count, error } = await runQueryWithTimeout(async (signal) => {
            const query = supabase
              .from('purchases')
              .select('purchase_id', { count: 'exact', head: true })
              .eq('target_month', month)
            return await (query as any).abortSignal(signal)
          })
          if (error) {
            console.warn('Failed to fetch month count:', month, error)
            countMap.set(month, 0)
            continue
          }
          countMap.set(month, Number(count || 0))
        } catch (error) {
          console.warn('Failed to fetch month count with timeout:', month, error)
          countMap.set(month, 0)
        }
      }
    }

    await Promise.all(Array.from({ length: workers }, () => runWorker()))
    return { candidateMonths, countMap }
  }

  async function refreshMonths() {
    // 월 옵션 새로고침의 공개 함수입니다.
    // 여러 페이지가 동시에 호출해도 실제 조회는 한 번만 돌게 합니다.
    if (!process.client) return
    if (refreshInFlight.value) return await refreshInFlight.value

    const task = (async () => {
      // seq를 올려두면 오래 걸린 이전 refresh 결과가 나중에 도착해도 무시할 수 있습니다.
      const seq = ++refreshSeq.value
      monthsLoading.value = true
      monthsError.value = ''

      // 너무 오래 걸리면 캐시된 목록을 우선 보여주기 위한 보호 타이머입니다.
      const safetyTimer = setTimeout(() => {
        if (seq !== refreshSeq.value) return
        if (!monthsLoading.value) return
        monthsLoading.value = false
        monthsError.value = '기간 조회가 지연되어 이전 목록을 표시합니다.'
      }, REFRESH_SAFETY_MS)

      try {
        // 최근 3개월은 기본 후보로 항상 넣어 둡니다.
        const baseMonths = buildRollingMonths(3)
        const rpcCountMap = await fetchMonthCountMapViaRpc()
        let candidateMonths: string[] = []
        let countMap = new Map<string, number>()

        if (rpcCountMap) {
          // 빠른 RPC 경로 성공
          countMap = rpcCountMap
          candidateMonths = Array.from(new Set<string>([
            ...baseMonths,
            ...Array.from(countMap.keys()),
          ])).filter(isValidMonthToken)
        } else {
          // RPC 경로 실패 → legacy 경로 사용
          const legacy = await fetchMonthCountMapLegacy(baseMonths)
          candidateMonths = legacy.candidateMonths
          countMap = legacy.countMap
        }

        if (seq !== refreshSeq.value) return

        const baseMonthSet = new Set(baseMonths)
        // 최종 드롭다운 목록:
        // 최근 3개월은 무조건 보여주고,
        // 그 외에는 실제 건수가 있는 월만 보여줍니다.
        availableMonths.value = candidateMonths
          .sort((a, b) => b.localeCompare(a))
          .filter((month) => baseMonthSet.has(month) || (countMap.get(month) || 0) > 0)
          .map((month) => ({
            value: month,
            label: formatMonthLabel(month),
            count: countMap.get(month) || 0,
          }))

        persistMonthOptionsCache()

        const currentValid = validMonthValues.value.has(selectedMonth.value)
        const preferredMonth = pickPreferredMonth(availableMonths.value)

        // 현재 선택한 월이 더 이상 유효하지 않으면
        // 데이터가 있는 가장 적절한 월로 자동 이동시킵니다.
        if (!currentValid && availableMonths.value.length > 0) {
          selectedMonth.value = preferredMonth
          persistSelection()
        } else if (!hasStoredSelection.value && availableMonths.value.length > 0) {
          selectedMonth.value = preferredMonth
          persistSelection()
        }

        monthsError.value = ''
      } catch (error) {
        if (seq !== refreshSeq.value) return
        console.error('Failed to refresh analysis months:', error)
        monthsError.value = '기간 조회에 실패했습니다. 다시 시도해 주세요.'
        if (availableMonths.value.length === 0) {
          // 완전히 비어 버리는 것보다는 마지막 캐시를 보여주는 쪽이 UX가 낫습니다.
          availableMonths.value = readMonthOptionsCache()
        }
      } finally {
        clearTimeout(safetyTimer)
        if (seq === refreshSeq.value) {
          monthsLoading.value = false
        }
      }
    })()

    refreshInFlight.value = task
    try {
      await task
    } finally {
      if (refreshInFlight.value === task) {
        refreshInFlight.value = null
      }
    }
  }

  function selectMonth(value: string) {
    // 존재하지 않는 월을 강제로 선택하지 못하게 막습니다.
    if (!validMonthValues.value.has(value)) return
    selectedMonth.value = value
    hasStoredSelection.value = true
    persistSelection()
  }

  function prevMonth() {
    // availableMonths는 최신월 → 과거월 순서라서
    // prev는 배열에서 다음 인덱스로 이동합니다.
    const idx = availableMonths.value.findIndex((month) => month.value === selectedMonth.value)
    if (idx >= 0 && idx < availableMonths.value.length - 1) {
      selectMonth(availableMonths.value[idx + 1]!.value)
    }
  }

  function nextMonth() {
    // next는 배열에서 이전 인덱스로 이동합니다.
    const idx = availableMonths.value.findIndex((month) => month.value === selectedMonth.value)
    if (idx > 0) {
      selectMonth(availableMonths.value[idx - 1]!.value)
    }
  }

  // 브라우저 환경이면 composable 최초 사용 시 바로 localStorage를 복원합니다.
  if (process.client) hydrateFromStorage()

  return {
    selectedMonth,
    selectedPeriodLabel,
    availableMonths,
    monthsLoading,
    monthsError,
    refreshMonths,
    selectMonth,
    prevMonth,
    nextMonth,
  }
}
