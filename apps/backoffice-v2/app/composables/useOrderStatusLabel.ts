type BadgeVariant = 'primary' | 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const ORDER_STATUS_LABELS: Record<string, string> = {
  PAYED: '결제완료',
  DISPATCHED: '발송처리',
  DELIVERING: '배송중',
  DELIVERED: '배송완료',
  PURCHASE_DECIDED: '구매확정',
  CANCELED: '취소완료',
  CANCELED_BY_NOPAYMENT: '미결제취소',
  RETURNED: '반품완료',
}

const CLAIM_STATUS_LABELS: Record<string, string> = {
  CANCEL_REQUEST: '취소요청',
  CANCELING: '취소진행',
  CANCEL_DONE: '취소완료',
  CANCEL_REJECT: '취소거부',
  RETURN_REQUEST: '반품요청',
  RETURNING: '반품진행',
  RETURN_DONE: '반품완료',
  RETURN_REJECT: '반품거부',
  EXCHANGE_REQUEST: '교환요청',
  EXCHANGING: '교환진행',
  EXCHANGE_DONE: '교환완료',
  EXCHANGE_REJECT: '교환거부',
  COLLECTING: '회수중',
  COLLECT_DONE: '회수완료',
  WITHDRAW: '철회',
}

const EMPTY_CLAIM_STATUSES = new Set([
  '',
  '-',
  'NONE',
  'NO_CLAIM',
  '없음',
  '정상',
])

function normalizeStatusToken(value?: string | null) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '_')
    .toUpperCase()
}

function hasActiveClaimStatus(claimStatus?: string | null) {
  const raw = String(claimStatus || '').trim()
  if (!raw) return false
  const normalized = normalizeStatusToken(raw)
  return !EMPTY_CLAIM_STATUSES.has(normalized) && !EMPTY_CLAIM_STATUSES.has(raw)
}

function formatKnownStatus(rawValue: string, labelMap: Record<string, string>) {
  const raw = String(rawValue || '').trim()
  if (!raw) return '-'
  const normalized = normalizeStatusToken(raw)
  return labelMap[normalized] || raw
}

export function formatOrderStatusLabel(orderStatus?: string | null, claimStatus?: string | null) {
  if (hasActiveClaimStatus(claimStatus)) {
    return formatKnownStatus(String(claimStatus || ''), CLAIM_STATUS_LABELS)
  }
  return formatKnownStatus(String(orderStatus || ''), ORDER_STATUS_LABELS)
}

export function orderStatusBadgeVariant(orderStatus?: string | null, claimStatus?: string | null): BadgeVariant {
  if (hasActiveClaimStatus(claimStatus)) {
    const normalizedClaim = normalizeStatusToken(claimStatus)
    if (/(CANCEL|RETURN|REJECT|WITHDRAW)/.test(normalizedClaim)) return 'danger'
    return 'warning'
  }

  const normalizedOrder = normalizeStatusToken(orderStatus)
  switch (normalizedOrder) {
    case 'PURCHASE_DECIDED':
    case '구매확정':
    case 'DELIVERED':
    case '배송완료':
      return 'success'
    case 'DELIVERING':
    case '배송중':
    case 'DISPATCHED':
    case '발송':
    case '발송처리':
      return 'info'
    case 'PAYED':
    case '결제완료':
      return 'neutral'
    case 'CANCELED':
    case '취소':
    case '취소완료':
    case 'RETURNED':
    case '반품':
    case '반품완료':
      return 'danger'
    default:
      return 'neutral'
  }
}
