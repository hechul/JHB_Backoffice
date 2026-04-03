// =====================================================================
// coupang-sync.ts
// 역할: 쿠팡 주문/상품 데이터를 내부 공통 포맷으로 정규화할 때 쓰는 기본 헬퍼
// 왜 필요: 쿠팡은 판매자배송(marketplace)과 로켓그로스(rocket_growth)가
//          서로 다른 source_line_id 규칙을 가져야 하므로, 이 기준을 먼저 코드로 고정한다.
//          1차 구현에서는 purchases projection보다 raw line 적재가 우선이므로,
//          이 파일이 주문 응답 -> commerce_order_lines_raw shape 변환 기준점이 된다.
// 사용처: sync-coupang-orders.mjs, 향후 coupang sync API route, unit tests
// =====================================================================

import {
  buildProductLookup,
  resolveMappedProduct,
  type ProductCatalogItem,
  type ProductLookup,
} from '../../../shared/productCatalog.ts'
import {
  buildCommerceProductMappingLookup,
  resolveCommerceProductMapping,
  type CommerceProductMappingLookup,
  type CommerceProductMappingRow,
} from './mapping.ts'
import type { CommerceFulfillmentType, CommerceOrderEligibility } from './types.ts'
import { normalizeSourceAccountKey } from './channel.ts'

export const COUPANG_SOURCE_CHANNEL = 'coupang' as const
export const COUPANG_MARKETPLACE_FULFILLMENT_TYPE = 'marketplace' as const
export const COUPANG_ROCKET_GROWTH_FULFILLMENT_TYPE = 'rocket_growth' as const

export interface CoupangMarketplaceSourceIdentityInput {
  shipmentBoxId?: string | number | null
  vendorItemId?: string | number | null
  itemIndex?: number | null
}

export interface CoupangRocketGrowthSourceIdentityInput {
  orderId?: string | number | null
  vendorItemId?: string | number | null
  itemIndex?: number | null
}

export interface CoupangSourceLineIdInput {
  sourceFulfillmentType: CommerceFulfillmentType
  orderId?: string | number | null
  shipmentBoxId?: string | number | null
  vendorItemId?: string | number | null
  itemIndex?: number | null
}

