const currencyFormatter = new Intl.NumberFormat('ko-KR', {
  style: 'currency',
  currency: 'KRW',
  maximumFractionDigits: 0,
})

const compactNumberFormatter = new Intl.NumberFormat('ko-KR', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

function normalizeAmount(value: number): number {
  return Number.isFinite(value) ? Math.round(value) : 0
}

export function formatCurrency(value: number): string {
  return currencyFormatter.format(normalizeAmount(value))
}

export function formatCompactCurrency(value: number): string {
  const amount = normalizeAmount(value)
  if (Math.abs(amount) < 1_000_000) return formatCurrency(amount)
  return `${compactNumberFormatter.format(amount)}원`
}
