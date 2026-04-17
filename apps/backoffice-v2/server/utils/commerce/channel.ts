// =====================================================================
// channel.ts
// 역할: 커머스 채널명과 계정 키 정규화 유틸리티
// 왜 필요: API 입력이나 DB 값에서 채널명이 대소문자 섞이거나
//          계정 키가 null/빈 문자열일 때 일관된 값으로 정규화해야 한다.
//          모든 파일이 이 함수를 통해 채널명을 처리하면 오타/대소문자 문제를 방지할 수 있다.
// 사용처: naver-sync.ts, sync-naver-orders.mjs 등
// =====================================================================

import type { CommerceChannel } from './types.ts' // 'naver' | 'coupang' | 'kakao' | 'excel'

// 현재 지원하는 커머스 채널 목록
// 새 채널 추가 시 이 배열에 추가하면 isCommerceChannel() 검증도 자동 확장됨
export const SUPPORTED_COMMERCE_CHANNELS: CommerceChannel[] = [
  'naver',   // 네이버 스마트스토어
  'coupang', // 쿠팡 (구현 예정)
  'kakao',   // 카카오 (구현 예정)
  'excel',   // 엑셀 업로드 (기존 방식)
]

/**
 * 주어진 문자열이 유효한 CommerceChannel인지 확인하는 타입 가드
 * TypeScript에서 string → CommerceChannel 타입 좁히기에 사용
 */
export function isCommerceChannel(value: string): value is CommerceChannel {
  return SUPPORTED_COMMERCE_CHANNELS.includes(value as CommerceChannel)
}

/**
 * 입력값을 소문자 trim 후 유효한 CommerceChannel로 변환한다.
 * null/undefined 입력 시 기본값 'naver' 사용.
 * 지원하지 않는 채널이면 에러를 던진다.
 *
 * 사용 예: normalizeCommerceChannel('NAVER') → 'naver'
 */
export function normalizeCommerceChannel(value?: string | null): CommerceChannel {
  const normalized = (value ?? 'naver').trim().toLowerCase() // null이면 'naver' 기본값

  if (isCommerceChannel(normalized)) {
    return normalized // 유효한 채널명이면 그대로 반환
  }

  throw new Error(`Unsupported commerce channel: ${value}`) // 알 수 없는 채널은 에러
}

/**
 * 계정 키를 정규화한다.
 * null/undefined/빈 문자열이면 'default'로 폴백한다.
 *
 * 이유: DB의 source_account_key 컬럼은 NOT NULL이며 기본값이 'default'다.
 *       입력이 없으면 항상 'default'를 사용해야 일관성이 유지된다.
 *
 * 사용 예: normalizeSourceAccountKey(null) → 'default'
 *          normalizeSourceAccountKey('store-a') → 'store-a'
 */
export function normalizeSourceAccountKey(value?: string | null): string {
  const normalized = value?.trim()
  return normalized && normalized.length > 0 ? normalized : 'default'
}
