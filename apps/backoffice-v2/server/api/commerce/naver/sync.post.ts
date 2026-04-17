// =====================================================================
// server/api/commerce/naver/sync.post.ts
// 역할: 백오피스 UI → 네이버 주문 동기화 실행을 연결하는 Nitro API 엔드포인트
// 경로: POST /api/commerce/naver/sync
// 왜 필요: 브라우저(NaverSyncPanel.vue)에서 동기화 버튼을 누르면 이 API가 호출된다.
//          이 파일이 sync-naver-orders.mjs CLI를 자식 프로세스로 실행하고
//          결과를 JSON으로 클라이언트에 돌려준다.
//          동기화 완료 후 영향받은 월에 대해 체험단 필터도 자동으로 재실행한다.
// =====================================================================

import { existsSync, readFileSync } from 'node:fs'       // 파일 존재 확인 + 읽기 (env 파일 파싱용)
import { spawn } from 'node:child_process'               // 자식 프로세스 비동기 실행 (스크립트 실행용)
import { resolve } from 'node:path'                       // 절대 경로 생성
import { serverSupabaseUser } from '#supabase/server'     // Supabase 인증 사용자 조회 (로그인 확인용)
import {
  findMonthsWithExperiences,    // 체험단 데이터가 있는 월 목록 조회
  normalizeTargetMonths,         // target_month 문자열 배열 정규화
  runMonthlyFilter,              // 월별 체험단 필터 실행 (체험단 없는 월용 인라인 실행)
} from '../../../utils/filter/runMonthlyFilter.ts'
import {
  releaseMonthFilterLock,       // 월별 필터 실행 잠금 해제
  tryAcquireMonthFilterLock,    // 월별 필터 실행 잠금 획득 시도 (동시 실행 방지)
} from '../../../utils/filter/monthFilterLock.ts'

// =====================================================================
// 타입 정의
// =====================================================================

// POST 바디로 받는 파라미터 타입 — from/start, to/end 둘 다 허용
interface NaverSyncRequestBody {
  start?: unknown              // 동기화 시작일 (YYYY-MM-DD)
  end?: unknown                // 동기화 종료일 (YYYY-MM-DD)
  from?: unknown               // start의 별칭 (동일 용도)
  to?: unknown                 // end의 별칭 (동일 용도)
  dryRun?: unknown             // true면 DB 저장 없이 시뮬레이션만 수행
  accountKey?: unknown         // 네이버 계정 구분 키 (기본 'default')
  runType?: unknown            // 실행 유형: manual_sync | backfill | incremental
  requestedByAccountId?: unknown // 실행 요청자 ID (감사 추적용)
  limitCount?: unknown         // 상태변경 조회 page size (기본 300)
  detailBatchSize?: unknown    // 상세조회 배치 크기 (기본 300)
}

// 자식 프로세스(sync script) 실행 결과 타입
interface ScriptResult {
  code: number | null           // 프로세스 종료 코드 (0 = 성공)
  signal: NodeJS.Signals | null // 비정상 종료 시 시그널 (SIGTERM 등)
  stdout: string                // 표준 출력 (sync 결과 JSON 포함)
  stderr: string                // 표준 에러 (에러 메시지)
  durationMs: number            // 실행 소요 시간 (밀리초)
}

// 동기화 후 자동 재필터 실행 결과 타입
// 동기화로 새 주문이 들어오면 해당 월의 체험단 필터를 다시 돌려야 한다
interface BackgroundRefilterResult {
  affectedMonths: string[]  // 동기화로 영향받은 월 목록
  queuedMonths: string[]    // 체험단 있어서 백그라운드 재필터 예약된 월
  resetMonths: string[]     // 체험단 없어서 인라인으로 바로 정리된 월
  skippedMonths: string[]   // 잠금 실패 또는 오류로 건너뛴 월
  status: 'not_requested' | 'queued' | 'no_experience_months' | 'schedule_failed'
  errorMessage: string | null
}

