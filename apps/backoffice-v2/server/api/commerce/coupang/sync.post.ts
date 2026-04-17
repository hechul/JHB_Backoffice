import { existsSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serverSupabaseUser } from '#supabase/server'

interface CoupangSyncRequestBody {
  start?: unknown
  end?: unknown
  from?: unknown
  to?: unknown
  dryRun?: unknown
  accountKey?: unknown
  runType?: unknown
  requestedByAccountId?: unknown
  fulfillmentType?: unknown
  maxPerPage?: unknown
  requestIntervalMs?: unknown
  maxRetries?: unknown
  retryBaseDelayMs?: unknown
}

interface ScriptResult {
  code: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  durationMs: number
}

function resolveAppRoot() {
  const fileBase = fileURLToPath(new URL('.', import.meta.url))
  const candidates = [
    resolve(process.cwd()),
    resolve(process.cwd(), 'apps', 'backoffice-v2'),
    resolve(fileBase, '../../../../'),
    resolve(fileBase, '../../../../../'),
    resolve(fileBase, '../../../../../../'),
  ]

  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, 'scripts', 'sync-coupang-orders.mjs'))) {
      return candidate
    }
  }

  return resolve(process.cwd(), 'apps', 'backoffice-v2')
}

const APP_ROOT = resolveAppRoot()
const SYNC_SCRIPT_PATH = resolve(APP_ROOT, 'scripts', 'sync-coupang-orders.mjs')
const APP_ENV_PATH = resolve(APP_ROOT, '.env')

function normalizeString(value: unknown): string {
  return String(value ?? '').trim()
}

function parseBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  const normalized = normalizeString(value).toLowerCase()
  if (!normalized) return fallback
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false
  return fallback
}

function parsePositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(normalizeString(value), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function validateDateInput(value: string, fieldLabel: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw createError({
      statusCode: 400,
      message: `${fieldLabel}은 YYYY-MM-DD 형식이어야 합니다.`,
    })
  }
}

