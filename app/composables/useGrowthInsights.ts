import { computePurchaseQuantity, formatQuantityCount } from '~/composables/usePurchaseQuantity'
import { computeChurnRisk, normalizeExpectedConsumptionDays } from '~/composables/useChurnRisk'
import {
  computeCustomerStage,
  computePurchaseIntensity,
  countDistinctPurchaseMonths,
  countRecentPurchaseDays,
  customerStageLabel,
  productStageLabel,
  type CustomerStageCode,
  type PurchaseIntensityCode,
} from '~/composables/useGrowthStage'
import { purchaseQuantityInput, purchaseSelectColumns, supportsPurchaseSourceColumns } from '~/composables/usePurchaseSourceFields'

export interface GrowthPurchaseRow {
  purchase_id: string
  customer_key: string
  buyer_name: string
  buyer_id: string
  product_id: string
  product_name: string
  option_info: string
  source_product_name?: string
  source_option_info?: string
  quantity: number
  order_date: string
  target_month: string
  is_fake: boolean
  needs_review: boolean
  filter_ver: string | null
}

export interface GrowthProductMeta {
  pet_type: 'DOG' | 'CAT' | 'BOTH'
  stage: number | null
  expected_consumption_days: number | null
}

export interface GrowthTransition {
  customerKey: string
  name: string
  id: string
  date: string
  fromStage: CustomerStageCode
  toStage: CustomerStageCode
  petType: 'DOG' | 'CAT' | 'BOTH'
  purchaseCount: number
}

export interface GrowthCustomerInsight {
  customerKey: string
  name: string
  id: string
  petType: 'DOG' | 'CAT' | 'BOTH'
  stage: CustomerStageCode
  purchaseCount: number
  purchaseMonthCount: number
  recentPurchaseDayCount: number
  purchaseIntensity: PurchaseIntensityCode
  firstOrder: string
  lastOrder: string
  daysSinceLastOrder: number
  churnRisk: boolean
  transitions: GrowthTransition[]
}

export interface GrowthStageSummary {
  stage: CustomerStageCode
  label: string
  count: number
  ratio: number
  repeatCustomers: number
  highIntensityCustomers: number
  churnCustomers: number
  avgPurchaseCount: number
  avgRecentPurchaseDays: number
}

export interface GrowthTransitionSummary {
  key: string
  label: string
  count: number
  fromStage: CustomerStageCode
  toStage: CustomerStageCode
}

export interface GrowthTopProduct {
  name: string
  optionInfo: string
  pet: string
  stage: string
  count: number
}

export interface GrowthStageProductGroup {
  stage: CustomerStageCode
  label: string
  products: GrowthTopProduct[]
}

export interface GrowthStageCandidate {
  customerKey: string
  name: string
  id: string
  purchaseCount: number
  purchaseMonthCount: number
  purchaseIntensity: PurchaseIntensityCode
  lastOrder: string
  pet: string
}

export interface GrowthStageCandidateGroup {
  stage: CustomerStageCode
  label: string
  description: string
  customers: GrowthStageCandidate[]
}

export interface GrowthInsightsResult {
  summaries: GrowthStageSummary[]
  transitions: GrowthTransitionSummary[]
  recentTransitions: GrowthTransition[]
  stageProducts: GrowthStageProductGroup[]
  candidates: GrowthStageCandidateGroup[]
  customers: GrowthCustomerInsight[]
  totalCustomers: number
  realPurchases: number
}

const DB_FETCH_PAGE_SIZE = 1000
const STAGE_ORDER: CustomerStageCode[] = ['Entry', 'Growth', 'Premium', 'Core']

function parseOrderDate(value: string): Date {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? new Date('1970-01-01') : d
}

function normalizeForMatch(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]/g, '')
}

function normalizeOptionInfo(value: string): string {
  return String(value || '').trim() || '-'
}

