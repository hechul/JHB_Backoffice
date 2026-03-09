import { computePurchaseQuantity, formatQuantityCount } from '~/composables/usePurchaseQuantity'
import { customerStageLabel, progressiveCustomerStage, productStageLabel, type CustomerStageCode } from '~/composables/useGrowthStage'
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
  lastOrder: string
  daysSinceLastOrder: number
  transitions: GrowthTransition[]
}

export interface GrowthStageSummary {
  stage: CustomerStageCode
  label: string
  count: number
  ratio: number
  repeatCustomers: number
  churnCustomers: number
  avgPurchaseCount: number
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
const STAGE_ORDER: CustomerStageCode[] = ['Entry', 'Growth', 'Core', 'Premium']

function parseOrderDate(value: string): Date {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? new Date('1970-01-01') : d
}

function daysFromNow(dateStr: string): number {
  const ms = Date.now() - parseOrderDate(dateStr).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
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

function buildStageJourney(rows: GrowthPurchaseRow[], metaById: Record<string, GrowthProductMeta>, metaByName: Record<string, GrowthProductMeta>) {
  const stageByDate = new Map<string, number | null>()

  for (const row of rows) {
    const idKey = String(row.product_id || '').trim()
    const metaByProductId = idKey ? metaById[idKey] : null
    const nameKey = normalizeForMatch(normalizeMissionProductName(row.product_name || ''))
    const metaByProductName = nameKey ? metaByName[nameKey] : null
    const stage = metaByProductId?.stage ?? metaByProductName?.stage ?? null
    const dateKey = purchaseDateKey(row) || String(row.order_date || '').trim() || '1970-01-01'
    const prevStage = stageByDate.get(dateKey)
    stageByDate.set(dateKey, Math.max(prevStage || 0, stage || 0) || null)
  }

  const orderedEvents = Array.from(stageByDate.entries())
    .sort((a, b) => parseOrderDate(a[0]).getTime() - parseOrderDate(b[0]).getTime())
    .map(([date, stage]) => ({ date, stage }))

  const orderedStages = orderedEvents.map((event) => event.stage)
  const finalStage = progressiveCustomerStage(orderedStages)

  let currentStage = 1
  let hasPurchase = false
  const transitions: Array<{ date: string; fromStage: CustomerStageCode; toStage: CustomerStageCode }> = []

  for (const event of orderedEvents) {
    const observedStage = Number.isFinite(Number(event.stage)) ? Number(event.stage) : null

    if (!hasPurchase) {
      hasPurchase = true
      currentStage = 1
      continue
    }

    if (currentStage === 1 && observedStage !== null && observedStage >= 2) {
      transitions.push({ date: event.date, fromStage: 'Entry', toStage: 'Growth' })
      currentStage = 2
      continue
    }

    if (currentStage === 2 && observedStage !== null && observedStage >= 3) {
      transitions.push({ date: event.date, fromStage: 'Growth', toStage: 'Core' })
      currentStage = 3
      continue
    }

    if (currentStage === 3 && observedStage !== null && observedStage >= 4) {
      transitions.push({ date: event.date, fromStage: 'Core', toStage: 'Premium' })
      currentStage = 4
    }
  }

  return {
    finalStage,
    transitions,
  }
}

async function loadProductMeta(supabase: any) {
  const { data, error } = await supabase
    .from('products')
    .select('product_id, product_name, pet_type, stage')
    .is('deleted_at', null)

  if (error) throw error

  const byId: Record<string, GrowthProductMeta> = {}
  const byName: Record<string, GrowthProductMeta> = {}

  for (const row of (data || []) as any[]) {
    const petType = sanitizePetType(row.pet_type)
    const stage = Number.isFinite(Number(row.stage)) ? Number(row.stage) : null
    const meta: GrowthProductMeta = { pet_type: petType, stage }

    const productId = String(row.product_id || '').trim()
    if (productId) byId[productId] = meta

    const rawName = String(row.product_name || '').trim()
    const rawNameKey = normalizeForMatch(rawName)
    if (rawNameKey) byName[rawNameKey] = mergeProductMeta(byName[rawNameKey], meta)

    const canonicalName = normalizeMissionProductName(rawName)
    const canonicalNameKey = normalizeForMatch(canonicalName)
    if (canonicalNameKey) byName[canonicalNameKey] = mergeProductMeta(byName[canonicalNameKey], meta)
  }

  return { byId, byName }
}

async function fetchRealPurchases(supabase: any, month: string): Promise<GrowthPurchaseRow[]> {
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

    if (month !== 'all') query = query.eq('target_month', month)

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
  const [{ byId, byName }, rows] = await Promise.all([
    loadProductMeta(supabase),
    fetchRealPurchases(supabase, month),
  ])

  const grouped = new Map<string, GrowthPurchaseRow[]>()
  for (const row of rows) {
    const key = customerGroupKey(row)
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(row)
  }

  const customers: GrowthCustomerInsight[] = []
  const recentTransitions: GrowthTransition[] = []
  const transitionCounts = new Map<string, number>([
    ['Entry->Growth', 0],
    ['Growth->Core', 0],
    ['Core->Premium', 0],
  ])
  const productBuckets = new Map<CustomerStageCode, Map<string, GrowthTopProduct>>(
    STAGE_ORDER.map((stage) => [stage, new Map()]),
  )

  for (const [key, customerRows] of grouped.entries()) {
    const sortedRows = [...customerRows].sort((a, b) => parseOrderDate(a.order_date).getTime() - parseOrderDate(b.order_date).getTime())
    const latest = [...customerRows].sort((a, b) => parseOrderDate(b.order_date).getTime() - parseOrderDate(a.order_date).getTime())[0]
    if (!latest) continue

    const purchaseCount = new Set(customerRows.map((row) => purchaseDateKey(row)).filter(Boolean)).size
    const lastOrder = String(latest.order_date || '').slice(0, 10)
    const petType = derivePetType(customerRows, byId, byName)
    const { finalStage, transitions } = buildStageJourney(sortedRows, byId, byName)

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
      lastOrder,
      daysSinceLastOrder: daysFromNow(lastOrder),
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
      churnCustomers: stageCustomers.filter((customer) => customer.daysSinceLastOrder > 90).length,
      avgPurchaseCount: count > 0
        ? Math.round((stageCustomers.reduce((sum, customer) => sum + customer.purchaseCount, 0) / count) * 10) / 10
        : 0,
    }
  })

