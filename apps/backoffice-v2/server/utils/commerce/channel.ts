import type { CommerceChannel } from './types'

export const SUPPORTED_COMMERCE_CHANNELS: CommerceChannel[] = [
  'naver',
  'coupang',
  'kakao',
  'excel',
]

export function isCommerceChannel(value: string): value is CommerceChannel {
  return SUPPORTED_COMMERCE_CHANNELS.includes(value as CommerceChannel)
}

export function normalizeCommerceChannel(value?: string | null): CommerceChannel {
  const normalized = (value ?? 'naver').trim().toLowerCase()

  if (isCommerceChannel(normalized)) {
    return normalized
  }

  throw new Error(`Unsupported commerce channel: ${value}`)
}

export function normalizeSourceAccountKey(value?: string | null): string {
  const normalized = value?.trim()
  return normalized && normalized.length > 0 ? normalized : 'default'
}