// =====================================================================
// 경로 상수
// =====================================================================

const APP_ROOT = resolve(process.cwd())                                   // 앱 루트 디렉터리
const SYNC_SCRIPT_PATH = resolve(APP_ROOT, 'scripts', 'sync-naver-orders.mjs')    // 동기화 CLI 스크립트 경로
const FILTER_SCRIPT_PATH = resolve(APP_ROOT, 'scripts', 'run-filter-months.ts')   // 필터 재실행 스크립트 경로
const APP_ENV_PATH = resolve(APP_ROOT, '.env')                             // 환경변수 파일 경로

// =====================================================================
// 유틸 함수
// =====================================================================

// unknown 타입 값을 안전하게 문자열로 변환 + 공백 제거
function normalizeString(value: unknown): string {
  return String(value ?? '').trim()
}

// unknown 값을 boolean으로 파싱 — '1', 'true', 'yes', 'y', 'on' → true
function parseBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  const normalized = normalizeString(value).toLowerCase()
  if (!normalized) return fallback
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false
  return fallback
}

// unknown 값을 양의 정수로 파싱 — 실패 시 fallback 반환
function parsePositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(normalizeString(value), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

// process.env에서 필수 환경변수를 읽고 없으면 500 에러를 던진다
function requireEnvValue(name: string): string {
  const value = normalizeString(process.env[name])
  if (!value) {
    throw createError({
      statusCode: 500,
      message: `${name} 환경변수가 설정되지 않았습니다.`,
    })
  }
  return value
}

/**
 * .env 파일을 파싱해 key=value 맵을 반환한다.
 * 이유: Nitro 서버가 실행될 때 process.env에 없는 변수라도
 *       .env 파일에 있으면 sync 스크립트에서 읽을 수 있어야 한다.
 *       주석(#) 라인과 빈 줄은 무시하고, 따옴표는 벗겨낸다.
 */
function readEnvFileMap(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {} // 파일 없으면 빈 맵 반환
  const content = readFileSync(filePath, 'utf8') // 파일 전체 읽기
  const env: Record<string, string> = {}

  for (const rawLine of content.split(/\r?\n/)) { // 줄 단위로 분리 (Windows 줄바꿈 포함)
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue // 빈 줄, 주석 건너뜀
    const eqIndex = line.indexOf('=')           // '=' 위치로 key/value 분리
    if (eqIndex < 0) continue                   // '=' 없으면 유효하지 않은 줄
    const key = line.slice(0, eqIndex).trim()
    let value = line.slice(eqIndex + 1).trim()
    // 따옴표로 감싸진 값이면 따옴표 제거
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }

  return env
}

/**
 * 동기화 실행 전 필수 환경변수가 모두 설정됐는지 검증한다.
 * process.env와 .env 파일을 합쳐서 확인하므로 어느 쪽에 있어도 통과된다.
 * 누락 항목이 있으면 500 에러를 던진다.
 */
function validateRequiredEnv() {
  const missing: string[] = []
  const fileEnv = readEnvFileMap(APP_ENV_PATH) // .env 파일 파싱
  // process.env 우선, 없으면 파일 값 사용
  const getEnv = (name: string) => normalizeString(process.env[name] || fileEnv[name])

  const supabaseUrl = getEnv('NUXT_PUBLIC_SUPABASE_URL')    // Supabase 프로젝트 URL
  const serviceKey = getEnv('SUPABASE_SERVICE_KEY')          // Supabase 서비스 키 (admin 권한)
  const accessToken = getEnv('NAVER_COMMERCE_ACCESS_TOKEN')  // 이미 발급된 네이버 토큰 (있으면 재사용)
  const clientId = getEnv('NAVER_COMMERCE_CLIENT_ID')        // 네이버 API client ID
  const clientSecret = getEnv('NAVER_COMMERCE_CLIENT_SECRET') // 네이버 API client secret
  const tokenType = normalizeString(getEnv('NAVER_COMMERCE_TOKEN_TYPE') || 'SELF').toUpperCase() // SELF 또는 SELLER
  const accountId = getEnv('NAVER_COMMERCE_ACCOUNT_ID')      // SELLER 타입일 때 필요한 계정 ID

  if (!supabaseUrl) missing.push('NUXT_PUBLIC_SUPABASE_URL')
  if (!serviceKey) missing.push('SUPABASE_SERVICE_KEY')

  // access_token이 없는 경우에만 client_id + secret 필요
  if (!accessToken) {
    if (!clientId) missing.push('NAVER_COMMERCE_CLIENT_ID')
    if (!clientSecret) missing.push('NAVER_COMMERCE_CLIENT_SECRET')
    // SELLER 타입이면 account_id도 필수
    if (tokenType === 'SELLER' && !accountId) {
      missing.push('NAVER_COMMERCE_ACCOUNT_ID')
    }
  }

  if (missing.length > 0) {
    throw createError({
      statusCode: 500,
      message: `필수 환경변수가 누락되었습니다: ${missing.join(', ')}`,
      data: { missing },
    })
  }
}

// 날짜 입력값이 YYYY-MM-DD 포맷인지 검증 — 아니면 400 에러
function validateDateInput(value: string, fieldLabel: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw createError({
      statusCode: 400,
      message: `${fieldLabel}은 YYYY-MM-DD 형식이어야 합니다.`,
    })
  }
}

