import {
  describeMonthFilterLock,
  releaseMonthFilterLock,
  tryAcquireMonthFilterLock,
} from '../../utils/filter/monthFilterLock.ts'

interface FilterLockBody {
  month?: unknown
  action?: unknown
  token?: unknown
  owner?: unknown
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const body = (await readBody<FilterLockBody>(event).catch(() => ({}))) || {}
  const action = normalizeString(body.action || 'acquire')
  const month = normalizeString(body.month)

  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw createError({
      statusCode: 400,
      message: 'month는 YYYY-MM 형식이어야 합니다.',
    })
  }

  if (action === 'release') {
    return {
      ok: releaseMonthFilterLock({
        month,
        token: normalizeString(body.token),
      }),
    }
  }

  if (action !== 'acquire') {
    throw createError({
      statusCode: 400,
      message: `지원하지 않는 action 입니다: ${action}`,
    })
  }

  const attempt = tryAcquireMonthFilterLock({
    month,
    owner: normalizeString(body.owner || '수동 필터링'),
  })

  if (!attempt.acquired) {
    const lock = attempt.lock || describeMonthFilterLock(month)
    throw createError({
      statusCode: 409,
      message: lock
        ? `${month} 필터링이 이미 실행 중입니다. (${lock.owner})`
        : `${month} 필터링이 이미 실행 중입니다.`,
      data: lock,
    })
  }

  return {
    ok: true,
    token: attempt.lock.token,
    owner: attempt.lock.owner,
    startedAt: attempt.lock.startedAt,
    expiresAt: attempt.lock.expiresAt,
  }
})
