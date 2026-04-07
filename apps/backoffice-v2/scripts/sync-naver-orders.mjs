import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import { resolve } from 'node:path'

import {
  buildCommerceProductMappingLookupFromRows,
  buildChangedStatusEventRow,
  buildProductLookupFromRows,
  extractNaverChangedStatusItems,
  extractNaverChangedStatusPagination,
  extractNaverProductOrderInfos,
  formatNaverDateTime,
  parseNaverSyncDateTime,
  resolveNaverSyncRecord,
  splitNaverSyncWindows,
} from '../server/utils/commerce/naver-sync.ts'
import {
  buildClientConfig,
  chunk,
  parseEnvFile,
  restRequest,
} from './sync-master-data.mjs'

// 기본 env 파일 경로입니다. 별도 --env 인자가 없으면 이 파일을 읽습니다.
const DEFAULT_ENV = resolve(process.cwd(), '.env')
// 네이버 커머스 API 기본 엔드포인트입니다.
const DEFAULT_API_BASE_URL = 'https://api.commerce.naver.com/external/v1'
// 상태변경 조회 1회당 최대 조회 건수 기본값입니다.
const DEFAULT_LIMIT_COUNT = 300
// 상세조회 1회당 productOrderId 묶음 크기 기본값입니다.
const DEFAULT_DETAIL_BATCH_SIZE = 300
// 네이버 API 요청 사이 최소 간격 기본값입니다.
const DEFAULT_REQUEST_INTERVAL_MS = 1200
// 재시도 최대 횟수 기본값입니다.
const DEFAULT_MAX_RETRIES = 5
// 재시도 대기 시간의 기준값입니다.
const DEFAULT_RETRY_BASE_DELAY_MS = 10000
// client_secret_sign 생성을 맡는 Python helper 경로입니다.
const AUTH_HELPER_PATH = resolve(process.cwd(), 'scripts', 'lib', 'naver-commerce-auth.py')
const DEFAULT_SOURCE_FULFILLMENT_TYPE = 'default'

// purchase projection 생성에 실패한 경우에도 어느 달 주문이 바뀌었는지는 알아야 합니다.
// 이 보조 함수는 raw 주문 날짜를 보고 target_month 후보를 안전하게 뽑아냅니다.
function extractTargetMonth(...values) {
  for (const value of values) {
    // 날짜/시간 문자열을 공통 포맷으로 정리합니다.
    const normalized = String(value || '').trim()
    // YYYY-MM 까지만 추출해서 target_month 후보로 사용합니다.
    const month = normalized.match(/^(\d{4}-\d{2})/)
    if (month?.[1]) return month[1]
  }
  return null
}

function isMissingColumnError(error, columnName) {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes(columnName)
    && (
      message.includes('schema cache')
      || message.includes('column')
      || message.includes('Could not find')
      || message.includes('does not exist')
    )
}

async function supportsRestColumn(targetConfig, table, column) {
  try {
    await restRequest(
      targetConfig,
      `${table}?select=${encodeURIComponent(column)}&limit=1`,
      { method: 'GET' },
    )
    return true
  } catch (error) {
    if (isMissingColumnError(error, column)) {
      return false
    }
    throw error
  }
}

async function detectSourceFulfillmentTypeSupport(targetConfig) {
  const [
    commerceSyncRuns,
    commerceSyncCursors,
    commerceOrderEventsRaw,
    commerceOrderLinesRaw,
    commerceProductMappings,
    purchases,
    purchaseAmounts,
  ] = await Promise.all([
    supportsRestColumn(targetConfig, 'commerce_sync_runs', 'source_fulfillment_type'),
    supportsRestColumn(targetConfig, 'commerce_sync_cursors', 'source_fulfillment_type'),
    supportsRestColumn(targetConfig, 'commerce_order_events_raw', 'source_fulfillment_type'),
    supportsRestColumn(targetConfig, 'commerce_order_lines_raw', 'source_fulfillment_type'),
    supportsRestColumn(targetConfig, 'commerce_product_mappings', 'source_fulfillment_type'),
    supportsRestColumn(targetConfig, 'purchases', 'source_fulfillment_type'),
    supportsRestColumn(targetConfig, 'purchases', 'payment_amount'),
  ])

  return {
    commerceSyncRuns,
    commerceSyncCursors,
    commerceOrderEventsRaw,
    commerceOrderLinesRaw,
    commerceProductMappings,
    purchases,
    purchaseAmounts,
  }
}

function maybeWithSourceFulfillmentType(row, enabled) {
  if (enabled) return row
  const { source_fulfillment_type: _ignored, ...rest } = row
  return rest
}

function maybeWithPurchaseAmountColumns(row, enabled) {
  if (enabled) return row
  const {
    payment_amount: _paymentAmount,
    order_discount_amount: _orderDiscountAmount,
    delivery_fee_amount: _deliveryFeeAmount,
    delivery_discount_amount: _deliveryDiscountAmount,
    expected_settlement_amount: _expectedSettlementAmount,
    payment_commission: _paymentCommission,
    sale_commission: _saleCommission,
    ...rest
  } = row
  return rest
}

