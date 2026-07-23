/**
 * MemberGrid — 칸 클릭 가능 규칙 (P0/P2).
 *
 * 새 규칙: 유효 구간이 1분이라도 있으면 예약 가능, 0분이면 예약 불가.
 * 죽은(0분) 예약 칸은 빗금으로 표시되고 클릭해 제거만 가능하다.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { buildScheduleModel, computeBookingIssues } from '../model'
import MemberGrid from './MemberGrid'

/** 민재: 종일 가능 + 팀연습 13~14 → 13시 칸은 죽은 예약.
 *  지수: ~13:05 → 13시 칸 유효 5분(빈 칸), 14시 칸 유효 0분(빈 칸). */
function makeModel() {
  return buildScheduleModel(
    {
      ok: true,
      settings: { startDate: '2026-07-25', startHour: 9, endHour: 22 },
      dates: ['8/1', '8/2'],
      availability: {
        민재: { '8/1': 'O', '8/2': 'O' },
        지수: { '8/1': '~13:05', '8/2': 'O' },
      },
    },
    {
      ok: true,
      teamRows: [['8/1', '13', '14', '곡A', '', '민재']],
      bookings: [],
    },
  )
}

function renderGrid(bookings: string[], onToggle = vi.fn()) {
  const model = makeModel()
  const issues = computeBookingIssues(model, bookings)
  render(
    <MemberGrid
      startHour={model.startHour}
      endHour={model.endHour}
      dateKey="8/1"
      memberDays={model.days.get('8/1')!}
      bookings={new Set(bookings)}
      deadKeys={issues.deadKeys}
      cumMinutes={new Map()}
      isAdmin
      songColors={{}}
      onToggle={onToggle}
    />,
  )
  return { onToggle }
}

describe('MemberGrid — 클릭 규칙', () => {
  it('죽은(유효 0분) 예약 칸은 빗금 표시 + 클릭해 제거 가능 (P2)', () => {
    const { onToggle } = renderGrid(['8/1|13|민재'])
    const cell = screen.getByRole('button', {
      name: '민재 13시 칸 — 예약됨(유효 구간 소멸), 클릭해 제거',
    })
    expect(cell).toBeEnabled()
    expect(cell.className).toContain('stale-hatch')
    fireEvent.click(cell)
    // remove 액션 전송은 useBookings.test 가 검증 — 여기선 토글 호출까지
    expect(onToggle).toHaveBeenCalledWith('8/1|13|민재')
  })

  it('유효 5분인 빈 칸도 클릭해 예약 가능 (P0 새 규칙)', () => {
    const { onToggle } = renderGrid([])
    const cell = screen.getByRole('button', { name: '지수 13시 칸 — 유효 5분' })
    expect(cell).toBeEnabled()
    fireEvent.click(cell)
    expect(onToggle).toHaveBeenCalledWith('8/1|13|지수')
  })

  it('유효 0분인 빈 칸은 클릭해도 아무 일도 일어나지 않음', () => {
    const { onToggle } = renderGrid([])
    const cell = screen.getByRole('button', { name: '지수 14시 칸 — 예약 불가' })
    expect(cell).toBeDisabled()
    fireEvent.click(cell)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('유효 구간이 남은(20분) 예약 칸은 죽은 예약이 아님 — 정상 예약 표시 (P2)', () => {
    // 민재 14시 칸: 팀연습 없음, 종일 가능 → 정상. 13시 칸만 dead.
    renderGrid(['8/1|13|민재', '8/1|14|민재'])
    const alive = screen.getByRole('button', {
      name: '민재 14시 칸 — 갠연 예약됨',
    })
    expect(alive.className).not.toContain('stale-hatch')
  })
})
