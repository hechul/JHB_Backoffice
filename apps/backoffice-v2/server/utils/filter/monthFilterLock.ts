import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import crypto from 'node:crypto'
import { resolve } from 'node:path'

const LOCK_DIR = resolve(process.cwd(), '.tmp', 'filter-locks')
const DEFAULT_LOCK_TTL_MS = 1000 * 60 * 30

export interface MonthFilterLockInfo {
  month: string
  token: string
  owner: string
  startedAt: string
  expiresAt: string
}

function ensureLockDir() {
  mkdirSync(LOCK_DIR, { recursive: true })
}

function lockPath(month: string) {
  return resolve(LOCK_DIR, `${month}.json`)
}

function readLock(month: string): MonthFilterLockInfo | null {
  try {
    const parsed = JSON.parse(readFileSync(lockPath(month), 'utf8'))
    if (!parsed || typeof parsed !== 'object') return null
    return {
      month: String(parsed.month || month),
      token: String(parsed.token || ''),
      owner: String(parsed.owner || 'unknown'),
      startedAt: String(parsed.startedAt || ''),
      expiresAt: String(parsed.expiresAt || ''),
    }
  } catch {
    return null
  }
}

function isExpired(lock: MonthFilterLockInfo | null, now = Date.now()): boolean {
  if (!lock?.expiresAt) return true
  const expiresAt = new Date(lock.expiresAt).getTime()
  return !Number.isFinite(expiresAt) || expiresAt <= now
}

function removeLockFile(month: string) {
  rmSync(lockPath(month), { force: true })
}

function normalizeMonth(value: unknown): string {
  const month = String(value || '').trim()
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error(`유효하지 않은 target_month 입니다: ${month}`)
  }
  return month
}

export function describeMonthFilterLock(month: string): MonthFilterLockInfo | null {
  const normalizedMonth = normalizeMonth(month)
  const current = readLock(normalizedMonth)
  if (!current) return null
  if (isExpired(current)) {
    removeLockFile(normalizedMonth)
    return null
  }
  return current
}

export function tryAcquireMonthFilterLock(input: {
  month: string
  owner: string
  ttlMs?: number
}): { acquired: true; lock: MonthFilterLockInfo } | { acquired: false; lock: MonthFilterLockInfo | null } {
  const month = normalizeMonth(input.month)
  const owner = String(input.owner || 'unknown')
  const ttlMs = Math.max(1000, Number(input.ttlMs || DEFAULT_LOCK_TTL_MS))
  ensureLockDir()

  const existing = describeMonthFilterLock(month)
  if (existing) {
    return { acquired: false, lock: existing }
  }

  const now = Date.now()
  const lock: MonthFilterLockInfo = {
    month,
    token: crypto.randomUUID(),
    owner,
    startedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
  }

  try {
    writeFileSync(lockPath(month), JSON.stringify(lock, null, 2), { flag: 'wx' })
    return { acquired: true, lock }
  } catch {
    const current = describeMonthFilterLock(month)
    return { acquired: false, lock: current }
  }
}

export function releaseMonthFilterLock(input: {
  month: string
  token: string
}): boolean {
  const month = normalizeMonth(input.month)
  const current = readLock(month)
  if (!current) return false
  if (current.token !== String(input.token || '').trim()) return false
  removeLockFile(month)
  return true
}
