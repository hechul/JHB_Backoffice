import type { CommerceOrderEligibility } from './types'

const INCLUDED_ORDER_STATUSES = new Set([
  'PAYED',
  'DISPATCHED',
  'DELIVERING',
  'DELIVERED',
  'PURCHASE_DECIDED',
])

const EXCLUDED_ORDER_STATUSES = new Set([
  'CANCELED',
  'RETURNED',
  'CANCELED_BY_NOPAYMENT',
])

const EXCLUDED_CLAIM_KEYWORDS = ['cancel', 'return', 'exchange', 'reject', 'withdraw']

function normalizeCode(value?: string | null): string {
  return (value ?? '').trim().toUpperCase()
}

export function isEligibleCommerceOrderLine(input: {
  orderStatus?: string | null
  claimStatus?: string | null
}): CommerceOrderEligibility {
  const orderStatus = normalizeCode(input.orderStatus)
  const claimStatus = normalizeCode(input.claimStatus)

  if (EXCLUDED_ORDER_STATUSES.has(orderStatus)) {
    return { eligible: false, reason: `excluded order status: ${orderStatus}` }
  }

  if (
    claimStatus &&
    EXCLUDED_CLAIM_KEYWORDS.some((keyword) => claimStatus.toLowerCase().includes(keyword))
  ) {
    return { eligible: false, reason: `excluded claim status: ${claimStatus}` }
  }

  if (INCLUDED_ORDER_STATUSES.has(orderStatus)) {
    return { eligible: true, reason: `included order status: ${orderStatus}` }
  }

  return { eligible: false, reason: `unsupported order status: ${orderStatus || 'unknown'}` }
}

export function getIncludedOrderStatuses(): string[] {
  return [...INCLUDED_ORDER_STATUSES]
}
