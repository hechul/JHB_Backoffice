interface AnalysisMonthOption {
  value: string
  label: string
  count: number
}

const STORAGE_KEY = 'jhbiofarm_analysis_month'

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

export function useAnalysisPeriod() {
  const supabase = useSupabaseClient()
  const selectedMonth = useState<string>('analysis_selected_month', () => getCurrentMonthToken())
  const initialized = useState<boolean>('analysis_selected_month_initialized', () => false)
  const hasStoredSelection = useState<boolean>('analysis_selected_month_has_storage', () => false)
  const monthsLoading = useState<boolean>('analysis_available_months_loading', () => false)
  const availableMonths = useState<AnalysisMonthOption[]>('analysis_available_months', () => [])

  const validMonthValues = computed(() => new Set(['all', ...availableMonths.value.map((month) => month.value)]))

  const selectedPeriodLabel = computed(() => {
    if (selectedMonth.value === 'all') return '전체 기간'
    const match = availableMonths.value.find((month) => month.value === selectedMonth.value)
    return match ? match.label : selectedMonth.value
  })

  function persist() {
    if (!process.client) return
    localStorage.setItem(STORAGE_KEY, selectedMonth.value)
  }

  function hydrateFromStorage() {
    if (!process.client || initialized.value) return
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

  async function refreshMonths() {
    if (!process.client) return
    monthsLoading.value = true
    try {
      const [{ data: latestRow, error: latestError }, { data: oldestRow, error: oldestError }] = await Promise.all([
        supabase
          .from('purchases')
          .select('target_month')
          .order('target_month', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('purchases')
          .select('target_month')
          .order('target_month', { ascending: true })
          .limit(1)
          .maybeSingle(),
      ])

      if (latestError) throw latestError
      if (oldestError) throw oldestError

      const latestMonth = String(latestRow?.target_month || '').trim()
      const oldestMonth = String(oldestRow?.target_month || '').trim()
      const dbRangeMonths = isValidMonthToken(latestMonth) && isValidMonthToken(oldestMonth)
        ? buildMonthRange(oldestMonth, latestMonth)
        : []

      const baseMonths = buildRollingMonths(3)
      const candidateMonths = Array.from(new Set<string>([
        ...baseMonths,
        ...dbRangeMonths,
      ]))

      const countMap = new Map<string, number>()
      const workers = Math.max(1, Math.min(6, candidateMonths.length))
      let cursor = 0

      const runWorker = async () => {
        while (cursor < candidateMonths.length) {
          const idx = cursor
          cursor += 1
          const month = candidateMonths[idx]
          if (!month) continue
          const { count, error } = await supabase
            .from('purchases')
            .select('purchase_id', { count: 'exact', head: true })
            .eq('target_month', month)
          if (error) throw error
          countMap.set(month, Number(count || 0))
        }
      }

      await Promise.all(Array.from({ length: workers }, () => runWorker()))
      const baseMonthSet = new Set(baseMonths)

      availableMonths.value = candidateMonths
        .sort((a, b) => b.localeCompare(a))
        .filter((value) => baseMonthSet.has(value) || (countMap.get(value) || 0) > 0)
        .map((value) => ({
          value,
          label: formatMonthLabel(value),
          count: countMap.get(value) || 0,
        }))

      const currentValid = validMonthValues.value.has(selectedMonth.value)
      if (!currentValid) {
        selectedMonth.value = availableMonths.value[0]?.value || 'all'
        persist()
      } else if (!hasStoredSelection.value && availableMonths.value.length > 0) {
        selectedMonth.value = availableMonths.value[0]!.value
        persist()
      }
    } catch (error) {
      console.error('Failed to refresh analysis months:', error)
      if (!validMonthValues.value.has(selectedMonth.value)) {
        selectedMonth.value = 'all'
        persist()
      }
    } finally {
      monthsLoading.value = false
    }
  }

  function selectMonth(value: string) {
    if (!validMonthValues.value.has(value)) return
    selectedMonth.value = value
    hasStoredSelection.value = true
    persist()
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
    refreshMonths,
    selectMonth,
    prevMonth,
    nextMonth,
  }
}