/**
 * sync 스크립트 stdout에서 마지막 JSON 블록을 추출한다.
 * sync-naver-orders.mjs는 실행 완료 시 마지막 줄에 summary JSON을 출력한다.
 * 앞의 로그 줄들을 건너뛰고 마지막 { 로 시작하는 블록만 파싱한다.
 */
function extractFinalJson(stdout: string): Record<string, any> | null {
  const trimmed = String(stdout || '').trimEnd()
  if (!trimmed) return null

  // 마지막 '\n{' 위치를 찾아 그 이후 부분을 JSON 후보로 사용
  const braceIndex = trimmed.lastIndexOf('\n{')
  const candidate = braceIndex >= 0
    ? trimmed.slice(braceIndex + 1)
    : (trimmed.startsWith('{') ? trimmed : '')

  if (!candidate) return null

  try {
    const parsed = JSON.parse(candidate)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null // JSON 파싱 실패 시 null 반환 (에러를 던지지 않음)
  }
}

/**
 * Node.js 스크립트를 자식 프로세스로 실행하고 결과를 Promise로 반환한다.
 * stdout/stderr를 스트리밍으로 수집해 완료 후 한 번에 반환한다.
 * FORCE_COLOR=0으로 ANSI 컬러 코드를 제거해 로그를 파싱하기 쉽게 한다.
 */
function runNodeScript(scriptPath: string, args: string[], cwd: string): Promise<ScriptResult> {
  return new Promise((resolveResult, reject) => {
    const startedAt = Date.now() // 실행 시작 시각 기록
    // process.execPath = 현재 실행 중인 Node.js 바이너리 경로
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd,
      env: {
        ...process.env,  // 현재 프로세스 환경변수 상속
        FORCE_COLOR: '0', // ANSI 컬러 코드 비활성화 (로그 파싱 용이)
      },
      stdio: ['ignore', 'pipe', 'pipe'], // stdin 없음, stdout/stderr 파이프
    })

    let stdout = '' // 표준 출력 누적 버퍼
    let stderr = '' // 표준 에러 누적 버퍼

    // 자식 프로세스 stdout 데이터를 버퍼에 누적
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })

    // 자식 프로세스 stderr 데이터를 버퍼에 누적
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })

    // 자식 프로세스 실행 자체가 실패한 경우 (실행 불가 등)
    child.on('error', (error) => {
      reject(error)
    })

    // 자식 프로세스 종료 시 결과 객체를 resolve
    child.on('close', (code, signal) => {
      resolveResult({
        code,
        signal,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt, // 소요 시간 계산
      })
    })
  })
}