function normalizeMissionProductName(rawName: string): string {
  const name = String(rawName || '').trim()
  if (!name) return ''

  const normalizedName = normalizeForMatch(name)
  const hasFreezeDried = normalizedName.includes('동결건조') || normalizedName.includes('동견건조')
  const hasAttachmentTreat = normalizedName.includes('애착트릿')
  if (hasFreezeDried && !hasAttachmentTreat) return '동결건조(리뉴얼전)'

  if (normalizedName.includes('애착트릿')) return '애착트릿'
  if (normalizedName.includes('츄라잇')) return '츄라잇'
  if (normalizedName.includes('케어푸')) return '케어푸'
  if (normalizedName.includes('두부모래')) return '두부모래'
  if (normalizedName.includes('이즈바이트')) return '이즈바이트'
  if (normalizedName.includes('엔자이츄')) return '엔자이츄'
  if (normalizedName.includes('트릿백')) return '미니 트릿백'
  if (normalizedName.includes('츄르짜개')) return '츄르짜개 (고양이 간식 디스펜서)'
  if (normalizedName.includes('도시락')) return '도시락 샘플팩'
  if (normalizedName.includes('맛보기')) return '전제품 맛보기 샘플'

  return name
}

function sanitizePetType(value: unknown): GrowthProductMeta['pet_type'] {
  const type = String(value || '').toUpperCase()
  if (type === 'DOG') return 'DOG'
  if (type === 'CAT') return 'CAT'
  if (type === 'BOTH' || type === 'ALL') return 'BOTH'
  return 'BOTH'
}

function mergePetType(prev: GrowthProductMeta['pet_type'] | undefined, next: GrowthProductMeta['pet_type']): GrowthProductMeta['pet_type'] {
  if (!prev) return next
  if (prev === next) return prev
  return 'BOTH'
}

function mergeProductMeta(prev: GrowthProductMeta | undefined, next: GrowthProductMeta): GrowthProductMeta {
  return {
    pet_type: mergePetType(prev?.pet_type, next.pet_type),
    stage: Math.max(prev?.stage || 0, next.stage || 0) || null,
    expected_consumption_days: Math.max(prev?.expected_consumption_days || 0, next.expected_consumption_days || 0) || null,
  }
}

function inferPetTypeFromName(productName: string): GrowthProductMeta['pet_type'] {
  const normalized = normalizeForMatch(productName)
  const hasDog = normalized.includes('강아지') || normalized.includes('강견') || normalized.includes('견')
  const hasCat = normalized.includes('고양이') || normalized.includes('묘') || normalized.includes('냥')
  if (hasDog && hasCat) return 'BOTH'
  if (hasDog) return 'DOG'
  if (hasCat) return 'CAT'
  return 'BOTH'
}

function petLabel(type: GrowthProductMeta['pet_type']): string {
  if (type === 'DOG') return '강아지'
  if (type === 'CAT') return '고양이'
  return '모두'
}

function customerGroupKey(row: GrowthPurchaseRow): string {
  return String(row.customer_key || '').trim() || `${String(row.buyer_id || '').trim()}_${String(row.buyer_name || '').trim()}`
}

function purchaseDateKey(row: Pick<GrowthPurchaseRow, 'order_date'>): string {
  return String(row.order_date || '').slice(0, 10)
}

function resolveExpectedConsumptionDays(
  row: Pick<GrowthPurchaseRow, 'product_id' | 'product_name'>,
  metaById: Record<string, GrowthProductMeta>,
  metaByName: Record<string, GrowthProductMeta>,
): number | null {
  const idKey = String(row.product_id || '').trim()
  const metaByProductId = idKey ? metaById[idKey] : null
  if (metaByProductId?.expected_consumption_days) return metaByProductId.expected_consumption_days

  const nameKey = normalizeForMatch(normalizeMissionProductName(row.product_name || ''))
  const metaByProductName = nameKey ? metaByName[nameKey] : null
  return metaByProductName?.expected_consumption_days ?? null
}

