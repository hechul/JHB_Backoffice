let purchaseSourceColumnsSupported: boolean | null = null
let purchaseSourceColumnsPromise: Promise<boolean> | null = null

export interface PurchaseSourceRowLike {
  product_name?: string | null
  option_info?: string | null
  source_product_name?: string | null
  source_option_info?: string | null
  quantity?: number | null
}

export async function supportsPurchaseSourceColumns(supabase: any): Promise<boolean> {
  if (purchaseSourceColumnsSupported !== null) return purchaseSourceColumnsSupported
  if (!purchaseSourceColumnsPromise) {
    purchaseSourceColumnsPromise = (async () => {
      const { error } = await supabase
        .from('purchases')
        .select('purchase_id, source_product_name, source_option_info')
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
  return `${baseColumns}, source_product_name, source_option_info`
}

export function purchaseQuantityInput(row: PurchaseSourceRowLike) {
  return {
    productName: String(row.source_product_name || row.product_name || ''),
    optionInfo: String(row.source_option_info ?? row.option_info ?? ''),
    quantity: row.quantity,
  }
}
