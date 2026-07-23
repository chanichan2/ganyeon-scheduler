import { describe, expect, it } from 'vitest'
import {
  buildScheduleModel,
  computeBookingIssues,
  cumulativeMinutesByDate,
  cumulativeMinutesByMember,
} from './model'
import type { GanyeonPayload, SurveyPayload } from './types'

function makeSurvey(
  availability: Record<string, Record<string, string>>,
): SurveyPayload {
  return {
    ok: true,
    settings: { startDate: '2026-07-25', startHour: 9, endHour: 22 },
    dates: ['8/1', '8/2'],
    availability,
  }
}

function makeGanyeon(
  teamRows: string[][] = [],
  bookings: string[] = [],
): GanyeonPayload {
  return { ok: true, teamRows, bookings }
}

describe('buildScheduleModel — 기본 조립', () => {
  it('명단은 availability 키가 진실 — ko 정렬', () => {
    const model = buildScheduleModel(
      makeSurvey({
        하늘: { '8/1': 'O' },
        가온: { '8/1': 'X' },
      }),
      makeGanyeon(),
    )
    expect(model.roster).toEqual(['가온', '하늘'])
    expect(model.hours).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21])
  })

  it('가용시간 파싱 실패 셀 → 불가능 처리 + 경고 (부원|날짜|raw|사유)', () => {
    const model = buildScheduleModel(
      makeSurvey({ 민재: { '8/1': '13~15~17', '8/2': 'O' } }),
      makeGanyeon(),
    )
    const w = model.warnings.filter((w) => w.kind === 'availability-parse')
    expect(w).toHaveLength(1)
    expect(w[0].message).toContain('민재')
    expect(w[0].message).toContain('8/1')
    expect(w[0].message).toContain('13~15~17')
    // 실패 셀은 추정하지 않고 불가능 처리
    const md = model.days.get('8/1')!.find((m) => m.name === '민재')!
    expect(md.parseFailed).toBe(true)
    expect(md.avail.ranges).toEqual([])
    expect(md.cells.every((c) => c.total === 0)).toBe(true)
  })

  it('팀연습 구간이 칸 유효 구간에서 빠진다', () => {
    const model = buildScheduleModel(
      makeSurvey({ 민재: { '8/1': 'O', '8/2': 'O' } }),
      makeGanyeon([['8/1', '16:45', '18', '곡A', '', '민재']]),
    )
    const md = model.days.get('8/1')!.find((m) => m.name === '민재')!
    const c16 = md.cells.find((c) => c.hour === 16)!
    expect(c16.slices).toEqual([[960, 1005]])
    expect(c16.total).toBe(45)
    const c17 = md.cells.find((c) => c.hour === 17)!
    expect(c17.total).toBe(0)
  })

  it('settings 시간 범위가 잘못되면 throw (화면은 오류 상태)', () => {
    const bad = makeSurvey({ 민재: { '8/1': 'O' } })
    bad.settings = { ...bad.settings, startHour: 22, endHour: 9 }
    expect(() => buildScheduleModel(bad, makeGanyeon())).toThrow()
  })
})

describe('computeBookingIssues — booking 대조 (조용히 지우지 않는다)', () => {
  it('명단에 없는 이름의 booking → name-mismatch 경고', () => {
    const model = buildScheduleModel(
      makeSurvey({ 민재: { '8/1': 'O' } }),
      makeGanyeon(),
    )
    const { warnings } = computeBookingIssues(model, ['8/1|13|유령'])
    expect(warnings).toHaveLength(1)
    expect(warnings[0].kind).toBe('name-mismatch')
    expect(warnings[0].message).toContain('유령')
  })

  it('기간/시간 범위 밖 booking → stale-booking 경고', () => {
    const model = buildScheduleModel(
      makeSurvey({ 민재: { '8/1': 'O' } }),
      makeGanyeon(),
    )
    const { warnings } = computeBookingIssues(model, [
      '9/9|13|민재',
      '8/1|23|민재',
      '이상한키',
    ])
    expect(warnings).toHaveLength(3)
    expect(warnings.every((w) => w.kind === 'stale-booking')).toBe(true)
  })

  it('유효 구간이 완전히 사라진(0분) booking → deadKeys + 경고', () => {
    // 예약 당시엔 가능했지만 이후 팀연습이 13~15 를 전부 덮은 상황
    const model = buildScheduleModel(
      makeSurvey({ 민재: { '8/1': 'O', '8/2': 'O' } }),
      makeGanyeon([['8/1', '13', '15', '곡A', '', '민재']]),
    )
    const { warnings, deadKeys } = computeBookingIssues(model, ['8/1|13|민재'])
    expect(deadKeys.has('8/1|13|민재')).toBe(true)
    const w = warnings.filter((x) => x.kind === 'stale-booking')
    expect(w).toHaveLength(1)
    expect(w[0].message).toContain('사라졌어요')
  })

  it('유효 구간이 줄었지만 남아 있으면(20분) 죽은 예약이 아니고 경고도 없음', () => {
    // P2 재현: 민재 O, 13시 칸 예약 후 팀연습 13~13:40 이 붙여넣어짐 → 유효 20분
    const model = buildScheduleModel(
      makeSurvey({ 민재: { '8/1': 'O', '8/2': 'O' } }),
      makeGanyeon([['8/2', '13', '13:40', '곡A', '', '민재']]),
    )
    const { warnings, deadKeys } = computeBookingIssues(model, [
      '8/2|13|민재',
      '8/2|14|민재',
    ])
    expect(deadKeys.size).toBe(0)
    expect(warnings).toEqual([])
  })

  it('정상 booking 은 경고 없음', () => {
    const model = buildScheduleModel(
      makeSurvey({ 민재: { '8/1': 'O' } }),
      makeGanyeon(),
    )
    const { warnings, deadKeys } = computeBookingIssues(model, ['8/1|13|민재'])
    expect(warnings).toEqual([])
    expect(deadKeys.size).toBe(0)
  })
})