function derivePetType(rows: GrowthPurchaseRow[], metaById: Record<string, GrowthProductMeta>, metaByName: Record<string, GrowthProductMeta>): GrowthProductMeta['pet_type'] {
  let hasDog = false
  let hasCat = false

  for (const row of rows) {
    const idKey = String(row.product_id || '').trim()
    const metaByProductId = idKey ? metaById[idKey] : null
    const nameKey = normalizeForMatch(normalizeMissionProductName(row.product_name || ''))
    const metaByProductName = nameKey ? metaByName[nameKey] : null
    const petType = metaByProductId?.pet_type || metaByProductName?.pet_type || inferPetTypeFromName(row.product_name || '')

    if (petType === 'BOTH') return 'BOTH'
    if (petType === 'DOG') hasDog = true
    if (petType === 'CAT') hasCat = true
    if (hasDog && hasCat) return 'BOTH'
  }

  if (hasDog) return 'DOG'
  if (hasCat) return 'CAT'
  return 'BOTH'
}

function buildStageJourney(sortedDates: string[]) {
  if (!sortedDates.length) return { finalStage: 'Other' as CustomerStageCode, transitions: [] }

  const transitions: Array<{ date: string; fromStage: CustomerStageCode; toStage: CustomerStageCode }> = []
  let prevStage: CustomerStageCode = 'Other'
  const seenMonths = new Set<string>()

  for (const date of sortedDates) {
    const monthToken = String(date || '').slice(0, 7)
    if (!monthToken) continue
    seenMonths.add(monthToken)

    const stage = computeCustomerStage(seenMonths.size)
    if (prevStage !== 'Other' && stage !== prevStage) {
      transitions.push({ date, fromStage: prevStage, toStage: stage })
    }
    prevStage = stage
  }

  return {
    finalStage: prevStage === 'Other' ? ('Entry' as CustomerStageCode) : prevStage,
    transitions,
  }
}

async function loadProductMeta(supabase: any) {
  const { data, error } = await supabase
    .from('products')
    .select('product_id, product_name, pet_type, stage, expected_consumption_days')
    .is('deleted_at', null)

  if (error) throw error

  const byId: Record<string, GrowthProductMeta> = {}
  const byName: Record<string, GrowthProductMeta> = {}
  let hasExpectedConsumptionConfig = false

  for (const row of (data || []) as any[]) {
    const petType = sanitizePetType(row.pet_type)
    const stage = Number.isFinite(Number(row.stage)) ? Number(row.stage) : null
    const expectedConsumptionDays = normalizeExpectedConsumptionDays(row.expected_consumption_days)
    if (expectedConsumptionDays !== null) hasExpectedConsumptionConfig = true
    const meta: GrowthProductMeta = { pet_type: petType, stage, expected_consumption_days: expectedConsumptionDays }

    const productId = String(row.product_id || '').trim()
    if (productId) byId[productId] = meta

    const rawName = String(row.product_name || '').trim()
    const rawNameKey = normalizeForMatch(rawName)
    if (rawNameKey) byName[rawNameKey] = mergeProductMeta(byName[rawNameKey], meta)

    const canonicalName = normalizeMissionProductName(rawName)
    const canonicalNameKey = normalizeForMatch(canonicalName)
    if (canonicalNameKey) byName[canonicalNameKey] = mergeProductMeta(byName[canonicalNameKey], meta)
  }

  return { byId, byName, hasExpectedConsumptionConfig }
}

