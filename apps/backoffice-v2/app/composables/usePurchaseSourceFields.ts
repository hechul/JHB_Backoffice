import { resolveCommerceSourceProduct } from './useCommerceProductCatalog'

let purchaseSourceColumnsSupported: boolean | null = null
let purchaseSourceColumnsPromise: Promise<boolean> | null = null
let purchaseSourceScopeColumnsSupported: boolean | null = null
let purchaseSourceScopeColumnsPromise: Promise<boolean> | null = null
let purchaseAmountColumnsSupported: boolean | null = null
let purchaseAmountColumnsPromise: Promise<boolean> | null = null

export interface PurchaseSourceRowLike {
  product_name?: string | null
  option_info?: string | null
  source_product_name?: string | null
  source_option_info?: string | null
  source_product_id?: string | null
  source_option_code?: string | null
  source_channel?: string | null
  source_fulfillment_type?: string | null
  quantity?: number | null
}

export interface PurchaseAmountRowLike {
  payment_amount?: number | null
  order_discount_amount?: number | null
  delivery_fee_amount?: number | null
  delivery_discount_amount?: number | null
  expected_settlement_amount?: number | null
  payment_commission?: number | null
  sale_commission?: number | null
}

export interface PurchaseSourceScope {
  sourceChannel: string
  sourceFulfillmentType: string
}

export async function supportsPurchaseSourceColumns(supabase: any): Promise<boolean> {
  if (purchaseSourceColumnsSupported !== null) return purchaseSourceColumnsSupported
  if (!purchaseSourceColumnsPromise) {
    purchaseSourceColumnsPromise = (async () => {
      const { error } = await supabase
        .from('purchases')
        .select('purchase_id, source_product_name, source_option_info, source_product_id, source_option_code')
        .limit(1)

      if (error) {
        if (String((error as any)?.code || '') === '42703') {
          purchaseSourceColumnsSupported = false
          return false
        }
        throw error
      }

      purchaseSourceColumnsSupported = true
      return true
    })().finally(() => {
      purchaseSourceColumnsPromise = null
    })
  }

  return purchaseSourceColumnsPromise
}

export async function supportsPurchaseSourceScopeColumns(supabase: any): Promise<boolean> {
  if (purchaseSourceScopeColumnsSupported !== null) return purchaseSourceScopeColumnsSupported
  if (!purchaseSourceScopeColumnsPromise) {
    purchaseSourceScopeColumnsPromise = (async () => {
      const { error } = await supabase
        .from('purchases')
        .select('purchase_id, source_channel, source_fulfillment_type')
        .limit(1)

      if (error) {
        if (String((error as any)?.code || '') === '42703') {
          purchaseSourceScopeColumnsSupported = false
          return false
        }
        throw error
      }

      purchaseSourceScopeColumnsSupported = true
      return true
    })().finally(() => {
      purchaseSourceScopeColumnsPromise = null
    })
  }

  return purchaseSourceScopeColumnsPromise
}

export async function supportsPurchaseAmountColumns(supabase: any): Promise<boolean> {
  if (purchaseAmountColumnsSupported !== null) return purchaseAmountColumnsSupported
  if (!purchaseAmountColumnsPromise) {
    purchaseAmountColumnsPromise = (async () => {
      const { error } = await supabase
        .from('purchases')
        .select('purchase_id, payment_amount, order_discount_amount, delivery_fee_amount, delivery_discount_amount, expected_settlement_amount, payment_commission, sale_commission')
        .limit(1)

      if (error) {
        if (String((error as any)?.code || '') === '42703') {
          purchaseAmountColumnsSupported = false
          return false
        }
        throw error
      }

      purchaseAmountColumnsSupported = true
      return true
    })().finally(() => {
      purchaseAmountColumnsPromise = null
    })
  }

  return purchaseAmountColumnsPromise
}

export function purchaseSelectColumns(baseColumns: string, includeSourceColumns: boolean): string {
  if (!includeSourceColumns) return baseColumns
  return `${baseColumns}, source_product_name, source_option_info, source_product_id, source_option_code`
}

export function purchaseSourceScopeSelectColumns(baseColumns: string, includeSourceScopeColumns: boolean): string {
  if (!includeSourceScopeColumns) return baseColumns
  return `${baseColumns}, source_channel, source_fulfillment_type`
}

export function purchaseAmountSelectColumns(baseColumns: string, includeAmountColumns: boolean): string {
  if (!includeAmountColumns) return baseColumns
  return `${baseColumns}, payment_amount, order_discount_amount, delivery_fee_amount, delivery_discount_amount, expected_settlement_amount, payment_commission, sale_commission`
}

function toPurchaseAmount(value: unknown): number {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : 0
}

export function resolvePurchasePaymentAmount(row: Pick<PurchaseAmountRowLike, 'payment_amount'>): number {
  return toPurchaseAmount(row.payment_amount)
}

export function resolvePurchaseExpectedSettlementAmount(row: Pick<PurchaseAmountRowLike, 'expected_settlement_amount'>): number {
  return toPurchaseAmount(row.expected_settlement_amount)
}

export function resolvePurchaseCommissionTotal(row: Pick<PurchaseAmountRowLike, 'payment_commission' | 'sale_commission'>): number {
  return toPurchaseAmount(row.payment_commission) + toPurchaseAmount(row.sale_commission)
}

export function normalizePurchaseSourceScope(row: Pick<PurchaseSourceRowLike, 'source_channel' | 'source_fulfillment_type'>): PurchaseSourceScope {
  const sourceChannel = String(row.source_channel || '').trim() || 'excel'
  const sourceFulfillmentType = String(row.source_fulfillment_type || '').trim() || 'default'

  return {
    sourceChannel,
    sourceFulfillmentType,
  }
}

export function purchaseQuantityInput(row: PurchaseSourceRowLike) {
  const sourceProductName = String(row.source_product_name || row.product_name || '')
  const sourceOptionInfo = String(row.source_option_info ?? row.option_info ?? '')
  const sourceProductId = String(row.source_product_id || '').trim()
  const sourceOptionCode = String(row.source_option_code || '')
  const resolvedSourceProduct = sourceProductId
    ? resolveCommerceSourceProduct({
        sourceProductId,
        productName: sourceProductName,
        optionInfo: sourceOptionInfo,
      })
    : null

  if (resolvedSourceProduct) {
    return {
      productName: resolvedSourceProduct.canonicalProductName || String(row.product_name || sourceProductName),
      optionInfo: resolvedSourceProduct.canonicalOptionInfo || String(row.option_info ?? sourceOptionInfo ?? ''),
      sourceProductId,
      sourceOptionCode,
      quantity: row.quantity,
    }
  }

  return {
    productName: sourceProductName,
    optionInfo: sourceOptionInfo,
    sourceProductId,
    sourceOptionCode,
    quantity: row.quantity,
  }
}
