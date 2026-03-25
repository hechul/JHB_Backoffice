import {
  buildProductLookup,
  resolveMappedProduct,
  type ProductCatalogItem,
  type ProductLookup,
} from '../../../shared/productCatalog.ts'
import { resolveCommerceSourceProduct } from '../../../app/composables/useCommerceProductCatalog.ts'
import {
  buildCommerceProductMappingLookup,
  resolveCommerceProductMapping,
  type CommerceProductMappingLookup,
  type CommerceProductMappingRow,
} from './mapping.ts'
import { normalizeCommerceChannel, normalizeSourceAccountKey } from './channel.ts'
import { isEligibleCommerceOrderLine } from './order-eligibility.ts'

export interface NaverSyncWindow {
  windowFrom: string
  windowTo: string
}

export interface NaverChangedStatusItem {
  orderId?: string | null
  productOrderId: string
  lastChangedType?: string | null
  paymentDate?: string | null
  lastChangedDate?: string | null
  productOrderStatus?: string | null
  claimType?: string | null
  claimStatus?: string | null
  receiverAddressChanged?: boolean | null
  giftReceivingStatus?: string | null
}

export interface NaverChangedStatusPagination {
  moreFrom: string | null
  moreSequence: string | null
}

export interface NaverOrderInfo {
  order?: Record<string, any> | null
  productOrder?: Record<string, any> | null
  delivery?: Record<string, any> | null
  cancel?: Record<string, any> | null
  return?: Record<string, any> | null
  exchange?: Record<string, any> | null
  completedClaims?: Record<string, any>[] | null
}

export interface CommerceOrderEventRawRow {
  source_channel: string
  source_account_key: string
  run_id: string
  window_id: number | null
  source_order_id: string | null
  source_line_id: string
  event_type: string
  event_at: string
  order_status: string | null
  payment_date: string | null
  extra_flags: Record<string, any> | null
  raw_json: Record<string, any>
}

export interface CommerceOrderLineRawRow {
  source_channel: string
  source_account_key: string
  source_line_id: string
  source_order_id: string | null
  source_product_id: string | null
  source_option_code: string | null
  product_name: string
  product_option: string | null
  buyer_id: string | null
  buyer_name: string | null
  receiver_name: string | null
  receiver_phone_masked: string | null
  receiver_base_address: string | null
  receiver_detail_address: string | null
  quantity: number
  product_order_status: string | null
  claim_status: string | null
  order_date: string | null
  payment_date: string | null
  decision_date: string | null
  invoice_number: string | null
  last_event_type: string | null
  last_event_at: string | null
  raw_json: Record<string, any>
}

export interface PurchaseProjectionRow {
  purchase_id: string
  upload_batch_id: string
  target_month: string
  buyer_id: string
  buyer_name: string
  receiver_name: string | null
  customer_key: string
  product_id: string
  product_name: string
  option_info: string
  source_product_name: string
  source_option_info: string
  source_channel: string
  source_account_key: string
  source_order_id: string | null
  source_product_id: string | null
  source_option_code: string | null
  source_last_changed_at: string | null
  source_sync_run_id: string
  quantity: number
  order_date: string
  order_status: string
  claim_status: string | null
  delivery_type: string | null
  is_fake: boolean
  match_reason: string | null
  match_rank: number | null
  matched_exp_id: number | null
  needs_review: boolean
  is_manual: boolean
  filter_ver: string | null
  quantity_warning: boolean
}

export interface ResolvedNaverSyncRecord {
  rawLine: CommerceOrderLineRawRow
  purchase: PurchaseProjectionRow | null
  eligible: boolean
  eligibilityReason: string
  needsReview: boolean
  mappingReason: string | null
}

const NAVER_IMPORT_FILTER_VER = 'api_import_v1'

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0')
}

function normalizeText(value?: string | null): string {
  return String(value || '').trim()
}

function toNullableString(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  return normalized.length > 0 ? normalized : null
}

function toPositiveInteger(value: unknown, fallback = 1): number {
  const normalized = Number.parseInt(String(value ?? fallback), 10)
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback
}