/**
 * 체험단 필터 재실행 스크립트를 백그라운드 프로세스로 실행한다.
 * detached: true + child.unref() 조합으로 부모 프로세스와 완전히 분리된다.
 * 이 함수가 반환되면 필터 스크립트는 독립적으로 실행 중이다.
 *
 * 이유: 체험단 필터는 데이터가 많으면 수십 초 걸릴 수 있다.
 *       동기화 API 응답을 필터 완료까지 기다리지 않고 바로 돌려주기 위해 백그라운드 실행.
 */
function spawnBackgroundFilterProcess(input: {
  months: string[]        // 재필터 실행할 월 목록 (YYYY-MM 형식)
  actorId: string | null  // 실행 요청자 ID (filter_logs 감사용)
}) {
  if (!existsSync(FILTER_SCRIPT_PATH)) {
    throw new Error('월별 필터 재실행 스크립트를 찾을 수 없습니다.')
  }

  const args = [
    '--experimental-strip-types',                   // Node.js에서 TypeScript 직접 실행 플래그
    FILTER_SCRIPT_PATH,                             // 실행할 스크립트 경로
    `--months=${input.months.join(',')}`,            // 재필터 대상 월 목록 (쉼표 구분)
    `--env=${APP_ENV_PATH}`,                         // 환경변수 파일 경로
    '--actor-name=자동 재필터(sync)',                // filter_logs에 기록될 실행자 이름
  ]

  if (input.actorId) {
    args.push(`--actor-id=${input.actorId}`) // 실행 요청자 account ID (있을 때만)
  }

  const child = spawn(process.execPath, args, {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
    },
    detached: true,    // 부모 프로세스 종료 후에도 계속 실행되게 분리
    stdio: 'ignore',   // stdin/stdout/stderr 모두 무시 (백그라운드라 출력 불필요)
  })

  child.unref() // Node.js 이벤트 루프에서 자식 프로세스 참조를 해제 (부모가 자식 완료를 기다리지 않음)
}

// =====================================================================
// API 핸들러 (Nitro defineEventHandler)
// =====================================================================