async function fetchRealPurchases(supabase: any): Promise<GrowthPurchaseRow[]> {
  const rows: GrowthPurchaseRow[] = []
  const includeSourceColumns = await supportsPurchaseSourceColumns(supabase)
  const baseColumns = 'purchase_id, customer_key, buyer_name, buyer_id, product_id, product_name, option_info, quantity, order_date, target_month, is_fake, needs_review, filter_ver'

  for (let from = 0; ; from += DB_FETCH_PAGE_SIZE) {
    let query = supabase
      .from('purchases')
      .select(purchaseSelectColumns(baseColumns, includeSourceColumns))
      .not('filter_ver', 'is', null)
      .eq('is_fake', false)
      .eq('needs_review', false)
      .order('order_date', { ascending: true })
      .order('purchase_id', { ascending: true })
      .range(from, from + DB_FETCH_PAGE_SIZE - 1)

    const { data, error } = await query
    if (error) throw error

    const chunk = (data || []) as any[]
    rows.push(...chunk.map((row) => ({
      purchase_id: String(row.purchase_id || ''),
      customer_key: String(row.customer_key || ''),
      buyer_name: String(row.buyer_name || ''),
      buyer_id: String(row.buyer_id || ''),
      product_id: String(row.product_id || ''),
      product_name: String(row.product_name || ''),
      option_info: String(row.option_info || ''),
      source_product_name: String(row.source_product_name || ''),
      source_option_info: String(row.source_option_info || ''),
      quantity: Number(row.quantity) || 1,
      order_date: String(row.order_date || ''),
      target_month: String(row.target_month || ''),
      is_fake: Boolean(row.is_fake),
      needs_review: Boolean(row.needs_review),
      filter_ver: row.filter_ver ? String(row.filter_ver) : null,
    })))

    if (chunk.length < DB_FETCH_PAGE_SIZE) break
  }

  return rows
}

