import { describe, expect, it } from 'vitest'

import { formatOrderStatusLabel, orderStatusBadgeVariant } from '../../app/composables/useOrderStatusLabel'

describe('useOrderStatusLabel', () => {
  it('maps known order statuses to Korean labels', () => {
    expect(formatOrderStatusLabel('PAYED', null)).toBe('결제완료')
    expect(formatOrderStatusLabel('DELIVERED', null)).toBe('배송완료')
    expect(formatOrderStatusLabel('PURCHASE_DECIDED', null)).toBe('구매확정')
  })

  it('prefers active claim status over order status', () => {
    expect(formatOrderStatusLabel('DELIVERED', 'RETURN_REQUEST')).toBe('반품요청')
    expect(orderStatusBadgeVariant('DELIVERED', 'RETURN_REQUEST')).toBe('danger')
  })

  it('treats empty claim status as no-claim', () => {
    expect(formatOrderStatusLabel('결제완료', '없음')).toBe('결제완료')
    expect(orderStatusBadgeVariant('결제완료', '없음')).toBe('neutral')
  })
})