describe('cumulativeMinutesByMember — 누적 갠연 시간', () => {
  it('민재 예시 — 2칸 클릭이지만 유효 합계 1시간 30분', () => {
    const model = buildScheduleModel(
      makeSurvey({ 민재: { '8/1': '~14:30', '8/2': 'O' } }),
      makeGanyeon(),
    )
    const cum = cumulativeMinutesByMember(model, ['8/1|13|민재', '8/1|14|민재'])
    expect(cum.get('민재')).toBe(90)
  })

  it('전체 기간 누적 — 여러 날짜 합산', () => {
    const model = buildScheduleModel(
      makeSurvey({ 민재: { '8/1': 'O', '8/2': 'O' } }),
      makeGanyeon(),
    )
    const cum = cumulativeMinutesByMember(model, [
      '8/1|13|민재',
      '8/2|13|민재',
      '8/2|14|민재',
    ])
    expect(cum.get('민재')).toBe(180)
  })

  it('매칭 안 되는 booking 은 누적에서 제외', () => {
    const model = buildScheduleModel(
      makeSurvey({ 민재: { '8/1': 'O' } }),
      makeGanyeon(),
    )
    const cum = cumulativeMinutesByMember(model, ['9/9|13|민재', '8/1|13|유령'])
    expect(cum.size).toBe(0)
  })

  it('유효 20분으로 줄어든 예약도 실제 분만큼 누적에 포함 (P2: 총 80분)', () => {
    const model = buildScheduleModel(
      makeSurvey({ 민재: { '8/1': 'O', '8/2': 'O' } }),
      makeGanyeon([['8/2', '13', '13:40', '곡A', '', '민재']]),
    )
    const cum = cumulativeMinutesByMember(model, ['8/2|13|민재', '8/2|14|민재'])
    expect(cum.get('민재')).toBe(80) // 20 + 60
  })
})

describe('cumulativeMinutesByDate — 날짜별 유효 분 합계 (캡션용)', () => {
  it('칸 수가 아니라 유효 분 합계 — 30분 칸 하나면 30', () => {
    const model = buildScheduleModel(
      makeSurvey({ 민재: { '8/1': '~13:30', '8/2': 'O' } }),
      makeGanyeon(),
    )
    const byDate = cumulativeMinutesByDate(model, ['8/1|13|민재', '8/2|10|민재'])
    expect(byDate.get('8/1')).toBe(30)
    expect(byDate.get('8/2')).toBe(60)
  })

  it('여러 부원 합산 + 죽은(0분) 예약은 제외', () => {
    // 지수의 13시 칸은 팀연습 13~14 에 전부 먹혀 0분 → 날짜 합계에 미포함
    const model = buildScheduleModel(
      makeSurvey({ 민재: { '8/1': 'O', '8/2': 'O' }, 지수: { '8/1': 'O', '8/2': 'O' } }),
      makeGanyeon([['8/1', '13', '14', '곡A', '', '지수']]),
    )
    const byDate = cumulativeMinutesByDate(model, [
      '8/1|10|민재',
      '8/1|11|지수',
      '8/1|13|지수', // dead
    ])
    expect(byDate.get('8/1')).toBe(120)
    expect(byDate.has('8/2')).toBe(false)
  })
})