export async function fetchGrowthInsights(supabase: any, month: string): Promise<GrowthInsightsResult> {
  const [{ byId, byName, hasExpectedConsumptionConfig }, rows] = await Promise.all([
    loadProductMeta(supabase),
    fetchRealPurchases(supabase),
  ])

  const scopeRows = month === 'all'
    ? rows
    : rows.filter((row) => row.target_month === month)

  const groupedAll = new Map<string, GrowthPurchaseRow[]>()
  for (const row of rows) {
    const key = customerGroupKey(row)
    if (!groupedAll.has(key)) groupedAll.set(key, [])
    groupedAll.get(key)!.push(row)
  }

  const grouped = new Map<string, GrowthPurchaseRow[]>()
  for (const row of scopeRows) {
    const key = customerGroupKey(row)
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(row)
  }

  const customers: GrowthCustomerInsight[] = []
  const recentTransitions: GrowthTransition[] = []
  const transitionCounts = new Map<string, number>([
    ['Entry->Growth', 0],
    ['Growth->Premium', 0],
    ['Premium->Core', 0],
  ])
  const productBuckets = new Map<CustomerStageCode, Map<string, GrowthTopProduct>>(
    STAGE_ORDER.map((stage) => [stage, new Map()]),
  )

  for (const [key, customerRows] of grouped.entries()) {
    const historyRows = groupedAll.get(key) || customerRows
    const latest = [...historyRows].sort((a, b) => parseOrderDate(b.order_date).getTime() - parseOrderDate(a.order_date).getTime())[0]
    if (!latest) continue

    const sortedDates = [...new Set(historyRows.map((row) => purchaseDateKey(row)).filter(Boolean))].sort()
    const purchaseCount = sortedDates.length
    const purchaseMonthCount = countDistinctPurchaseMonths(sortedDates)
    const recentPurchaseDayCount = countRecentPurchaseDays(sortedDates)
    const purchaseIntensity = computePurchaseIntensity(recentPurchaseDayCount)
    const firstOrder = sortedDates[0] || ''
    const lastOrder = sortedDates[sortedDates.length - 1] || String(latest.order_date || '').slice(0, 10)
    const petType = derivePetType(historyRows, byId, byName)
    const { finalStage, transitions } = buildStageJourney(sortedDates)
    const churn = computeChurnRisk(historyRows.map((row) => ({
      orderDate: row.order_date,
      expectedConsumptionDays: hasExpectedConsumptionConfig ? resolveExpectedConsumptionDays(row, byId, byName) : null,
    })))

    const customerTransitions = transitions.map((transition) => ({
      customerKey: key,
      name: latest.buyer_name || '-',
      id: latest.buyer_id || '-',
      date: transition.date,
      fromStage: transition.fromStage,
      toStage: transition.toStage,
      petType,
      purchaseCount,
    }))

    for (const transition of customerTransitions) {
      recentTransitions.push(transition)
      const transitionKey = `${transition.fromStage}->${transition.toStage}`
      transitionCounts.set(transitionKey, (transitionCounts.get(transitionKey) || 0) + 1)
    }

    customers.push({
      customerKey: key,
      name: latest.buyer_name || '-',
      id: latest.buyer_id || '-',
      petType,
      stage: finalStage,
      purchaseCount,
      purchaseMonthCount,
      recentPurchaseDayCount,
      purchaseIntensity,
      firstOrder,
      lastOrder,
      daysSinceLastOrder: churn.daysSinceLastOrder,
      churnRisk: churn.churnRisk,
      transitions: customerTransitions,
    })

    const productBucket = productBuckets.get(finalStage)
    if (productBucket) {
      for (const row of customerRows) {
        const quantityResult = computePurchaseQuantity(purchaseQuantityInput(row))
        const canonicalName = normalizeMissionProductName(String(row.product_name || '').trim()) || String(row.product_name || '').trim() || '-'
        const nameKey = normalizeForMatch(canonicalName)
        const meta = byId[String(row.product_id || '').trim()] || byName[nameKey]
        const pet = petLabel(meta?.pet_type || inferPetTypeFromName(row.product_name || ''))
        const stageLabel = productStageLabel(meta?.stage ?? null)

        for (const part of quantityResult.dashboardBreakdown) {
          const optionInfo = normalizeOptionInfo(part.optionLabel)
          const keyName = `${canonicalName}::${normalizeForMatch(optionInfo)}`
          if (!productBucket.has(keyName)) {
            productBucket.set(keyName, {
              name: canonicalName,
              optionInfo,
              pet,
              stage: stageLabel,
              count: 0,
            })
          }
          productBucket.get(keyName)!.count += part.count
        }
      }
    }
  }

  const summaries = STAGE_ORDER.map((stage) => {
    const stageCustomers = customers.filter((customer) => customer.stage === stage)
    const count = stageCustomers.length
    return {
      stage,
      label: customerStageLabel(stage),
      count,
      ratio: customers.length > 0 ? Math.round((count / customers.length) * 100) : 0,
      repeatCustomers: stageCustomers.filter((customer) => customer.purchaseCount >= 2).length,
      highIntensityCustomers: stageCustomers.filter((customer) => customer.purchaseIntensity === 'High' || customer.purchaseIntensity === 'VeryHigh').length,
      churnCustomers: stageCustomers.filter((customer) => customer.churnRisk).length,
      avgPurchaseCount: count > 0
        ? Math.round((stageCustomers.reduce((sum, customer) => sum + customer.purchaseCount, 0) / count) * 10) / 10
        : 0,
      avgRecentPurchaseDays: count > 0
        ? Math.round((stageCustomers.reduce((sum, customer) => sum + customer.recentPurchaseDayCount, 0) / count) * 10) / 10
        : 0,
    }
  })

  const transitions: GrowthTransitionSummary[] = [
    { key: 'Entry->Growth', label: '신규 → 성장', count: transitionCounts.get('Entry->Growth') || 0, fromStage: 'Entry', toStage: 'Growth' },
    { key: 'Growth->Premium', label: '성장 → 단골', count: transitionCounts.get('Growth->Premium') || 0, fromStage: 'Growth', toStage: 'Premium' },
    { key: 'Premium->Core', label: '단골 → 핵심', count: transitionCounts.get('Premium->Core') || 0, fromStage: 'Premium', toStage: 'Core' },
  ]

  const stageProducts = STAGE_ORDER.map((stage) => ({
    stage,
    label: customerStageLabel(stage),
    products: Array.from(productBuckets.get(stage)?.values() || [])
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  }))

  const candidates: GrowthStageCandidateGroup[] = [
    {
      stage: 'Entry',
      label: '성장 승급 후보',
      description: '구매월 수 2개월로 성장 단계(3개월) 직전인 고객입니다. 한 달만 더 재구매하면 단계가 올라갑니다.',
      customers: customers
        .filter((customer) => customer.stage === 'Entry' && customer.purchaseMonthCount === 2)
        .sort((a, b) => parseOrderDate(b.lastOrder).getTime() - parseOrderDate(a.lastOrder).getTime())
        .slice(0, 8)
        .map((customer) => ({
          customerKey: customer.customerKey,
          name: customer.name,
          id: customer.id,
          purchaseCount: customer.purchaseCount,
          purchaseMonthCount: customer.purchaseMonthCount,
          purchaseIntensity: customer.purchaseIntensity,
          lastOrder: customer.lastOrder,
          pet: petLabel(customer.petType),
        })),
    },
    {
      stage: 'Growth',
      label: '단골 승급 후보',
      description: '구매월 수 5개월로 단골 단계(6개월) 직전인 고객입니다. 한 달만 더 재구매하면 단계 전환됩니다.',
      customers: customers
        .filter((customer) => customer.stage === 'Growth' && customer.purchaseMonthCount === 5)
        .sort((a, b) => parseOrderDate(b.lastOrder).getTime() - parseOrderDate(a.lastOrder).getTime())
        .slice(0, 8)
        .map((customer) => ({
          customerKey: customer.customerKey,
          name: customer.name,
          id: customer.id,
          purchaseCount: customer.purchaseCount,
          purchaseMonthCount: customer.purchaseMonthCount,
          purchaseIntensity: customer.purchaseIntensity,
          lastOrder: customer.lastOrder,
          pet: petLabel(customer.petType),
        })),
    },
    {
      stage: 'Premium',
      label: '핵심 승급 후보',
      description: '구매월 수 11개월인 단골 고객입니다. 한 달만 더 재구매하면 핵심 단계로 올라갑니다.',
      customers: customers
        .filter((customer) => customer.stage === 'Premium' && customer.purchaseMonthCount === 11)
        .sort((a, b) => parseOrderDate(b.lastOrder).getTime() - parseOrderDate(a.lastOrder).getTime())
        .slice(0, 8)
        .map((customer) => ({
          customerKey: customer.customerKey,
          name: customer.name,
          id: customer.id,
          purchaseCount: customer.purchaseCount,
          purchaseMonthCount: customer.purchaseMonthCount,
          purchaseIntensity: customer.purchaseIntensity,
          lastOrder: customer.lastOrder,
          pet: petLabel(customer.petType),
        })),
    },
  ]

  return {
    summaries,
    transitions,
    recentTransitions: recentTransitions
      .sort((a, b) => parseOrderDate(b.date).getTime() - parseOrderDate(a.date).getTime())
      .slice(0, 12),
    stageProducts,
    candidates,
    customers: customers.sort((a, b) => parseOrderDate(b.lastOrder).getTime() - parseOrderDate(a.lastOrder).getTime()),
    totalCustomers: customers.length,
    realPurchases: scopeRows.length,
  }
}

export function growthStageBadgeVariant(stage: CustomerStageCode): 'primary' | 'info' | 'warning' | 'success' | 'neutral' {
  if (stage === 'Entry') return 'neutral'
  if (stage === 'Growth') return 'primary'
  if (stage === 'Premium') return 'info'
  if (stage === 'Core') return 'success'
  return 'neutral'
}

export function formatGrowthCount(value: number): string {
  return formatQuantityCount(value)
}
