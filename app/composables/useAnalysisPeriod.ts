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
      const countMap = new Map<string, number>()
      const pageSize = 1000
      let from = 0

      while (true) {
        const { data, error } = await supabase
          .from('purchases')
          .select('target_month')
          .order('purchase_id', { ascending: true })
          .range(from, from + pageSize - 1)

        if (error) throw error
        const rows = (data || []) as Array<{ target_month: string | null }>
        if (rows.length === 0) break

        for (const row of rows) {
          const month = String(row.target_month || '').trim()
          if (!isValidMonthToken(month)) continue
          countMap.set(month, (countMap.get(month) || 0) + 1)
        }

        if (rows.length < pageSize) break
        from += pageSize
      }

      const baseMonths = buildRollingMonths(3)
      const merged = baseMonths.map((month) => [month, countMap.get(month) || 0] as const)

      availableMonths.value = merged
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([value, count]) => ({
          value,
          label: formatMonthLabel(value),
          count,
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