function printHelp() {
  console.log(`
Usage:
  node scripts/sync-naver-orders.mjs --from=2026-03-01 --to=2026-03-03

Options:
  --from=VALUE                  Sync start. Supports YYYY-MM-DD or ISO date-time
  --to=VALUE                    Sync end. Supports YYYY-MM-DD or ISO date-time
  --env=PATH                    Env file path (default: ./.env)
  --account-key=VALUE           Source account key (default: default)
  --run-type=VALUE              manual_sync | backfill | incremental (default: manual_sync)
  --requested-by-account-id=ID  Optional profiles.id for audit
  --limit-count=NUMBER          Changed-status page size (default: 300)
  --detail-batch-size=NUMBER    Product-order detail batch size (default: 300)
  --request-interval-ms=NUMBER  Minimum delay between Naver API requests (default: 1200)
  --max-retries=NUMBER          Retry count for transient/429 errors (default: 5)
  --retry-base-delay-ms=NUMBER  Base retry delay in milliseconds (default: 10000)
  --dry-run                     Fetch and transform without DB writes
  --help                        Show this help
`.trim())
}

function parseArgs(argv) {
  const args = {
    envPath: DEFAULT_ENV, // 사용할 env 파일 경로
    from: '', // 동기화 시작 시각/날짜
    to: '', // 동기화 종료 시각/날짜
    accountKey: 'default', // 상점 계정 구분 키
    runType: 'manual_sync', // 실행 유형: 수동/백필/증분
    requestedByAccountId: null, // 실행 요청자 audit 용 account id
    limitCount: DEFAULT_LIMIT_COUNT, // 상태변경 조회 page size
    detailBatchSize: DEFAULT_DETAIL_BATCH_SIZE, // 상세조회 batch 크기
    requestIntervalMs: DEFAULT_REQUEST_INTERVAL_MS, // API 요청 간 최소 간격
    maxRetries: DEFAULT_MAX_RETRIES, // 재시도 횟수
    retryBaseDelayMs: DEFAULT_RETRY_BASE_DELAY_MS, // 재시도 대기 기준 시간
    dryRun: false, // true면 DB 저장 없이 시뮬레이션만 수행
    help: false, // 도움말 출력 여부
  }

  for (const rawArg of argv) {
    // rawArg는 CLI에서 들어온 개별 옵션 문자열입니다.
    if (rawArg === '--dry-run') {
      args.dryRun = true
      continue
    }
    if (rawArg === '--help' || rawArg === '-h') {
      args.help = true
      continue
    }
    if (rawArg.startsWith('--env=')) {
      args.envPath = resolve(process.cwd(), rawArg.slice('--env='.length))
      continue
    }
    if (rawArg.startsWith('--from=')) {
      args.from = rawArg.slice('--from='.length).trim()
      continue
    }
    if (rawArg.startsWith('--to=')) {
      args.to = rawArg.slice('--to='.length).trim()
      continue
    }
    if (rawArg.startsWith('--account-key=')) {
      args.accountKey = rawArg.slice('--account-key='.length).trim() || 'default'
      continue
    }
    if (rawArg.startsWith('--run-type=')) {
      args.runType = rawArg.slice('--run-type='.length).trim() || 'manual_sync'
      continue
    }
    if (rawArg.startsWith('--requested-by-account-id=')) {
      const value = rawArg.slice('--requested-by-account-id='.length).trim()
      args.requestedByAccountId = value || null
      continue
    }
    if (rawArg.startsWith('--limit-count=')) {
      args.limitCount = Number.parseInt(rawArg.slice('--limit-count='.length), 10) || DEFAULT_LIMIT_COUNT
      continue
    }
    if (rawArg.startsWith('--detail-batch-size=')) {
      args.detailBatchSize = Number.parseInt(rawArg.slice('--detail-batch-size='.length), 10) || DEFAULT_DETAIL_BATCH_SIZE
      continue
    }
    if (rawArg.startsWith('--request-interval-ms=')) {
      args.requestIntervalMs = Number.parseInt(rawArg.slice('--request-interval-ms='.length), 10) || DEFAULT_REQUEST_INTERVAL_MS
      continue
    }
    if (rawArg.startsWith('--max-retries=')) {
      args.maxRetries = Number.parseInt(rawArg.slice('--max-retries='.length), 10) || DEFAULT_MAX_RETRIES
      continue
    }
    if (rawArg.startsWith('--retry-base-delay-ms=')) {
      args.retryBaseDelayMs = Number.parseInt(rawArg.slice('--retry-base-delay-ms='.length), 10) || DEFAULT_RETRY_BASE_DELAY_MS
      continue
    }
    throw new Error(`Unknown argument: ${rawArg}`)
  }

  if (!args.help && (!args.from || !args.to)) {
    throw new Error('--from and --to are required')
  }

  if (!['manual_sync', 'backfill', 'incremental'].includes(args.runType)) {
    throw new Error(`Unsupported run type: ${args.runType}`)
  }

  return args
}