  const transitions: GrowthTransitionSummary[] = [
    { key: 'Entry->Growth', label: '입문 → 성장', count: transitionCounts.get('Entry->Growth') || 0, fromStage: 'Entry', toStage: 'Growth' },
    { key: 'Growth->Core', label: '성장 → 핵심', count: transitionCounts.get('Growth->Core') || 0, fromStage: 'Growth', toStage: 'Core' },
    { key: 'Core->Premium', label: '핵심 → 프리미엄', count: transitionCounts.get('Core->Premium') || 0, fromStage: 'Core', toStage: 'Premium' },
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
      description: '입문 단계에 머물러 있지만 반복 구매가 있어 다음 단계 전환 가능성이 높은 고객입니다.',
      customers: customers
        .filter((customer) => customer.stage === 'Entry' && customer.purchaseCount >= 2)
        .sort((a, b) => b.purchaseCount - a.purchaseCount || parseOrderDate(b.lastOrder).getTime() - parseOrderDate(a.lastOrder).getTime())
        .slice(0, 8)
        .map((customer) => ({
          customerKey: customer.customerKey,
          name: customer.name,
          id: customer.id,
          purchaseCount: customer.purchaseCount,
          lastOrder: customer.lastOrder,
          pet: petLabel(customer.petType),
        })),
    },
    {
      stage: 'Growth',
      label: '핵심 승급 후보',
      description: '성장 단계 고객 중 재구매가 누적된 고객입니다. 핵심 상품 제안 대상으로 볼 수 있습니다.',
      customers: customers
        .filter((customer) => customer.stage === 'Growth' && customer.purchaseCount >= 2)
        .sort((a, b) => b.purchaseCount - a.purchaseCount || parseOrderDate(b.lastOrder).getTime() - parseOrderDate(a.lastOrder).getTime())
        .slice(0, 8)
        .map((customer) => ({
          customerKey: customer.customerKey,
          name: customer.name,
          id: customer.id,
          purchaseCount: customer.purchaseCount,
          lastOrder: customer.lastOrder,
          pet: petLabel(customer.petType),
        })),
    },
    {
      stage: 'Core',
      label: '프리미엄 승급 후보',
      description: '핵심 단계에서 반복 구매 중인 고객입니다. 프리미엄 상품이 정의되면 바로 확장 대상입니다.',
      customers: customers
        .filter((customer) => customer.stage === 'Core' && customer.purchaseCount >= 2)
        .sort((a, b) => b.purchaseCount - a.purchaseCount || parseOrderDate(b.lastOrder).getTime() - parseOrderDate(a.lastOrder).getTime())
        .slice(0, 8)
        .map((customer) => ({
          customerKey: customer.customerKey,
          name: customer.name,
          id: customer.id,
          purchaseCount: customer.purchaseCount,
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
    realPurchases: rows.length,
  }
}

export function growthStageBadgeVariant(stage: CustomerStageCode): 'primary' | 'info' | 'warning' | 'success' | 'neutral' {
  if (stage === 'Entry') return 'neutral'
  if (stage === 'Growth') return 'primary'
  if (stage === 'Core') return 'info'
  if (stage === 'Premium') return 'success'
  return 'neutral'
}

export function formatGrowthCount(value: number): string {
  return formatQuantityCount(value)
}