export function parseNaverSyncDateTime(value: string, edge: 'start' | 'end' = 'start'): Date {
  const trimmed = String(value || '').trim()
  if (!trimmed) {
    throw new Error('Date-time input is required')
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const suffix = edge === 'start' ? 'T00:00:00.000+09:00' : 'T23:59:59.999+09:00'
    return new Date(`${trimmed}${suffix}`)
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(trimmed)) {
    return new Date(`${trimmed}+09:00`)
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Unsupported date-time input: ${value}`)
  }
  return parsed
}

export function formatNaverDateTime(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error('Invalid date for Naver date-time formatting')
  }

  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}T${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}:${pad(kst.getUTCSeconds())}.${pad(kst.getUTCMilliseconds(), 3)}+09:00`
}

export function splitNaverSyncWindows(
  requestedFrom: Date,
  requestedTo: Date,
  maxHours = 24,
): NaverSyncWindow[] {
  if (requestedTo.getTime() < requestedFrom.getTime()) {
    throw new Error('requestedTo must be greater than or equal to requestedFrom')
  }

  const maxWindowMs = maxHours * 60 * 60 * 1000
  const windows: NaverSyncWindow[] = []
  let cursorMs = requestedFrom.getTime()
  const endMs = requestedTo.getTime()

  while (cursorMs <= endMs) {
    const nextMs = Math.min(cursorMs + maxWindowMs - 1, endMs)
    windows.push({
      windowFrom: formatNaverDateTime(new Date(cursorMs)),
      windowTo: formatNaverDateTime(new Date(nextMs)),
    })
    cursorMs = nextMs + 1
  }

  return windows
}

export function extractNaverChangedStatusItems(payload: Record<string, any>): NaverChangedStatusItem[] {
  const candidates = [
    payload?.data?.lastChangeStatuses,
    payload?.data?.data,
    payload?.data,
    payload?.lastChangeStatuses,
  ]
  const list = candidates.find((value) => Array.isArray(value))
  return Array.isArray(list) ? list.filter(Boolean) : []
}

export function extractNaverChangedStatusPagination(
  payload: Record<string, any>,
): NaverChangedStatusPagination {
  const more = payload?.data?.more || payload?.more || null
  return {
    moreFrom: toNullableString(more?.moreFrom),
    moreSequence: toNullableString(more?.moreSequence),
  }
}

export function extractNaverProductOrderInfos(payload: Record<string, any>): NaverOrderInfo[] {
  const candidates = [
    payload?.data,
    payload?.data?.productOrders,
    payload?.productOrders,
  ]
  const list = candidates.find((value) => Array.isArray(value))
  return Array.isArray(list) ? list.filter(Boolean) : []
}

export function buildChangedStatusEventRow(input: {
  item: NaverChangedStatusItem
  runId: string
  windowId?: number | null
  sourceChannel?: string
  sourceAccountKey?: string | null
}): CommerceOrderEventRawRow {
  const sourceChannel = normalizeCommerceChannel(input.sourceChannel)
  const sourceAccountKey = normalizeSourceAccountKey(input.sourceAccountKey)
  const sourceLineId = normalizeText(input.item.productOrderId)
  if (!sourceLineId) {
    throw new Error('productOrderId is required for raw event rows')
  }

  const eventAt = toNullableString(input.item.lastChangedDate)
  const eventType = toNullableString(input.item.lastChangedType)
  if (!eventAt || !eventType) {
    throw new Error(`lastChangedDate and lastChangedType are required for ${sourceLineId}`)
  }

  return {
    source_channel: sourceChannel,
    source_account_key: sourceAccountKey,
    run_id: input.runId,
    window_id: input.windowId ?? null,
    source_order_id: toNullableString(input.item.orderId),
    source_line_id: sourceLineId,
    event_type: eventType,
    event_at: eventAt,
    order_status: toNullableString(input.item.productOrderStatus),
    payment_date: toNullableString(input.item.paymentDate),
    extra_flags: {
      claimType: toNullableString(input.item.claimType),
      claimStatus: toNullableString(input.item.claimStatus),
      receiverAddressChanged: Boolean(input.item.receiverAddressChanged),
      giftReceivingStatus: toNullableString(input.item.giftReceivingStatus),
    },
    raw_json: input.item as Record<string, any>,
  }
}

function pickOrderDate(order: Record<string, any> | null | undefined, productOrder: Record<string, any> | null | undefined, fallbackChangedAt?: string | null): string | null {
  return (
    toNullableString(order?.orderDate)
    || toNullableString(productOrder?.placeOrderDate)
    || toNullableString(order?.paymentDate)
    || toNullableString(fallbackChangedAt)
  )
}

function toDateOnly(value?: string | null): string | null {
  const normalized = toNullableString(value)
  if (!normalized) return null
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})/)
  if (match) return match[1]

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return null
  return `${parsed.getUTCFullYear()}-${pad(parsed.getUTCMonth() + 1)}-${pad(parsed.getUTCDate())}`
}