// env에서 네이버 커머스 API 실행 설정을 읽어 런타임 설정 객체를 만듭니다.
// 이미 발급된 access token을 재사용하는 경우와, 이번 실행에서 새로 토큰을 발급하는 경우를 모두 지원합니다.
function buildNaverConfig(env) {
  const clientId = String(env.NAVER_COMMERCE_CLIENT_ID || '').trim() // 네이버 API client id
  const clientSecret = String(env.NAVER_COMMERCE_CLIENT_SECRET || '').trim() // 네이버 API client secret
  const apiBaseUrl = String(env.NAVER_COMMERCE_API_BASE_URL || DEFAULT_API_BASE_URL).trim() // API base url
  const tokenType = String(env.NAVER_COMMERCE_TOKEN_TYPE || 'SELF').trim().toUpperCase() // SELF 또는 SELLER
  const accountId = String(env.NAVER_COMMERCE_ACCOUNT_ID || '').trim() // SELLER 토큰용 account id
  const accessToken = String(env.NAVER_COMMERCE_ACCESS_TOKEN || '').trim() // 이미 발급된 토큰이 있으면 재사용
  const requestIntervalMs = Number.parseInt(String(env.NAVER_COMMERCE_REQUEST_INTERVAL_MS || ''), 10) || DEFAULT_REQUEST_INTERVAL_MS // 요청 간 간격
  const maxRetries = Number.parseInt(String(env.NAVER_COMMERCE_MAX_RETRIES || ''), 10) || DEFAULT_MAX_RETRIES // 최대 재시도 횟수
  const retryBaseDelayMs = Number.parseInt(String(env.NAVER_COMMERCE_RETRY_BASE_DELAY_MS || ''), 10) || DEFAULT_RETRY_BASE_DELAY_MS // 재시도 기준 대기 시간

  if (!accessToken && (!clientId || !clientSecret)) {
    throw new Error('NAVER_COMMERCE_CLIENT_ID and NAVER_COMMERCE_CLIENT_SECRET are required unless NAVER_COMMERCE_ACCESS_TOKEN is set')
  }

  return {
    clientId,
    clientSecret,
    apiBaseUrl,
    tokenType,
    accountId: accountId || null,
    accessToken: accessToken || null,
    requestIntervalMs,
    maxRetries,
    retryBaseDelayMs,
  }
}

function sleep(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve()
  // resolveSleep는 setTimeout 종료 시 Promise를 깨우는 콜백입니다.
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms)
  })
}

function extractRetryAfterMs(response) {
  // retry-after 헤더가 있으면 서버가 권장하는 재시도 시간을 우선 사용합니다.
  const headerValue = response.headers.get('retry-after')
  if (!headerValue) return null

  // 초 단위 숫자 형태의 retry-after 처리
  const numeric = Number.parseInt(headerValue, 10)
  if (Number.isFinite(numeric) && numeric >= 0) {
    return numeric * 1000
  }

  // 날짜 문자열 형태의 retry-after 처리
  const timestamp = Date.parse(headerValue)
  if (Number.isNaN(timestamp)) return null
  const delayMs = timestamp - Date.now()
  return delayMs > 0 ? delayMs : null
}

function computeRetryDelayMs(response, attempt, naverConfig) {
  // 헤더에 명시된 재시도 시간이 있으면 그대로 사용합니다.
  const retryAfterMs = extractRetryAfterMs(response)
  if (retryAfterMs) {
    return retryAfterMs
  }

  // 429는 더 보수적으로, 서버 오류는 상대적으로 짧게 시작합니다.
  const baseDelayMs = response.status === 429
    ? Math.max(naverConfig.retryBaseDelayMs, 10000)
    : Math.max(Math.floor(naverConfig.retryBaseDelayMs / 2), 2000)

  // attempt가 늘수록 지수 백오프로 대기 시간을 늘립니다.
  const exponentialDelayMs = baseDelayMs * (2 ** attempt)
  return Math.min(exponentialDelayMs, 120000)
}

// 네이버 OAuth 토큰 발급 시에는 bcrypt 기반 client_secret_sign이 필요합니다.
// 이 계산은 Python helper에 맡겨서 Node 스크립트 본문은 주문 동기화 로직에 집중하게 합니다.
function signNaverClientSecret(naverConfig) {
  const timestamp = String(Date.now()) // 서명에 포함할 현재 시각
  const result = spawnSync('python3', [AUTH_HELPER_PATH, timestamp], {
    encoding: 'utf8',
    env: {
      ...process.env,
      NAVER_COMMERCE_CLIENT_ID: naverConfig.clientId,
      NAVER_COMMERCE_CLIENT_SECRET: naverConfig.clientSecret,
    },
  })

  if (result.status !== 0) {
    const stderr = (result.stderr || result.stdout || '').trim()
    throw new Error(`Failed to generate Naver client_secret_sign: ${stderr || `exit ${result.status}`}`)
  }

  return JSON.parse(result.stdout)
}

