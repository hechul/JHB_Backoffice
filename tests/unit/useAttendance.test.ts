import { describe, expect, it } from 'vitest'
import {
  applyDateToDateTimeLocalValue,
  calcWorkSessionMinutes,
  getDateKeyFromDateTimeLocalValue,
  shiftIsoToDateKey,
} from '../../app/composables/useAttendance'

describe('useAttendance', () => {
  it('applies admin-adjusted check-in time to session-based work minutes', () => {
    const minutes = calcWorkSessionMinutes(
      [
        {
          id: 1,
          record_id: 10,
          user_id: 'user-1',
          work_date: '2026-03-16',
          started_at: '2026-03-16T01:00:00.000Z',
          ended_at: '2026-03-16T09:00:00.000Z',
          created_at: '2026-03-16T01:00:00.000Z',
          updated_at: '2026-03-16T09:00:00.000Z',
        },
      ],
      {
        overrideStartAt: '2026-03-16T00:00:00.000Z',
        overrideEndAt: '2026-03-16T09:00:00.000Z',
      },
    )

    expect(minutes).toBe(540)
  })

  it('keeps break gaps while applying admin-adjusted start/end overrides', () => {
    const minutes = calcWorkSessionMinutes(
      [
        {
          id: 1,
          record_id: 11,
          user_id: 'user-1',
          work_date: '2026-03-16',
          started_at: '2026-03-16T01:00:00.000Z',
          ended_at: '2026-03-16T03:00:00.000Z',
          created_at: '2026-03-16T01:00:00.000Z',
          updated_at: '2026-03-16T03:00:00.000Z',
        },
        {
          id: 2,
          record_id: 11,
          user_id: 'user-1',
          work_date: '2026-03-16',
          started_at: '2026-03-16T04:00:00.000Z',
          ended_at: '2026-03-16T09:00:00.000Z',
          created_at: '2026-03-16T04:00:00.000Z',
          updated_at: '2026-03-16T09:00:00.000Z',
        },
      ],
      {
        overrideStartAt: '2026-03-16T00:00:00.000Z',
        overrideEndAt: '2026-03-16T08:00:00.000Z',
      },
    )

    expect(minutes).toBe(420)
  })

  it('applies a selected date to local datetime values while keeping the time', () => {
    expect(applyDateToDateTimeLocalValue('2026-03-16T09:30', '2026-03-20')).toBe('2026-03-20T09:30')
    expect(getDateKeyFromDateTimeLocalValue('2026-03-20T09:30')).toBe('2026-03-20')
  })

  it('shifts iso timestamps to a new work date while keeping the local time', () => {
    expect(shiftIsoToDateKey('2026-03-16T00:30:00.000Z', '2026-03-20')).toBe('2026-03-20T00:30:00.000Z')
  })
})