export default defineEventHandler(async (event) => {
  // 요청 바디 파싱 — 실패해도 빈 객체로 처리
  const body = (await readBody<NaverSyncRequestBody>(event).catch(() => ({}))) || {}

  // start와 from을 동일 의미로 받음 (from이 시맨틱상 더 명확하지만 start도 허용)
  const start = normalizeString(body.start || body.from)
  const end = normalizeString(body.end || body.to)

  // 로그인한 사용자 조회 — 실패해도 null로 처리 (개발 환경 고려)
  const authUser = await serverSupabaseUser(event).catch(() => null)

  // 날짜 필드 필수값 검증
  if (!start) {
    throw createError({ statusCode: 400, message: 'start 값이 필요합니다.' })
  }
  if (!end) {
    throw createError({ statusCode: 400, message: 'end 값이 필요합니다.' })
  }
  validateDateInput(start, 'start')    // YYYY-MM-DD 포맷 확인
  validateDateInput(end, 'end')        // YYYY-MM-DD 포맷 확인
  if (start > end) {
    throw createError({ statusCode: 400, message: '종료일은 시작일보다 빠를 수 없습니다.' })
  }

  // 프로덕션 환경에서는 반드시 로그인 필요 (개발 환경은 로그인 없이도 허용)
  if (!process.dev && !authUser) {
    throw createError({ statusCode: 401, message: '로그인한 사용자만 주문 동기화를 실행할 수 있습니다.' })
  }

  const dryRun = parseBoolean(body.dryRun, false)                           // dry-run 여부
  const accountKey = normalizeString(body.accountKey) || 'default'          // 계정 키
  const runType = normalizeString(body.runType) || 'manual_sync'            // 실행 유형
  // 요청자 ID: 바디에 명시되지 않으면 로그인한 사용자 ID 사용
  const requestedByAccountId = normalizeString(body.requestedByAccountId) || normalizeString(authUser?.id)
  const limitCount = parsePositiveInteger(body.limitCount, 300)             // 상태변경 조회 page size
  const detailBatchSize = parsePositiveInteger(body.detailBatchSize, 300)   // 상세조회 배치 크기

  // 허용된 runType만 실행 가능
  if (!['manual_sync', 'backfill', 'incremental'].includes(runType)) {
    throw createError({ statusCode: 400, message: `지원하지 않는 runType 입니다: ${runType}` })
  }

  // Supabase + 네이버 API 환경변수 사전 검증
  validateRequiredEnv()

  // sync 스크립트 파일이 실제로 존재하는지 확인
  if (!existsSync(SYNC_SCRIPT_PATH)) {
    throw createError({
      statusCode: 500,
      message: '네이버 주문 동기화 스크립트를 찾을 수 없습니다.',
    })
  }

  // sync-naver-orders.mjs에 넘길 CLI 인자 목록 구성
  const args = [
    `--from=${start}`,                      // 동기화 시작일
    `--to=${end}`,                          // 동기화 종료일
    `--account-key=${accountKey}`,          // 계정 키
    `--run-type=${runType}`,                // 실행 유형
    `--limit-count=${limitCount}`,          // page size
    `--detail-batch-size=${detailBatchSize}`, // 배치 크기
    `--env=${APP_ENV_PATH}`,                // env 파일 경로
  ]

  if (requestedByAccountId) {
    args.push(`--requested-by-account-id=${requestedByAccountId}`) // 요청자 ID (있을 때만)
  }

  if (dryRun) {
    args.push('--dry-run') // dry-run 플래그 추가
  }

  // sync 스크립트를 자식 프로세스로 실행하고 완료까지 대기
  const result = await runNodeScript(SYNC_SCRIPT_PATH, args, APP_ROOT)
  // stdout 마지막 JSON 블록에서 sync 요약 정보 추출
  const summary = extractFinalJson(result.stdout)
  const ok = result.code === 0 // 종료 코드 0 = 성공

  if (!ok) {
    // 동기화 실패 시 디버깅에 필요한 모든 정보를 data에 담아 500 에러 반환
    throw createError({
      statusCode: 500,
      message: '네이버 주문 동기화에 실패했습니다.',
      data: {
        dryRun,
        start,
        end,
        accountKey,
        runType,
        requestedByAccountId: requestedByAccountId || null,
        limitCount,
        detailBatchSize,
        exitCode: result.code,
        signal: result.signal,
        summary,
        stdout: result.stdout,
        stderr: result.stderr,
      },
    })
  }

  // 자동 재필터 결과 초기화 (dry-run이거나 영향 월 없으면 이 상태 그대로 반환)
  let backgroundRefilter: BackgroundRefilterResult = {
    affectedMonths: [],
    queuedMonths: [],
    resetMonths: [],
    skippedMonths: [],
    status: 'not_requested',
    errorMessage: null,
  }

  if (!dryRun) {
    // summary.affectedTargetMonths: 동기화로 실제 주문이 변경된 월 목록
    const affectedMonths = normalizeTargetMonths(
      Array.isArray(summary?.affectedTargetMonths) ? summary.affectedTargetMonths : [],
    )

    if (affectedMonths.length > 0) {
      const queuedMonths: string[] = []   // 체험단 있어서 백그라운드 예약된 월
      const resetMonths: string[] = []    // 체험단 없어서 인라인 정리된 월
      const skippedMonths: string[] = []  // 건너뛴 월
      const failureMessages: string[] = [] // 실패 메시지 수집

      try {
        // 어느 월에 체험단(experiences) 데이터가 있는지 조회
        const monthsWithExperiences = await findMonthsWithExperiences(affectedMonths)
        // 체험단 있는 월 → 백그라운드에서 전체 필터 재실행 (무거운 작업)
        queuedMonths.push(...monthsWithExperiences)

        // 체험단 없는 월 → 잠금 획득 후 인라인으로 바로 정리 (가벼운 작업)
        const monthsWithoutExperiences = affectedMonths.filter((month) => !monthsWithExperiences.includes(month))
        for (const month of monthsWithoutExperiences) {
          // 동시 필터 실행 방지를 위해 월별 잠금 획득 시도
          const lock = tryAcquireMonthFilterLock({
            month,
            owner: '자동 정리(sync, 체험단 없음)',
          })
          if (!lock.acquired) {
            // 잠금 획득 실패 = 이미 다른 프로세스가 이 월 필터 실행 중
            skippedMonths.push(month)
            failureMessages.push(`${month}: 자동 정리용 월 잠금을 확보하지 못했습니다.`)
            continue
          }

          try {
            // 체험단 없는 월 필터 실행 (is_fake 초기화 등 간단한 정리)
            await runMonthlyFilter(month, {
              actorName: '자동 정리(sync, 체험단 없음)',
              actorId: requestedByAccountId || null,
            })
            resetMonths.push(month) // 성공적으로 정리된 월 기록
          } catch (error) {
            skippedMonths.push(month)
            failureMessages.push(
              `${month}: ${error instanceof Error ? error.message : String(error)}`,
            )
          } finally {
            // 잠금은 성공/실패 관계없이 반드시 해제
            releaseMonthFilterLock({
              month,
              token: lock.lock.token,
            })
          }
        }

        if (queuedMonths.length > 0) {
          try {
            // 체험단 있는 월은 백그라운드 프로세스로 무거운 필터 실행
            spawnBackgroundFilterProcess({
              months: queuedMonths,
              actorId: requestedByAccountId || null,
            })
          } catch (error) {
            // 백그라운드 실행 실패 시 queued → skipped로 이동
            skippedMonths.push(...queuedMonths)
            queuedMonths.length = 0 // queuedMonths 비우기
            failureMessages.push(error instanceof Error ? error.message : String(error))
          }
        }

        // 재필터 결과 상태 결정
        backgroundRefilter = {
          affectedMonths,
          queuedMonths,
          resetMonths,
          skippedMonths,
          status: failureMessages.length > 0
            ? 'schedule_failed'                             // 일부 실패
            : (queuedMonths.length > 0 ? 'queued' : 'no_experience_months'), // 백그라운드 예약 또는 체험단 없음 정리
          errorMessage: failureMessages.length > 0 ? failureMessages.join(' | ') : null,
        }
      } catch (error) {
        // findMonthsWithExperiences 등 전체 재필터 흐름 실패
        backgroundRefilter = {
          affectedMonths,
          queuedMonths: [],
          resetMonths: [],
          skippedMonths: affectedMonths, // 영향받은 월 전체를 skipped 처리
          status: 'schedule_failed',
          errorMessage: error instanceof Error ? error.message : String(error),
        }
      }
    }
  }

  // 성공 응답 반환 — UI(NaverSyncPanel.vue)에서 이 데이터를 사용해 결과를 표시한다
  return {
    ok: true,
    dryRun,
    start,
    end,
    accountKey,
    runType,
    requestedByAccountId: requestedByAccountId || null,
    limitCount,
    detailBatchSize,
    scriptPath: SYNC_SCRIPT_PATH,          // 실행된 스크립트 경로 (디버깅용)
    exitCode: result.code,                 // 자식 프로세스 종료 코드
    signal: result.signal,                 // 비정상 종료 시 시그널
    durationMs: result.durationMs,         // 실행 소요 시간 (밀리초)
    summary,                               // sync-naver-orders.mjs 최종 summary JSON
    backgroundRefilter,                    // 자동 재필터 실행 결과
    stdout: result.stdout,                 // 전체 stdout (로그 표시용)
    stderr: result.stderr,                 // 전체 stderr (에러 표시용)
  }
})