// access token은 동기화 실행 1회당 한 번만 발급하고, 이후 모든 네이버 API 호출에서 재사용합니다.
async function fetchNaverAccessToken(naverConfig) {
  if (naverConfig.accessToken) {
    return naverConfig.accessToken
  }

  // signed에는 client_id / timestamp / client_secret_sign이 들어옵니다.
  const signed = signNaverClientSecret(naverConfig)
  // body는 OAuth 토큰 발급에 필요한 form-urlencoded payload입니다.
  const body = new URLSearchParams({
    client_id: signed.client_id,
    timestamp: signed.timestamp,
    grant_type: 'client_credentials',
    client_secret_sign: signed.client_secret_sign,
    type: naverConfig.tokenType,
  })
  if (naverConfig.accountId && naverConfig.tokenType === 'SELLER') {
    body.set('account_id', naverConfig.accountId)
  }

  // response는 토큰 발급 API의 HTTP 응답입니다.
  const response = await fetch(`${naverConfig.apiBaseUrl}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  if (!response.ok) {
    const bodyText = await response.text()
    throw new Error(`Naver token request failed: ${response.status} ${response.statusText} ${bodyText}`)
  }

  // payload는 토큰 응답 JSON 본문입니다.
  const payload = await response.json()
  if (!payload?.access_token) {
    throw new Error('Naver token response does not contain access_token')
  }

  return String(payload.access_token)
}

// 네이버 API 공통 호출 래퍼입니다.
// 이 함수 안에서 요청 간격 제한, 429/서버 오류 재시도, Authorization 헤더 주입을 한 번에 처리합니다.
async function naverApiRequest(naverConfig, requestState, accessToken, path, init = {}) {
  let attempt = 0 // 현재 요청의 재시도 횟수

  while (true) {
    // 직전 요청 시각과 최소 간격을 비교해 추가 대기 시간을 계산합니다.
    const waitMs = Math.max(0, requestState.lastRequestAt + naverConfig.requestIntervalMs - Date.now())
    if (waitMs > 0) {
      await sleep(waitMs)
    }
    requestState.lastRequestAt = Date.now()

    // response는 현재 API 호출의 HTTP 응답 객체입니다.
    const response = await fetch(`${naverConfig.apiBaseUrl}/${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...(init.headers || {}),
      },
    })

    if (response.ok) {
      return response.json()
    }

    const bodyText = await response.text() // 실패 시 본문 로그용 텍스트
    const canRetry = (response.status === 429 || response.status >= 500) && attempt < naverConfig.maxRetries // 재시도 가능 여부

    if (canRetry) {
      // delayMs는 이번 실패 후 얼마나 기다릴지 계산한 시간입니다.
      const delayMs = computeRetryDelayMs(response, attempt, naverConfig)
      console.warn(
        `[naver-sync] retry ${attempt + 1}/${naverConfig.maxRetries} for ${path} after ${delayMs}ms (${response.status} ${response.statusText})`,
      )
      attempt += 1
      await sleep(delayMs)
      continue
    }

    throw new Error(`Naver API request failed: ${response.status} ${response.statusText} ${bodyText}`)
  }
}

// 동기화 1단계입니다.
// 지정한 하루 구간(window) 안에서 상태가 바뀐 상품주문 목록을 모읍니다.
// 한 구간에서도 페이지가 여러 번 나올 수 있어서 moreFrom / moreSequence를 따라 끝까지 수집합니다.
async function fetchChangedStatusesForWindow(naverConfig, requestState, accessToken, window, limitCount) {
  const allItems = [] // 이 window에서 모은 전체 상태변경 행
  const pages = [] // 페이지네이션 추적용 메타 정보
  let nextFrom = window.windowFrom // 다음 요청의 lastChangedFrom
  let nextSequence = null // 다음 페이지 요청에 필요한 moreSequence

  while (true) {
    // query는 last-changed-statuses 호출용 query string입니다.
    const query = new URLSearchParams({
      lastChangedFrom: nextFrom,
      lastChangedTo: window.windowTo,
      limitCount: String(limitCount),
    })
    if (nextSequence) {
      query.set('moreSequence', nextSequence)
    }

    // payload는 상태변경 목록 API 응답 본문입니다.
    const payload = await naverApiRequest(
      naverConfig,
      requestState,
      accessToken,
      `pay-order/seller/product-orders/last-changed-statuses?${query.toString()}`,
      { method: 'GET' },
    )

    const items = extractNaverChangedStatusItems(payload) // 이번 페이지에서 받은 상태변경 아이템들
    allItems.push(...items)

    const more = extractNaverChangedStatusPagination(payload) // 다음 페이지 존재 여부
    pages.push({
      requestFrom: nextFrom,
      requestTo: window.windowTo,
      itemCount: items.length,
      moreFrom: more.moreFrom,
      moreSequence: more.moreSequence,
    })

    if (!more.moreFrom || !more.moreSequence) {
      break
    }

    nextFrom = more.moreFrom
    nextSequence = more.moreSequence
  }

  return { items: allItems, pages }
}

// 동기화 2단계입니다.
// 상태가 바뀐 상품주문 id들을 가지고 상세조회 API를 호출해 실제 주문 상세 스냅샷을 복원합니다.
// 이 상세 응답을 바탕으로 raw row와 앱 화면에서 쓰는 purchase projection을 함께 만듭니다.
async function fetchProductOrderDetails(naverConfig, requestState, accessToken, productOrderIds, detailBatchSize) {
  const allInfos = [] // 모든 상세조회 결과를 누적 저장

  for (const batch of chunk(productOrderIds, detailBatchSize)) {
    // batch는 한 번에 상세조회할 productOrderId 묶음입니다.
    const payload = await naverApiRequest(
      naverConfig,
      requestState,
      accessToken,
      'pay-order/seller/product-orders/query',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productOrderIds: batch,
          quantityClaimCompatibility: true,
        }),
      },
    )

    allInfos.push(...extractNaverProductOrderInfos(payload))
  }

  return allInfos
}