function readEnvFileMap(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {}
  const content = readFileSync(filePath, 'utf8')
  const env: Record<string, string> = {}

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eqIndex = line.indexOf('=')
    if (eqIndex < 0) continue
    const key = line.slice(0, eqIndex).trim()
    let value = line.slice(eqIndex + 1).trim()
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

function validateRequiredEnv(dryRun: boolean) {
  const missing: string[] = []
  const fileEnv = readEnvFileMap(APP_ENV_PATH)
  const getEnv = (name: string) => normalizeString(process.env[name] || fileEnv[name])

  const vendorId = getEnv('COUPANG_VENDOR_ID')
  const accessKey = getEnv('COUPANG_ACCESS_KEY')
  const secretKey = getEnv('COUPANG_SECRET_KEY')

  if (!vendorId) missing.push('COUPANG_VENDOR_ID')
  if (!accessKey) missing.push('COUPANG_ACCESS_KEY')
  if (!secretKey) missing.push('COUPANG_SECRET_KEY')

  if (!dryRun) {
    const supabaseUrl = getEnv('NUXT_PUBLIC_SUPABASE_URL')
    const serviceKey = getEnv('SUPABASE_SERVICE_KEY')
    if (!supabaseUrl) missing.push('NUXT_PUBLIC_SUPABASE_URL')
    if (!serviceKey) missing.push('SUPABASE_SERVICE_KEY')
  }

  if (missing.length > 0) {
    throw createError({
      statusCode: 500,
      message: `필수 환경변수가 누락되었습니다: ${missing.join(', ')}`,
      data: { missing },
    })
  }
}

function extractFinalJson(stdout: string): Record<string, any> | null {
  const trimmed = String(stdout || '').trimEnd()
  if (!trimmed) return null

  const braceIndex = trimmed.lastIndexOf('\n{')
  const candidate = braceIndex >= 0
    ? trimmed.slice(braceIndex + 1)
    : (trimmed.startsWith('{') ? trimmed : '')

  if (!candidate) return null

  try {
    const parsed = JSON.parse(candidate)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function extractScriptFailureMessage(stdout: string, stderr: string): string {
  const candidates = [...String(stderr || '').split(/\r?\n/), ...String(stdout || '').split(/\r?\n/)]
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('{') && !line.startsWith('}'))

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const line = candidates[index]
    if (
      line.toLowerCase().includes('error')
      || line.toLowerCase().includes('failed')
      || line.includes('requires')
      || line.includes('누락')
      || line.includes('찾을 수 없습니다')
    ) {
      return line
    }
  }

  return candidates[candidates.length - 1] || '쿠팡 주문 동기화에 실패했습니다.'
}

function runNodeScript(scriptPath: string, args: string[], cwd: string): Promise<ScriptResult> {
  return new Promise((resolveResult, reject) => {
    const startedAt = Date.now()
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', reject)
    child.on('close', (code, signal) => {
      resolveResult({
        code,
        signal,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
      })
    })
  })
}

export default defineEventHandler(async (event) => {
  const body = (await readBody<CoupangSyncRequestBody>(event).catch(() => ({}))) || {}
  const authUser = await serverSupabaseUser(event).catch(() => null)

  if (!process.dev && !authUser) {
    throw createError({ statusCode: 401, message: '로그인한 사용자만 쿠팡 주문 동기화를 실행할 수 있습니다.' })
  }

  const start = normalizeString(body.start || body.from)
  const end = normalizeString(body.end || body.to)
  if (!start) throw createError({ statusCode: 400, message: 'start 값이 필요합니다.' })
  if (!end) throw createError({ statusCode: 400, message: 'end 값이 필요합니다.' })
  validateDateInput(start, 'start')
  validateDateInput(end, 'end')
  if (start > end) {
    throw createError({ statusCode: 400, message: '종료일은 시작일보다 빠를 수 없습니다.' })
  }

  const dryRun = parseBoolean(body.dryRun, false)
  const accountKey = normalizeString(body.accountKey) || 'default'
  const runType = normalizeString(body.runType) || 'manual_sync'
  const requestedByAccountId = normalizeString(body.requestedByAccountId) || normalizeString(authUser?.id)
  const fulfillmentType = normalizeString(body.fulfillmentType) || 'all'
  const maxPerPage = parsePositiveInteger(body.maxPerPage, 50)
  const requestIntervalMs = parsePositiveInteger(body.requestIntervalMs, 1200)
  const maxRetries = parsePositiveInteger(body.maxRetries, 5)
  const retryBaseDelayMs = parsePositiveInteger(body.retryBaseDelayMs, 10000)

  if (!['manual_sync', 'backfill', 'incremental'].includes(runType)) {
    throw createError({ statusCode: 400, message: `지원하지 않는 runType 입니다: ${runType}` })
  }
  if (!['all', 'marketplace', 'rocket_growth'].includes(fulfillmentType)) {
    throw createError({ statusCode: 400, message: `지원하지 않는 fulfillmentType 입니다: ${fulfillmentType}` })
  }

  validateRequiredEnv(dryRun)

  if (!existsSync(SYNC_SCRIPT_PATH)) {
    throw createError({
      statusCode: 500,
      message: '쿠팡 주문 동기화 스크립트를 찾을 수 없습니다.',
    })
  }

  const args = [
    `--from=${start}`,
    `--to=${end}`,
    `--account-key=${accountKey}`,
    `--run-type=${runType}`,
    `--fulfillment-type=${fulfillmentType}`,
    `--max-per-page=${maxPerPage}`,
    `--request-interval-ms=${requestIntervalMs}`,
    `--max-retries=${maxRetries}`,
    `--retry-base-delay-ms=${retryBaseDelayMs}`,
    `--env=${APP_ENV_PATH}`,
  ]

  if (requestedByAccountId) {
    args.push(`--requested-by-account-id=${requestedByAccountId}`)
  }
  if (dryRun) {
    args.push('--dry-run')
  }

  const result = await runNodeScript(SYNC_SCRIPT_PATH, args, APP_ROOT)
  const summary = extractFinalJson(result.stdout)
  const ok = result.code === 0

  if (!ok) {
    const failureMessage = extractScriptFailureMessage(result.stdout, result.stderr)
    throw createError({
      statusCode: 500,
      message: failureMessage,
      data: {
        dryRun,
        start,
        end,
        accountKey,
        runType,
        requestedByAccountId: requestedByAccountId || null,
        fulfillmentType,
        maxPerPage,
        requestIntervalMs,
        maxRetries,
        retryBaseDelayMs,
        exitCode: result.code,
        signal: result.signal,
        summary,
        stdout: result.stdout,
        stderr: result.stderr,
      },
    })
  }

  return {
    ok: true,
    dryRun,
    start,
    end,
    accountKey,
    runType,
    requestedByAccountId: requestedByAccountId || null,
    fulfillmentType,
    maxPerPage,
    requestIntervalMs,
    maxRetries,
    retryBaseDelayMs,
    scriptPath: SYNC_SCRIPT_PATH,
    exitCode: result.code,
    signal: result.signal,
    durationMs: result.durationMs,
    summary,
    stdout: result.stdout,
    stderr: result.stderr,
  }
})