function toTargetMonth(value?: string | null): string | null {
  const dateOnly = toDateOnly(value)
  return dateOnly ? dateOnly.slice(0, 7) : null
}

function buildCustomerKey(buyerId: string, buyerName: string): string {
  return `${buyerId}_${buyerName}`
}

function resolveProjectedOptionInfo(input: {
  mappingDecision?: { canonicalVariant: string | null } | null
  resolvedProduct: { normalizedOption: string }
  rawLine: { product_option: string | null }
}): string {
  // Keep raw source_option_info for auditing, but persist the mapped canonical variant
  // when we have one so synced purchases behave like the main Excel-import flow.
  return input.mappingDecision?.canonicalVariant
    || input.resolvedProduct.normalizedOption
    || input.rawLine.product_option
    || ''
}

export function buildNaverRawLineRow(input: {
  orderInfo: NaverOrderInfo
  latestEvent?: NaverChangedStatusItem | null
  sourceChannel?: string
  sourceAccountKey?: string | null
}): CommerceOrderLineRawRow {
  const sourceChannel = normalizeCommerceChannel(input.sourceChannel)
  const sourceAccountKey = normalizeSourceAccountKey(input.sourceAccountKey)
  const order = input.orderInfo.order || {}
  const productOrder = input.orderInfo.productOrder || {}
  const delivery = input.orderInfo.delivery || {}
  const shippingAddress = productOrder.shippingAddress || {}

  const sourceLineId = normalizeText(productOrder.productOrderId)
  if (!sourceLineId) {
    throw new Error('productOrder.productOrderId is required')
  }

  const lastEventType = toNullableString(input.latestEvent?.lastChangedType)
  const lastEventAt = toNullableString(input.latestEvent?.lastChangedDate)

  return {
    source_channel: sourceChannel,
    source_account_key: sourceAccountKey,
    source_line_id: sourceLineId,
    source_order_id: toNullableString(order.orderId),
    source_product_id: toNullableString(productOrder.productId),
    source_option_code: toNullableString(productOrder.optionCode) || toNullableString(productOrder.optionManageCode),
    product_name: normalizeText(productOrder.productName) || '-',
    product_option: toNullableString(productOrder.productOption),
    buyer_id: toNullableString(order.ordererId) || toNullableString(order.ordererNo),
    buyer_name: toNullableString(order.ordererName),
    receiver_name: toNullableString(shippingAddress.name),
    receiver_phone_masked: toNullableString(shippingAddress.tel1) || toNullableString(shippingAddress.tel2),
    receiver_base_address: toNullableString(shippingAddress.baseAddress),
    receiver_detail_address: toNullableString(shippingAddress.detailedAddress),
    quantity: toPositiveInteger(productOrder.quantity, 1),
    product_order_status: toNullableString(productOrder.productOrderStatus),
    claim_status: toNullableString(productOrder.claimStatus),
    order_date: pickOrderDate(order, productOrder, lastEventAt),
    payment_date: toNullableString(order.paymentDate),
    decision_date: toNullableString(productOrder.decisionDate),
    invoice_number: toNullableString(delivery.trackingNumber),
    last_event_type: lastEventType,
    last_event_at: lastEventAt,
    raw_json: input.orderInfo as Record<string, any>,
  }
}