// 활성 상품 목록은 외부 주문을 내부 canonical 상품으로 연결할 때 쓰는 기준 카탈로그입니다.
async function fetchActiveProducts(targetConfig) {
  const query = 'products?select=product_id,product_name,option_name&deleted_at=is.null&order=product_name.asc' // 내부 canonical 상품 목록 조회 쿼리
  const rows = await restRequest(targetConfig, query, { method: 'GET' }) // Supabase REST 응답
  return Array.isArray(rows) ? rows : []
}

// 이 매핑 테이블은 외부 커머스 상품번호/옵션과 내부 상품을 연결하는 1순위 규칙입니다.
// default 공통 규칙과 특정 계정 전용 override 규칙을 함께 읽어서 우선순위대로 사용합니다.
async function fetchCommerceProductMappings(targetConfig, accountKey, sourceScopeSupport) {
  const normalizedAccountKey = String(accountKey || 'default').trim() || 'default' // default 또는 특정 계정 키
  const query = [
    `commerce_product_mappings?select=${[
      'id',
      'source_channel',
      ...(sourceScopeSupport?.commerceProductMappings ? ['source_fulfillment_type'] : []),
      'source_account_key',
      'commerce_product_id',
      'commerce_option_code',
      'commerce_product_name',
      'commerce_option_name',
      'internal_product_id',
      'matching_mode',
      'canonical_variant',
      'rule_json',
      'priority',
      'is_active',
    ].join(',')}`,
    'source_channel=eq.naver',
    ...(sourceScopeSupport?.commerceProductMappings ? [`source_fulfillment_type=eq.${DEFAULT_SOURCE_FULFILLMENT_TYPE}`] : []),
    'is_active=is.true',
    `or=${encodeURIComponent(`(source_account_key.eq.default,source_account_key.eq.${normalizedAccountKey})`)}`,
    'order=priority.asc,id.asc',
  ].join('&')

  const rows = await restRequest(targetConfig, query, { method: 'GET' }) // 매핑 테이블 조회 결과
  return Array.isArray(rows) ? rows : []
}

// 아래 helper들은 동기화 실행 기록 자체를 남기는 용도입니다.
// 나중에 백오피스에서 어떤 run이 성공/실패했는지, 어느 날짜 구간이 문제였는지 추적할 수 있게 합니다.
async function createSyncRun(targetConfig, args, requestedFrom, requestedTo, sourceScopeSupport) {
  const rows = await restRequest(targetConfig, 'commerce_sync_runs', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify([{
      source_channel: 'naver',
      ...(sourceScopeSupport?.commerceSyncRuns ? { source_fulfillment_type: DEFAULT_SOURCE_FULFILLMENT_TYPE } : {}),
      source_account_key: args.accountKey,
      run_type: args.runType,
      requested_by_account_id: args.requestedByAccountId,
      requested_from: requestedFrom,
      requested_to: requestedTo,
      status: 'running',
      summary_json: { dryRun: false },
    }]),
  })

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Failed to create commerce_sync_runs row')
  }

  return rows[0]
}

async function updateSyncRun(targetConfig, runId, patch) {
  // patch에 updated_at을 덧붙여 실행 상태와 요약 정보를 최신값으로 갱신합니다.
  await restRequest(targetConfig, `commerce_sync_runs?id=eq.${encodeURIComponent(runId)}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      ...patch,
      updated_at: new Date().toISOString(),
    }),
  })
}

async function createSyncWindow(targetConfig, runId, window) {
  // 하루치 window마다 별도 실행 행을 남겨서 부분 실패가 났을 때 어느 날짜가 문제인지 찾기 쉽게 합니다.
  const rows = await restRequest(targetConfig, 'commerce_sync_windows', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify([{
      run_id: runId,
      window_from: window.windowFrom,
      window_to: window.windowTo,
      status: 'running',
    }]),
  })

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Failed to create commerce_sync_windows row')
  }

  return rows[0]
}

async function updateSyncWindow(targetConfig, windowId, patch) {
  // 하루 단위 window의 성공/실패/건수 요약을 반영합니다.
  await restRequest(targetConfig, `commerce_sync_windows?id=eq.${windowId}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  })
}

