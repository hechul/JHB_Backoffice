import { resolveCommerceSourceProduct } from './useCommerceProductCatalog'

let purchaseSourceColumnsSupported: boolean | null = null
let purchaseSourceColumnsPromise: Promise<boolean> | null = null

export interface PurchaseSourceRowLike {
  product_name?: string | null
  option_info?: string | null
  source_product_name?: string | null
  source_option_info?: string | null
  source_product_id?: string | null
  source_option_code?: string | null
  quantity?: number | null
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

export function purchaseSelectColumns(baseColumns: string, includeSourceColumns: boolean): string {
  if (!includeSourceColumns) return baseColumns
  return `${baseColumns}, source_product_name, source_option_info, source_product_id, source_option_code`
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
