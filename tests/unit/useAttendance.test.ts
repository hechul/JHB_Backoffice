import { describe, expect, it } from 'vitest'
import { calcWorkSessionMinutes } from '../../app/composables/useAttendance'

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
})