async function upsertRows(targetConfig, table, conflictColumns, rows) {
  if (rows.length === 0) return

  for (const batch of chunk(rows, 500)) {
    // batch는 Supabase 한 번에 올릴 적당한 크기로 자른 row 묶음입니다.
    await restRequest(
      targetConfig,
      `${table}?on_conflict=${encodeURIComponent(conflictColumns)}`,
      {
        method: 'POST',
        headers: {
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(batch),
      },
    )
  }
}

async function deleteProjectedPurchases(targetConfig, purchaseIds, accountKey, sourceScopeSupport) {
  if (purchaseIds.length === 0) return

  for (const batch of chunk(purchaseIds, 200)) {
    const encodedIds = batch.map((id) => `"${id}"`).join(',') // in (...) 절에 넣을 purchase_id 문자열
    const query = [
      `purchase_id=in.(${encodedIds})`,
      'source_channel=eq.naver',
      ...(sourceScopeSupport?.purchases ? [`source_fulfillment_type=eq.${DEFAULT_SOURCE_FULFILLMENT_TYPE}`] : []),
      `source_account_key=eq.${encodeURIComponent(accountKey)}`,
    ].join('&')
    await restRequest(targetConfig, `purchases?${query}`, {
      method: 'DELETE',
      headers: {
        Prefer: 'return=minimal',
      },
    })
  }
}

async function updateCursor(targetConfig, args, runId, requestedFrom, requestedTo, lastChangedAt, sourceScopeSupport) {
  // 마지막 성공 범위와 마지막 상태변경 시각을 남겨 이후 증분 동기화의 기준점으로 활용합니다.
  await restRequest(
    targetConfig,
    `commerce_sync_cursors?on_conflict=${encodeURIComponent(
      sourceScopeSupport?.commerceSyncCursors
        ? 'source_channel,source_fulfillment_type,source_account_key'
        : 'source_channel,source_account_key',
    )}`,
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([{
        source_channel: 'naver',
        ...(sourceScopeSupport?.commerceSyncCursors ? { source_fulfillment_type: DEFAULT_SOURCE_FULFILLMENT_TYPE } : {}),
        source_account_key: args.accountKey,
        last_success_from: requestedFrom,
        last_success_to: requestedTo,
        last_success_changed_at: lastChangedAt,
        last_run_id: runId,
        updated_at: new Date().toISOString(),
      }]),
    },
  )
}

function pickLatestEventByLine(items) {
  const map = new Map() // productOrderId별 최신 이벤트만 남기는 맵
  for (const item of items) {
    const key = String(item.productOrderId || '').trim() // 상품주문 단위 고유키
    if (!key) continue
    const existing = map.get(key) // 이미 저장된 같은 상품주문의 이전 이벤트
    if (!existing) {
      map.set(key, item)
      continue
    }
    const currentAt = String(item.lastChangedDate || '') // 현재 후보 이벤트 시각
    const existingAt = String(existing.lastChangedDate || '') // 기존 이벤트 시각
    if (currentAt >= existingAt) {
      map.set(key, item)
    }
  }
  return map
}

function buildSummaryPatch(summary, status, errorMessage = null) {
  // run 종료 시점에 공통으로 기록할 상태/완료시각/요약/에러 메시지를 한 번에 만듭니다.
  return {
    status,
    completed_at: new Date().toISOString(),
    summary_json: summary,
    error_message: errorMessage,
  }
}

