export interface MonthlyWorkflow {
  orderUploadDone: boolean
  influencerUploadDone: boolean
  filterDone: boolean
  pendingReview: number
  mappingPending: number
  unmappedProducts: string[]
  uploadStats: {
    orderNew: number
    orderExcluded: number
    expInserted: number
  }
  lastOrderUpload: string
  campaignLabel: string
  lastFilterRun: string
}

const STORAGE_KEY = 'jhbiofarm_monthly_workflow_v1'

function currentMonthToken() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${yyyy}-${mm}`
}

const DEFAULT_MONTH = currentMonthToken()

function createEmptyWorkflow(): MonthlyWorkflow {
  return {
    orderUploadDone: false,
    influencerUploadDone: false,
    filterDone: false,
    pendingReview: 0,
    mappingPending: 0,
    unmappedProducts: [],
    uploadStats: { orderNew: 0, orderExcluded: 0, expInserted: 0 },
    lastOrderUpload: '미업로드',
    campaignLabel: '미등록',
    lastFilterRun: '미실행',
  }
}

function cloneDefaults(): Record<string, MonthlyWorkflow> {
  return {}
}

function nowStamp() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

function toOperationMonth(month: string) {
  return month === 'all' ? DEFAULT_MONTH : month
}

export function useMonthlyWorkflow() {
  const workflowByMonth = useState<Record<string, MonthlyWorkflow>>('monthly_workflow_by_month', () => cloneDefaults())
  const initialized = useState<boolean>('monthly_workflow_by_month_initialized', () => false)

  function persist() {
    if (!process.client) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workflowByMonth.value))
  }

  function hydrateFromStorage() {
    if (!process.client || initialized.value) return
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Record<string, Partial<MonthlyWorkflow>>
        for (const [month, candidate] of Object.entries(parsed)) {
          const current = workflowByMonth.value[month] || createEmptyWorkflow()
          workflowByMonth.value[month] = {
            orderUploadDone: Boolean(candidate.orderUploadDone ?? current.orderUploadDone),
            influencerUploadDone: Boolean(candidate.influencerUploadDone ?? current.influencerUploadDone),
            filterDone: Boolean(candidate.filterDone ?? current.filterDone),
            pendingReview: Number.isFinite(candidate.pendingReview) ? Number(candidate.pendingReview) : current.pendingReview,
            mappingPending: Number.isFinite(candidate.mappingPending) ? Number(candidate.mappingPending) : current.mappingPending,
            unmappedProducts: Array.isArray(candidate.unmappedProducts)
              ? candidate.unmappedProducts.map((v) => String(v)).filter(Boolean)
              : current.unmappedProducts,
            uploadStats: {
              orderNew: Number.isFinite(candidate.uploadStats?.orderNew)
                ? Number(candidate.uploadStats?.orderNew)
                : current.uploadStats.orderNew,
              orderExcluded: Number.isFinite(candidate.uploadStats?.orderExcluded)
                ? Number(candidate.uploadStats?.orderExcluded)
                : current.uploadStats.orderExcluded,
              expInserted: Number.isFinite(candidate.uploadStats?.expInserted)
                ? Number(candidate.uploadStats?.expInserted)
                : current.uploadStats.expInserted,
            },
            lastOrderUpload: typeof candidate.lastOrderUpload === 'string' ? candidate.lastOrderUpload : current.lastOrderUpload,
            campaignLabel: typeof candidate.campaignLabel === 'string' ? candidate.campaignLabel : current.campaignLabel,
            lastFilterRun: typeof candidate.lastFilterRun === 'string' ? candidate.lastFilterRun : current.lastFilterRun,
          }
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
    initialized.value = true
  }

  function ensureMonth(month: string) {
    const key = toOperationMonth(month)
    if (!workflowByMonth.value[key]) {
      workflowByMonth.value[key] = createEmptyWorkflow()
    }
    return key
  }

  function getWorkflow(month: string) {
    const key = ensureMonth(month)
    return workflowByMonth.value[key]!
  }

  function setUploadResult(month: string, payload: {
    orderUploadDone?: boolean
    influencerUploadDone?: boolean
    campaignLabel?: string
    mappingPending?: number
    uploadStats?: { orderNew: number; orderExcluded: number; expInserted: number }
    unmappedProducts?: string[]
  }) {
    const key = ensureMonth(month)
    const target = workflowByMonth.value[key]!

    if (typeof payload.orderUploadDone === 'boolean') target.orderUploadDone = payload.orderUploadDone
    if (typeof payload.influencerUploadDone === 'boolean') target.influencerUploadDone = payload.influencerUploadDone
    if (typeof payload.campaignLabel === 'string' && payload.campaignLabel.trim()) target.campaignLabel = payload.campaignLabel.trim()
    if (typeof payload.mappingPending === 'number') target.mappingPending = Math.max(0, Math.floor(payload.mappingPending))
    if (payload.uploadStats) {
      target.uploadStats = {
        orderNew: Math.max(0, Math.floor(payload.uploadStats.orderNew || 0)),
        orderExcluded: Math.max(0, Math.floor(payload.uploadStats.orderExcluded || 0)),
        expInserted: Math.max(0, Math.floor(payload.uploadStats.expInserted || 0)),
      }
    }
    if (Array.isArray(payload.unmappedProducts)) {
      target.unmappedProducts = payload.unmappedProducts.map((v) => String(v).trim()).filter(Boolean)
      target.mappingPending = target.unmappedProducts.length
    }

    target.lastOrderUpload = nowStamp()
    target.filterDone = false
    target.pendingReview = 0
    target.lastFilterRun = '미실행'
    persist()
  }

  function setFilterResult(month: string, payload: { pendingReview: number }) {
    const key = ensureMonth(month)
    const target = workflowByMonth.value[key]!
    target.filterDone = true
    target.pendingReview = Math.max(0, Math.floor(payload.pendingReview))
    target.lastFilterRun = nowStamp()
    persist()
  }

  function setMappingPending(month: string, mappingPending: number) {
    const key = ensureMonth(month)
    workflowByMonth.value[key]!.mappingPending = Math.max(0, Math.floor(mappingPending))
    persist()
  }

  function setUnmappedProducts(month: string, productNames: string[]) {
    const key = ensureMonth(month)
    const normalized = productNames.map((v) => String(v).trim()).filter(Boolean)
    workflowByMonth.value[key]!.unmappedProducts = normalized
    workflowByMonth.value[key]!.mappingPending = normalized.length
    persist()
  }

  function setPendingReview(month: string, value: number) {
    const key = ensureMonth(month)
    workflowByMonth.value[key]!.pendingReview = Math.max(0, Math.floor(value))
    persist()
  }

  function resetMonth(month: string) {
    const key = ensureMonth(month)
    workflowByMonth.value[key] = createEmptyWorkflow()
    persist()
  }

  if (process.client) hydrateFromStorage()

  return {
    workflowByMonth,
    getWorkflow,
    setUploadResult,
    setMappingPending,
    setUnmappedProducts,
    setFilterResult,
    setPendingReview,
    resetMonth,
  }
}