export function resolveNaverSyncRecord(input: {
  orderInfo: NaverOrderInfo
  latestEvent?: NaverChangedStatusItem | null
  productLookup: ProductLookup
  productMappingLookup?: CommerceProductMappingLookup | null
  runId: string
  sourceChannel?: string
  sourceAccountKey?: string | null
}): ResolvedNaverSyncRecord {
  const rawLine = buildNaverRawLineRow(input)
  const eligibility = isEligibleCommerceOrderLine({
    orderStatus: rawLine.product_order_status,
    claimStatus: rawLine.claim_status,
  })

  if (!eligibility.eligible) {
    return {
      rawLine,
      purchase: null,
      eligible: false,
      eligibilityReason: eligibility.reason,
      needsReview: false,
      mappingReason: null,
    }
  }

  const sourceProductMatch = resolveCommerceSourceProduct({
    sourceProductId: rawLine.source_product_id,
    productName: rawLine.product_name,
    optionInfo: rawLine.product_option,
  })

  const mappingDecision = input.productMappingLookup
    ? resolveCommerceProductMapping({
        lookup: input.productMappingLookup,
        sourceAccountKey: rawLine.source_account_key,
        commerceProductId: rawLine.source_product_id,
        commerceOptionCode: rawLine.source_option_code,
        productName: rawLine.product_name,
        optionInfo: rawLine.product_option,
        canonicalOptionInfo: sourceProductMatch?.canonicalOptionInfo ?? rawLine.product_option,
      })
    : null

  const resolvedProduct = resolveMappedProduct(
    sourceProductMatch?.canonicalProductName || rawLine.product_name,
    sourceProductMatch?.canonicalOptionInfo ?? rawLine.product_option ?? '',
    input.productLookup,
  )

  const orderDate = toDateOnly(rawLine.order_date) || toDateOnly(rawLine.payment_date) || toDateOnly(rawLine.last_event_at)
  if (!orderDate) {
    throw new Error(`Unable to resolve order_date for ${rawLine.source_line_id}`)
  }

  const targetMonth = toTargetMonth(orderDate)
  if (!targetMonth) {
    throw new Error(`Unable to resolve target_month for ${rawLine.source_line_id}`)
  }

  const internalProductId = mappingDecision?.internalProductId || resolvedProduct.mappedProductId || null
  const projectedOptionInfo = resolveProjectedOptionInfo({
    mappingDecision,
    resolvedProduct,
    rawLine,
  })
  const buyerId = rawLine.buyer_id || ''
  const buyerName = rawLine.buyer_name || ''
  const needsReview = Boolean(sourceProductMatch?.needsReview)
    || Boolean(mappingDecision?.needsReview)
    || !internalProductId

  if (!internalProductId) {
    return {
      rawLine,
      purchase: null,
      eligible: true,
      eligibilityReason: eligibility.reason,
      needsReview: true,
      mappingReason: mappingDecision?.reason || 'internal product mapping not resolved',
    }
  }

  return {
    rawLine,
    purchase: {
      purchase_id: rawLine.source_line_id,
      upload_batch_id: input.runId,
      target_month: targetMonth,
      buyer_id: buyerId,
      buyer_name: buyerName,
      receiver_name: rawLine.receiver_name,
      customer_key: buildCustomerKey(buyerId, buyerName),
      product_id: internalProductId,
      product_name: resolvedProduct.normalizedName || rawLine.product_name,
      option_info: projectedOptionInfo,
      source_product_name: rawLine.product_name,
      source_option_info: rawLine.product_option || '',
      source_channel: rawLine.source_channel,
      source_account_key: rawLine.source_account_key,
      source_order_id: rawLine.source_order_id,
      source_product_id: rawLine.source_product_id,
      source_option_code: rawLine.source_option_code,
      source_last_changed_at: rawLine.last_event_at,
      source_sync_run_id: input.runId,
      quantity: rawLine.quantity,
      order_date: orderDate,
      order_status: rawLine.product_order_status || 'UNKNOWN',
      claim_status: rawLine.claim_status,
      delivery_type: toNullableString(input.orderInfo.delivery?.deliveryMethod)
        || toNullableString(input.orderInfo.productOrder?.expectedDeliveryMethod),
      is_fake: false,
      match_reason: null,
      match_rank: null,
      matched_exp_id: null,
      needs_review: needsReview,
      is_manual: false,
      filter_ver: NAVER_IMPORT_FILTER_VER,
      quantity_warning: rawLine.quantity >= 2,
    },
    eligible: true,
    eligibilityReason: eligibility.reason,
    needsReview,
    mappingReason: mappingDecision?.reason || null,
  }
}

export function buildProductLookupFromRows(rows: ProductCatalogItem[]): ProductLookup {
  return buildProductLookup(rows)
}

export function buildCommerceProductMappingLookupFromRows(
  rows: CommerceProductMappingRow[],
): CommerceProductMappingLookup {
  return buildCommerceProductMappingLookup(rows)
}