// 동기화 전체 흐름입니다.
// 1) 인자/환경변수 파싱
// 2) 요청 기간을 하루 단위 window로 분할
// 3) window별 상태변경 주문 조회
// 4) 상품주문 상세조회
// 5) raw event/line row 생성 및 저장
// 6) 대시보드/고객분석용 purchase projection 생성
// 7) 취소/반품완료/미해결 주문의 stale projection 삭제
async function main() {
  const args = parseArgs(process.argv.slice(2)) // CLI 입력 옵션 파싱 결과
  if (args.help) {
    printHelp()
    return
  }

  const env = await parseEnvFile(args.envPath) // env 파일을 읽은 결과
  const targetConfig = buildClientConfig(env, 'target') // Supabase target 프로젝트 접속 설정
  const naverConfig = buildNaverConfig(env) // 네이버 API 호출 설정
  const requestedFromDate = parseNaverSyncDateTime(args.from, 'start') // 시작 날짜를 Date로 변환
  const requestedToDate = parseNaverSyncDateTime(args.to, 'end') // 종료 날짜를 Date로 변환
  const requestedFrom = formatNaverDateTime(requestedFromDate) // 네이버 API 요청용 시작 문자열
  const requestedTo = formatNaverDateTime(requestedToDate) // 네이버 API 요청용 종료 문자열
  const windows = splitNaverSyncWindows(requestedFromDate, requestedToDate) // 네이버 상태변경 조회 제약에 맞춘 24시간 단위 조회 구간

  console.log(`[naver-sync] target range ${requestedFrom} -> ${requestedTo}`)
  console.log(`[naver-sync] windows ${windows.length}`)

  const accessToken = await fetchNaverAccessToken(naverConfig) // 전체 실행 동안 공통으로 쓸 bearer token
  const requestState = { lastRequestAt: 0 } // 요청 간격 제어를 위해 직전 네이버 API 호출 시각을 저장
  const products = await fetchActiveProducts(targetConfig) // 내부 상품 마스터 목록
  const sourceScopeSupport = await detectSourceFulfillmentTypeSupport(targetConfig) // fulfillment 컬럼 지원 여부
  const productMappings = await fetchCommerceProductMappings(targetConfig, args.accountKey, sourceScopeSupport) // 외부상품 -> 내부상품 연결 규칙
  const productLookup = buildProductLookupFromRows(products) // 이름/옵션 기준 fallback 매핑용 lookup
  const productMappingLookup = buildCommerceProductMappingLookupFromRows(productMappings) // 상품번호/옵션 기준 우선 매핑용 lookup

  if (!sourceScopeSupport.purchaseAmounts) {
    console.warn('[naver-sync] purchases.payment_amount column is missing. Apply 107_extend_purchases_amount_columns.sql to persist revenue fields.')
  }

  // dry-run도 실제와 같은 변환 로직을 타지만 DB 저장만 생략합니다.
  // downstream 로직은 동일하게 유지하기 위해 synthetic run id를 하나 만들어 사용합니다.
  const runId = args.dryRun
    ? crypto.randomUUID()
    : String((await createSyncRun(targetConfig, args, requestedFrom, requestedTo, sourceScopeSupport)).id) // 이번 실행의 run id
  let lastChangedAt = null // 이번 실행에서 가장 마지막으로 본 상태변경 시각
  let completedWindows = 0 // 성공적으로 처리한 window 수
  const summary = {
    dryRun: args.dryRun, // dry-run 여부
    sourceChannel: 'naver', // 동기화 채널
    sourceFulfillmentType: DEFAULT_SOURCE_FULFILLMENT_TYPE, // fulfillment 축 기본값
    sourceAccountKey: args.accountKey, // 계정 구분 키
    requestedFrom, // 사용자가 요청한 시작 시각
    requestedTo, // 사용자가 요청한 종료 시각
    windowCount: windows.length, // 하루 단위로 쪼갠 총 처리 구간 수
    changedCount: 0, // 상태변경 조회에서 모은 전체 상품주문 수
    detailCount: 0, // 상세조회로 복원한 전체 상품주문 수
    rawEventCount: 0, // event raw row 수
    rawLineCount: 0, // line raw row 수
    projectedCount: 0, // purchases에 반영 가능한 projection 수
    excludedCount: 0, // 취소/반품완료 등 제외된 주문 수
    deletedCount: 0, // stale projection 삭제 대상 수
    unresolvedCount: 0, // 정상 주문이지만 내부 매핑 실패로 unresolved 된 수
    mappingRowCount: productMappings.length, // 이번 실행에서 불러온 매핑 규칙 수
    affectedTargetMonths: [], // 이번 실행으로 실제 영향이 간 주문 월 목록
  }
  const affectedTargetMonths = new Set() // 실제로 주문이 바뀐 target_month 집합

  try {
    let syntheticWindowId = 1 // dry-run일 때 window 식별자 대용 번호
    for (const window of windows) {
      // live sync면 DB에 실제 window row를 만들고, dry-run이면 메모리 상 가짜 row를 사용합니다.
      const windowRow = args.dryRun
        ? { id: syntheticWindowId += 1 }
        : await createSyncWindow(targetConfig, runId, window)

      console.log(`[naver-sync] window ${window.windowFrom} -> ${window.windowTo}`)

      try {
        const { items: changedItems, pages } = await fetchChangedStatusesForWindow(
          naverConfig,
          requestState,
          accessToken,
          window,
          args.limitCount,
        )

        const latestEventMap = pickLatestEventByLine(changedItems) // 상품주문별 최신 이벤트만 추린 맵
        const eventRows = changedItems.map((item) =>
          buildChangedStatusEventRow({
            item,
            runId,
            windowId: args.dryRun ? null : Number(windowRow.id),
            sourceChannel: 'naver',
            sourceAccountKey: args.accountKey,
          }))

        const productOrderIds = [...latestEventMap.keys()] // 상세조회할 상품주문 id 목록
        const detailInfos = productOrderIds.length > 0
          ? await fetchProductOrderDetails(naverConfig, requestState, accessToken, productOrderIds, args.detailBatchSize)
          : []

        // 상세조회 1건은 아래 3가지 판단을 함께 거칩니다.
        // - raw line row 1건 생성
        // - 유효 주문이면 purchase projection 1건 생성 가능
        // - 취소/반품완료/매핑실패면 projection 없이 raw만 남길 수 있음
        const records = detailInfos.map((orderInfo) => {
          const sourceLineId = String(orderInfo?.productOrder?.productOrderId || '').trim() // 상세조회 결과의 상품주문 id
          return resolveNaverSyncRecord({
            orderInfo,
            latestEvent: latestEventMap.get(sourceLineId) || null,
            productLookup,
            productMappingLookup,
            runId,
            sourceChannel: 'naver',
            sourceAccountKey: args.accountKey,
          })
        })

        const rawLineRows = records.map((record) => record.rawLine) // raw line 테이블에 넣을 행
        const purchaseRows = records.filter((record) => record.purchase).map((record) => record.purchase) // purchases에 넣을 정상 projection 행
        const excludedIds = records.filter((record) => !record.eligible).map((record) => record.rawLine.source_line_id) // 취소/반품완료 등 제외 대상 id
        const unresolvedRecords = records.filter((record) => record.eligible && !record.purchase) // 정상 주문이지만 내부 매핑 실패한 행
        const unresolvedIds = unresolvedRecords.map((record) => record.rawLine.source_line_id) // unresolved 상품주문 id 목록

        // 이미 예전에 purchases에 들어갔던 주문이라도
        // 이번 실행에서 취소/반품완료가 되었거나 매핑 불가 상태가 되면 stale row를 지워야 합니다.
        const deletedPurchaseIds = [...new Set([...excludedIds, ...unresolvedIds])]

        for (const record of records) {
          const targetMonth = record.purchase?.target_month || extractTargetMonth(
            record.rawLine.order_date,
            record.rawLine.payment_date,
            record.rawLine.last_event_at,
          )
          if (targetMonth) {
            affectedTargetMonths.add(targetMonth)
          }
        }

        for (const item of changedItems) {
          if (!item?.lastChangedDate) continue
          if (!lastChangedAt || item.lastChangedDate > lastChangedAt) {
            lastChangedAt = item.lastChangedDate
          }
        }

        // summary는 화면 로그와 최종 실행 결과에 그대로 쓰이는 누적 통계입니다.
        summary.changedCount += changedItems.length
        summary.detailCount += detailInfos.length
        summary.rawEventCount += eventRows.length
        summary.rawLineCount += rawLineRows.length
        summary.projectedCount += purchaseRows.length
        summary.excludedCount += excludedIds.length
        summary.deletedCount += deletedPurchaseIds.length
        summary.unresolvedCount += unresolvedRecords.length
        summary.affectedTargetMonths = Array.from(affectedTargetMonths).sort()

        if (!args.dryRun) {
          const persistedEventRows = eventRows.map((row) =>
            maybeWithSourceFulfillmentType(row, sourceScopeSupport.commerceOrderEventsRaw))
          const persistedRawLineRows = rawLineRows.map((row) =>
            maybeWithSourceFulfillmentType(row, sourceScopeSupport.commerceOrderLinesRaw))
          const persistedPurchaseRows = purchaseRows.map((row) =>
            maybeWithPurchaseAmountColumns(
              maybeWithSourceFulfillmentType(row, sourceScopeSupport.purchases),
              sourceScopeSupport.purchaseAmounts,
            ))

          // 저장 순서는 raw -> projection 입니다.
          // raw를 먼저 남겨야 나중에 매핑 규칙이 바뀌어도 재처리 근거를 보존할 수 있습니다.
          await upsertRows(
            targetConfig,
            'commerce_order_events_raw',
            sourceScopeSupport.commerceOrderEventsRaw
              ? 'source_channel,source_fulfillment_type,source_account_key,source_line_id,event_at,event_type'
              : 'source_channel,source_account_key,source_line_id,event_at,event_type',
            persistedEventRows,
          )
          await upsertRows(
            targetConfig,
            'commerce_order_lines_raw',
            sourceScopeSupport.commerceOrderLinesRaw
              ? 'source_channel,source_fulfillment_type,source_account_key,source_line_id'
              : 'source_channel,source_account_key,source_line_id',
            persistedRawLineRows,
          )
          await upsertRows(targetConfig, 'purchases', 'purchase_id', persistedPurchaseRows)
          await deleteProjectedPurchases(targetConfig, deletedPurchaseIds, args.accountKey, sourceScopeSupport)
          await updateSyncWindow(targetConfig, windowRow.id, {
            status: 'done',
            changed_count: changedItems.length,
            detail_count: detailInfos.length,
            upserted_count: purchaseRows.length,
            excluded_count: deletedPurchaseIds.length,
            pagination_json: { pages },
          })
        } else {
          // dry-run에서는 실제 저장 없이 어떤 규모로 반영될지만 로그로 보여줍니다.
          console.log(
            `[naver-sync][dry-run] changed=${changedItems.length} detail=${detailInfos.length} projected=${purchaseRows.length} excluded=${excludedIds.length} unresolved=${unresolvedRecords.length}`,
          )
        }

        completedWindows += 1
      } catch (error) {
        if (!args.dryRun) {
          await updateSyncWindow(targetConfig, windowRow.id, {
            status: 'failed',
            error_message: error instanceof Error ? error.message : String(error),
          })
        }
        throw error
      }
    }

    if (!args.dryRun) {
      // 전체 window 처리가 끝나면 run 요약과 cursor를 갱신해 다음 실행의 기준점을 남깁니다.
      await updateSyncRun(targetConfig, runId, buildSummaryPatch(summary, 'done'))
      await updateCursor(targetConfig, args, runId, requestedFrom, requestedTo, lastChangedAt, sourceScopeSupport)
    }

    console.log(`[naver-sync] completed windows=${completedWindows}/${windows.length}`)
    console.log(JSON.stringify(summary, null, 2))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    const status = completedWindows > 0 ? 'partial' : 'failed' // 일부 window만 성공했으면 partial, 처음부터 실패면 failed
    if (!args.dryRun) {
      await updateSyncRun(targetConfig, runId, buildSummaryPatch(summary, status, reason))
    }
    throw error
  }
}

const isDirectRun = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href // 현재 파일을 직접 실행한 경우인지 여부

if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}

export {
  buildNaverConfig,
  fetchNaverAccessToken,
  parseArgs,
}