export interface CoupangOrderLineRawRow {
  source_channel: typeof COUPANG_SOURCE_CHANNEL
  source_fulfillment_type: typeof COUPANG_MARKETPLACE_FULFILLMENT_TYPE | typeof COUPANG_ROCKET_GROWTH_FULFILLMENT_TYPE
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

export interface CoupangPurchaseProjectionRow {
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
  source_channel: typeof COUPANG_SOURCE_CHANNEL
  source_fulfillment_type: typeof COUPANG_MARKETPLACE_FULFILLMENT_TYPE | typeof COUPANG_ROCKET_GROWTH_FULFILLMENT_TYPE
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

export interface ResolvedCoupangSyncRecord {
  rawLine: CoupangOrderLineRawRow
  purchase: CoupangPurchaseProjectionRow | null
  eligible: boolean
  eligibilityReason: string
  needsReview: boolean
  mappingReason: string | null
}

export interface CoupangMarketplaceOrderItem {
  vendorItemId?: string | number | null
  productId?: string | number | null
  vendorItemName?: string | null
  sellerProductId?: string | number | null
  sellerProductName?: string | null
  sellerProductItemName?: string | null
  shippingCount?: number | string | null
  invoiceNumber?: string | null
  confirmDate?: string | null
}

export interface CoupangMarketplaceOrder {
  orderId?: string | number | null
  shipmentBoxId?: string | number | null
  orderedAt?: string | null
  paidAt?: string | null
  status?: string | null
  invoiceNumber?: string | null
  confirmDate?: string | null
  orderer?: {
    name?: string | null
    safeNumber?: string | null
  } | null
  receiver?: {
    name?: string | null
    safeNumber?: string | null
    addr1?: string | null
    addr2?: string | null
  } | null
  orderItems?: CoupangMarketplaceOrderItem[] | null
}

export interface CoupangRocketGrowthOrderItem {
  vendorItemId?: string | number | null
  productName?: string | null
  salesQuantity?: number | string | null
  unitSalesPrice?: number | string | null
  currency?: string | null
}

export interface CoupangRocketGrowthOrder {
  orderId?: string | number | null
  vendorId?: string | null
  paidAt?: string | number | null
  orderItems?: CoupangRocketGrowthOrderItem[] | null
}

const COUPANG_IMPORT_FILTER_VER = 'api_import_v1'
const INCLUDED_MARKETPLACE_ORDER_STATUSES = new Set([
  'ACCEPT',
  'INSTRUCT',
  'DEPARTURE',
  'DELIVERING',
  'FINAL_DELIVERY',
  'NONE_TRACKING',
])
const EXCLUDED_MARKETPLACE_ORDER_STATUSES = new Set([
  'CANCEL',
  'CANCELED',
  'CANCELLED',
  'RETURN',
  'RETURNED',
  'EXCHANGE',
])
const EXCLUDED_CLAIM_KEYWORDS = ['cancel', 'return', 'exchange']
const INCLUDED_CLAIM_KEYWORDS = ['reject', 'withdraw']

function normalizeRequiredId(value: string | number | null | undefined, fieldName: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) {
    throw new Error(`${fieldName} is required`)
  }
  return normalized
}

function normalizeOptionalId(value: string | number | null | undefined): string | null {
  const normalized = String(value ?? '').trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeItemIndex(value?: number | null): number {
  if (value == null) return 0
  const normalized = Number.parseInt(String(value), 10)
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error('itemIndex must be a non-negative integer')
  }
  return normalized
}

function normalizeText(value?: string | number | null): string {
  return String(value ?? '').trim()
}

function toNullableString(value?: string | number | null): string | null {
  const normalized = normalizeText(value)
  return normalized.length > 0 ? normalized : null
}

function toPositiveInteger(value?: string | number | null, fallback = 1): number {
  const normalized = Number.parseInt(String(value ?? fallback), 10)
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback
}

function toIsoDateTimeString(value?: string | number | null): string | null {
  if (value == null) return null
  const normalized = normalizeText(value)
  if (!normalized) return null

  if (/^\d{13}$/.test(normalized)) {
    const parsed = new Date(Number(normalized))
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

function normalizeCode(value?: string | null): string {
  return String(value ?? '').trim().toUpperCase()
}

function normalizeIdentityText(value?: string | null): string {
  return String(value ?? '')
    .trim()
    .replace(/[|:]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function buildCustomerKey(buyerId: string, buyerName: string): string {
  return `${buyerId}_${buyerName}`
}

function toDateOnly(value?: string | null): string | null {
  const iso = toIsoDateTimeString(value)
  if (!iso) return null
  return iso.slice(0, 10)
}

function toTargetMonth(value?: string | null): string | null {
  const normalized = String(value ?? '').trim()
  const match = normalized.match(/^(\d{4}-\d{2})/)
  return match?.[1] || null
}

function resolveProjectedOptionInfo(input: {
  mappingDecision?: { canonicalVariant?: string | null } | null
  resolvedProduct?: { normalizedOption?: string | null } | null
  rawLine: CoupangOrderLineRawRow
}): string {
  return (
    String(input.mappingDecision?.canonicalVariant || '').trim()
    || String(input.resolvedProduct?.normalizedOption || '').trim()
    || String(input.rawLine.product_option || '').trim()
  )
}

function buildCoupangCustomerIdentity(rawLine: CoupangOrderLineRawRow): {
  buyerId: string
  buyerName: string
} {
  const scopePrefix = `coupang:${rawLine.source_fulfillment_type}:${rawLine.source_account_key}`

  if (rawLine.source_fulfillment_type === COUPANG_MARKETPLACE_FULFILLMENT_TYPE) {
    const identityParts = [
      normalizeIdentityText(rawLine.receiver_name || rawLine.buyer_name),
      normalizeIdentityText(rawLine.receiver_phone_masked),
      normalizeIdentityText(rawLine.receiver_base_address),
      normalizeIdentityText(rawLine.receiver_detail_address),
    ].filter(Boolean)

    const identityToken = identityParts.join('|')
      || normalizeIdentityText(rawLine.source_order_id)
      || normalizeIdentityText(rawLine.source_line_id)

    const buyerName = String(rawLine.buyer_name || rawLine.receiver_name || '쿠팡 구매자').trim()
    return {
      buyerId: `${scopePrefix}:${identityToken || 'unknown'}`,
      buyerName,
    }
  }

  return {
    buyerId: `${scopePrefix}:order:${normalizeIdentityText(rawLine.source_order_id || rawLine.source_line_id) || 'unknown'}`,
    buyerName: String(rawLine.buyer_name || rawLine.receiver_name || '로켓그로스 구매자').trim(),
  }
}

export function isEligibleCoupangOrderLine(input: {
  sourceFulfillmentType: CommerceFulfillmentType
  orderStatus?: string | null
  claimStatus?: string | null
}): CommerceOrderEligibility {
  const orderStatus = normalizeCode(input.orderStatus)
  const claimStatus = normalizeCode(input.claimStatus)
  const normalizedClaim = claimStatus.toLowerCase()

  if (
    claimStatus
    && INCLUDED_CLAIM_KEYWORDS.some((keyword) => normalizedClaim.includes(keyword))
  ) {
    return { eligible: true, reason: `included claim status: ${claimStatus}` }
  }

  if (
    claimStatus
    && EXCLUDED_CLAIM_KEYWORDS.some((keyword) => normalizedClaim.includes(keyword))
  ) {
    return { eligible: false, reason: `excluded claim status: ${claimStatus}` }
  }

  if (input.sourceFulfillmentType === COUPANG_MARKETPLACE_FULFILLMENT_TYPE) {
    if (EXCLUDED_MARKETPLACE_ORDER_STATUSES.has(orderStatus)) {
      return { eligible: false, reason: `excluded order status: ${orderStatus}` }
    }
    if (INCLUDED_MARKETPLACE_ORDER_STATUSES.has(orderStatus)) {
      return { eligible: true, reason: `included order status: ${orderStatus}` }
    }
    if (!orderStatus) {
      return { eligible: true, reason: 'marketplace order imported without explicit status' }
    }
    return { eligible: false, reason: `unsupported order status: ${orderStatus}` }
  }

  return { eligible: true, reason: 'rocket growth order imported' }
}

export function normalizeCoupangSourceOrderId(value?: string | number | null): string | null {
  return normalizeOptionalId(value)
}

export function normalizeCoupangShipmentBoxId(value?: string | number | null): string | null {
  return normalizeOptionalId(value)
}

export function normalizeCoupangSourceProductId(value?: string | number | null): string | null {
  return normalizeOptionalId(value)
}

export function buildCoupangMarketplaceSourceLineId(
  input: CoupangMarketplaceSourceIdentityInput,
): string {
  const shipmentBoxId = normalizeRequiredId(input.shipmentBoxId, 'shipmentBoxId')
  const vendorItemId = normalizeRequiredId(input.vendorItemId, 'vendorItemId')
  const itemIndex = normalizeItemIndex(input.itemIndex)
  return `${COUPANG_MARKETPLACE_FULFILLMENT_TYPE}:${shipmentBoxId}:${vendorItemId}:${itemIndex}`
}

export function buildCoupangRocketGrowthSourceLineId(
  input: CoupangRocketGrowthSourceIdentityInput,
): string {
  const orderId = normalizeRequiredId(input.orderId, 'orderId')
  const vendorItemId = normalizeRequiredId(input.vendorItemId, 'vendorItemId')
  const itemIndex = normalizeItemIndex(input.itemIndex)
  return `${COUPANG_ROCKET_GROWTH_FULFILLMENT_TYPE}:${orderId}:${vendorItemId}:${itemIndex}`
}

export function buildCoupangSourceLineId(input: CoupangSourceLineIdInput): string {
  if (input.sourceFulfillmentType === COUPANG_MARKETPLACE_FULFILLMENT_TYPE) {
    return buildCoupangMarketplaceSourceLineId(input)
  }

  if (input.sourceFulfillmentType === COUPANG_ROCKET_GROWTH_FULFILLMENT_TYPE) {
    return buildCoupangRocketGrowthSourceLineId(input)
  }

  throw new Error(`Unsupported Coupang fulfillment type: ${input.sourceFulfillmentType}`)
}

export function buildCoupangMarketplaceRawLineRows(input: {
  order: CoupangMarketplaceOrder
  sourceAccountKey?: string | null
}): CoupangOrderLineRawRow[] {
  const sourceAccountKey = normalizeSourceAccountKey(input.sourceAccountKey)
  const order = input.order || {}
  const orderItems = Array.isArray(order.orderItems) ? order.orderItems : []

  return orderItems.map((item, itemIndex) => ({
    source_channel: COUPANG_SOURCE_CHANNEL,
    source_fulfillment_type: COUPANG_MARKETPLACE_FULFILLMENT_TYPE,
    source_account_key: sourceAccountKey,
    source_line_id: buildCoupangMarketplaceSourceLineId({
      shipmentBoxId: order.shipmentBoxId,
      vendorItemId: item?.vendorItemId,
      itemIndex,
    }),
    source_order_id: normalizeCoupangSourceOrderId(order.orderId),
    source_product_id: normalizeCoupangSourceProductId(item?.vendorItemId),
    source_option_code: null,
    product_name: normalizeText(item?.sellerProductName) || normalizeText(item?.vendorItemName) || '-',
    product_option: toNullableString(item?.sellerProductItemName) || toNullableString(item?.vendorItemName),
    buyer_id: null,
    buyer_name: toNullableString(order.orderer?.name),
    receiver_name: toNullableString(order.receiver?.name),
    receiver_phone_masked: toNullableString(order.receiver?.safeNumber) || toNullableString(order.orderer?.safeNumber),
    receiver_base_address: toNullableString(order.receiver?.addr1),
    receiver_detail_address: toNullableString(order.receiver?.addr2),
    quantity: toPositiveInteger(item?.shippingCount, 1),
    product_order_status: toNullableString(order.status),
    claim_status: null,
    order_date: toIsoDateTimeString(order.orderedAt) || toIsoDateTimeString(order.paidAt),
    payment_date: toIsoDateTimeString(order.paidAt),
    decision_date: toIsoDateTimeString(item?.confirmDate) || toIsoDateTimeString(order.confirmDate),
    invoice_number: toNullableString(item?.invoiceNumber) || toNullableString(order.invoiceNumber),
    last_event_type: null,
    last_event_at: null,
    raw_json: {
      order,
      item,
      itemIndex,
    },
  }))
}

export function buildCoupangRocketGrowthRawLineRows(input: {
  order: CoupangRocketGrowthOrder
  sourceAccountKey?: string | null
}): CoupangOrderLineRawRow[] {
  const sourceAccountKey = normalizeSourceAccountKey(input.sourceAccountKey)
  const order = input.order || {}
  const orderItems = Array.isArray(order.orderItems) ? order.orderItems : []

  return orderItems.map((item, itemIndex) => ({
    source_channel: COUPANG_SOURCE_CHANNEL,
    source_fulfillment_type: COUPANG_ROCKET_GROWTH_FULFILLMENT_TYPE,
    source_account_key: sourceAccountKey,
    source_line_id: buildCoupangRocketGrowthSourceLineId({
      orderId: order.orderId,
      vendorItemId: item?.vendorItemId,
      itemIndex,
    }),
    source_order_id: normalizeCoupangSourceOrderId(order.orderId),
    source_product_id: normalizeCoupangSourceProductId(item?.vendorItemId),
    source_option_code: null,
    product_name: normalizeText(item?.productName) || '-',
    product_option: null,
    buyer_id: null,
    buyer_name: null,
    receiver_name: null,
    receiver_phone_masked: null,
    receiver_base_address: null,
    receiver_detail_address: null,
    quantity: toPositiveInteger(item?.salesQuantity, 1),
    product_order_status: null,
    claim_status: null,
    order_date: toIsoDateTimeString(order.paidAt),
    payment_date: toIsoDateTimeString(order.paidAt),
    decision_date: null,
    invoice_number: null,
    last_event_type: null,
    last_event_at: null,
    raw_json: {
      order,
      item,
      itemIndex,
    },
  }))
}

export function resolveCoupangSyncRecord(input: {
  rawLine: CoupangOrderLineRawRow
  productLookup: ProductLookup
  productMappingLookup?: CommerceProductMappingLookup | null
  runId: string
}): ResolvedCoupangSyncRecord {
  const rawLine = input.rawLine
  const eligibility = isEligibleCoupangOrderLine({
    sourceFulfillmentType: rawLine.source_fulfillment_type,
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

  const resolvedProduct = resolveMappedProduct(
    rawLine.product_name,
    rawLine.product_option || '',
    input.productLookup,
  )

  const mappingDecision = input.productMappingLookup
    ? resolveCommerceProductMapping({
        lookup: input.productMappingLookup,
        sourceFulfillmentType: rawLine.source_fulfillment_type,
        sourceAccountKey: rawLine.source_account_key,
        commerceProductId: rawLine.source_product_id,
        commerceOptionCode: rawLine.source_option_code,
        productName: rawLine.product_name,
        optionInfo: rawLine.product_option,
        canonicalOptionInfo: resolvedProduct.normalizedOption || rawLine.product_option,
      })
    : null

  const orderDate = toDateOnly(rawLine.order_date)
    || toDateOnly(rawLine.payment_date)
    || toDateOnly(rawLine.decision_date)
    || toDateOnly(rawLine.last_event_at)

  if (!orderDate) {
    throw new Error(`Unable to resolve order_date for ${rawLine.source_line_id}`)
  }

  const targetMonth = toTargetMonth(orderDate)
  if (!targetMonth) {
    throw new Error(`Unable to resolve target_month for ${rawLine.source_line_id}`)
  }

  const internalProductId = mappingDecision?.internalProductId || resolvedProduct.mappedProductId || null
  const needsReview = Boolean(mappingDecision?.needsReview) || !internalProductId

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

  const customerIdentity = buildCoupangCustomerIdentity(rawLine)
  const productName = String(resolvedProduct.normalizedName || rawLine.product_name || '').trim() || rawLine.product_name
  const projectedOptionInfo = resolveProjectedOptionInfo({
    mappingDecision,
    resolvedProduct,
    rawLine,
  })

  return {
    rawLine,
    purchase: {
      purchase_id: rawLine.source_line_id,
      upload_batch_id: input.runId,
      target_month: targetMonth,
      buyer_id: customerIdentity.buyerId,
      buyer_name: customerIdentity.buyerName,
      receiver_name: rawLine.receiver_name,
      customer_key: buildCustomerKey(customerIdentity.buyerId, customerIdentity.buyerName),
      product_id: internalProductId,
      product_name: productName,
      option_info: projectedOptionInfo,
      source_product_name: rawLine.product_name,
      source_option_info: rawLine.product_option || '',
      source_channel: rawLine.source_channel,
      source_fulfillment_type: rawLine.source_fulfillment_type,
      source_account_key: rawLine.source_account_key,
      source_order_id: rawLine.source_order_id,
      source_product_id: rawLine.source_product_id,
      source_option_code: rawLine.source_option_code,
      source_last_changed_at: rawLine.last_event_at,
      source_sync_run_id: input.runId,
      quantity: rawLine.quantity,
      order_date: orderDate,
      order_status: rawLine.product_order_status
        || (rawLine.source_fulfillment_type === COUPANG_ROCKET_GROWTH_FULFILLMENT_TYPE ? 'PAID' : 'UNKNOWN'),
      claim_status: rawLine.claim_status,
      delivery_type: rawLine.source_fulfillment_type === COUPANG_MARKETPLACE_FULFILLMENT_TYPE
        ? '판매자배송'
        : '로켓그로스',
      is_fake: false,
      match_reason: null,
      match_rank: null,
      matched_exp_id: null,
      needs_review: needsReview,
      is_manual: false,
      filter_ver: COUPANG_IMPORT_FILTER_VER,
      quantity_warning: rawLine.quantity >= 2,
    },
    eligible: true,
    eligibilityReason: eligibility.reason,
    needsReview,
    mappingReason: mappingDecision?.reason || null,
  }
}

export function buildCoupangProductLookupFromRows(rows: ProductCatalogItem[]): ProductLookup {
  return buildProductLookup(rows)
}

export function buildCoupangCommerceProductMappingLookupFromRows(
  rows: CommerceProductMappingRow[],
): CommerceProductMappingLookup {
  return buildCommerceProductMappingLookup(rows)
}
