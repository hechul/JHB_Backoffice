interface AnalysisMonthOption {
  value: string
  label: string
  count: number
}

const STORAGE_KEY = 'jhbiofarm_analysis_month'
const MONTH_OPTIONS_CACHE_KEY = 'jhbiofarm_analysis_month_options_v1'
const REFRESH_TIMEOUT_MS = 6000
const REFRESH_RETRY_COUNT = 2
const REFRESH_SAFETY_MS = 8000
const MAX_DB_RANGE_MONTHS = 60
const MONTH_COUNT_RPC_NAME = 'get_purchase_month_counts'

function isValidMonthToken(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value)
}

function toMonthToken(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function getCurrentMonthToken(): string {
  return toMonthToken(new Date())
}

function buildRollingMonths(windowSize = 3): string[] {
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
  if (!isValidMonthToken(value)) return value
  const [year, month] = value.split('-')
  return `${Number(year)}년 ${Number(month)}월`
}

function nextMonthToken(value: string): string {
  const [yearRaw, monthRaw] = value.split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  if (!Number.isFinite(year) || !Number.isFinite(month)) return value
  const d = new Date(year, month - 1, 1)
  d.setMonth(d.getMonth() + 1)
  return toMonthToken(d)
}

function buildMonthRange(fromMonth: string, toMonth: string): string[] {
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
  const withData = months.find((month) => month.count > 0)?.value
  if (withData) return withData
  const current = months.find((month) => month.value === currentMonth)?.value
  if (current) return current
  return months[0]?.value || currentMonth
}

export function useAnalysisPeriod() {
  const supabase = useSupabaseClient()
  const selectedMonth = useState<string>('analysis_selected_month', () => getCurrentMonthToken())
  const initialized = useState<boolean>('analysis_selected_month_initialized', () => false)
  const hasStoredSelection = useState<boolean>('analysis_selected_month_has_storage', () => false)
  const monthsLoading = useState<boolean>('analysis_available_months_loading', () => false)
  const monthsError = useState<string>('analysis_available_months_error', () => '')
  const availableMonths = useState<AnalysisMonthOption[]>('analysis_available_months', () => [])
  const refreshSeq = useState<number>('analysis_available_months_refresh_seq', () => 0)
  const refreshInFlight = useState<Promise<void> | null>('analysis_available_months_refresh_inflight', () => null)

  const validMonthValues = computed(() => new Set(['all', ...availableMonths.value.map((month) => month.value)]))

  const selectedPeriodLabel = computed(() => {
    if (selectedMonth.value === 'all') return '전체 기간'
    const match = availableMonths.value.find((month) => month.value === selectedMonth.value)
    return match ? match.label : selectedMonth.value
  })

  function persistSelection() {
    if (!process.client) return
    localStorage.setItem(STORAGE_KEY, selectedMonth.value)
  }

  function persistMonthOptionsCache() {
    if (!process.client) return
    localStorage.setItem(MONTH_OPTIONS_CACHE_KEY, JSON.stringify(availableMonths.value))
  }

  function readMonthOptionsCache() {
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
    let lastError: unknown = null
    for (let attempt = 1; attempt <= REFRESH_RETRY_COUNT; attempt += 1) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS)
      try {
        const result = await queryFn(controller.signal)
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
    try {
      const { data, error } = await runQueryWithTimeout(async (signal) => {
        const query = supabase.rpc(MONTH_COUNT_RPC_NAME as any)
        if (typeof (query as any).abortSignal === 'function') {
          return await (query as any).abortSignal(signal)
        }
        return await query
      })

      if (error) {
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
    const workers = Math.max(1, Math.min(6, candidateMonths.length))
    let cursor = 0

    const runWorker = async () => {
      while (cursor < candidateMonths.length) {
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
    if (!process.client) return
    if (refreshInFlight.value) return await refreshInFlight.value

    const task = (async () => {
      const seq = ++refreshSeq.value
      monthsLoading.value = true
      monthsError.value = ''

      const safetyTimer = setTimeout(() => {
        if (seq !== refreshSeq.value) return
        if (!monthsLoading.value) return
        monthsLoading.value = false
        monthsError.value = '기간 조회가 지연되어 이전 목록을 표시합니다.'
      }, REFRESH_SAFETY_MS)

      try {
        const baseMonths = buildRollingMonths(3)
        const rpcCountMap = await fetchMonthCountMapViaRpc()
        let candidateMonths: string[] = []
        let countMap = new Map<string, number>()

        if (rpcCountMap) {
          countMap = rpcCountMap
          candidateMonths = Array.from(new Set<string>([
            ...baseMonths,
            ...Array.from(countMap.keys()),
          ])).filter(isValidMonthToken)
        } else {
          const legacy = await fetchMonthCountMapLegacy(baseMonths)
          candidateMonths = legacy.candidateMonths
          countMap = legacy.countMap
        }

        if (seq !== refreshSeq.value) return

        const baseMonthSet = new Set(baseMonths)
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
    if (!validMonthValues.value.has(value)) return
    selectedMonth.value = value
    hasStoredSelection.value = true
    persistSelection()
  }

  function prevMonth() {
    const idx = availableMonths.value.findIndex((month) => month.value === selectedMonth.value)
    if (idx >= 0 && idx < availableMonths.value.length - 1) {
      selectMonth(availableMonths.value[idx + 1]!.value)
    }
  }

  function nextMonth() {
    const idx = availableMonths.value.findIndex((month) => month.value === selectedMonth.value)
    if (idx > 0) {
      selectMonth(availableMonths.value[idx - 1]!.value)
    }
  }

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
