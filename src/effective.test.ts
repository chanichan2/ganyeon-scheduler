import { describe, expect, it } from 'vitest'
import { parseAvailability } from './availability'
import { cellBoundaryMemos, effectiveCellSlices } from './effective'

/** 조사 범위 — 9:00~22:00. */
const START = 9 * 60
const END = 22 * 60

describe('클리핑 엔진 — 유효 구간 = 칸 ∩ 가용 − 팀연습', () => {
  it('민재 예시: "~14:30", 팀연습 없음 — 13시 칸 60분 + 14시 칸 30분 = 13:00~14:30', () => {
    const avail = parseAvailability('~14:30', START, END)
    const c13 = effectiveCellSlices(780, 840, avail.ranges, [])
    const c14 = effectiveCellSlices(840, 900, avail.ranges, [])
    expect(c13.slices).toEqual([[780, 840]])
    expect(c13.total).toBe(60)
    expect(c14.slices).toEqual([[840, 870]])
    expect(c14.total).toBe(30)
    // 두 칸 모두 클릭 가능 (유효 구간 존재)
    expect(c13.total > 0).toBe(true)
    expect(c14.total > 0).toBe(true)
  })

  it('팀연습 16:45~18:00 → 16시 칸 유효 구간 16:00~16:45 (45분)', () => {
    const avail = parseAvailability('O', START, END)
    const team: Array<[number, number]> = [[16 * 60 + 45, 18 * 60]]
    const c16 = effectiveCellSlices(960, 1020, avail.ranges, team)
    expect(c16.slices).toEqual([[960, 1005]])
    expect(c16.total).toBe(45)
    // 17시 칸은 팀연습에 전부 먹혀 0분
    const c17 = effectiveCellSlices(1020, 1080, avail.ranges, team)
    expect(c17.slices).toEqual([])
    expect(c17.total).toBe(0)
  })

  it('팀연습이 칸 중간(16:20~16:50)에 있으면 두 조각 [16:00,16:20]+[16:50,17:00] 모두', () => {
    const avail = parseAvailability('O', START, END)
    const team: Array<[number, number]> = [[16 * 60 + 20, 16 * 60 + 50]]
    const c16 = effectiveCellSlices(960, 1020, avail.ranges, team)
    expect(c16.slices).toEqual([
      [960, 980],
      [1010, 1020],
    ])
    expect(c16.total).toBe(30) // 20 + 10 — 두 조각의 합계
    expect(c16.total > 0).toBe(true)
  })

  it('유효 합계 0분 칸은 클릭 불가, 1분 이상이면 클릭 가능', () => {
    // 유효 1분 — 짧아도 관리자가 경계 텍스트를 보고 의도적으로 잡을 수 있다
    const avail1 = parseAvailability('~13:01', START, END)
    const c1 = effectiveCellSlices(780, 840, avail1.ranges, [])
    expect(c1.total).toBe(1)
    expect(c1.total > 0).toBe(true)
    // 유효 0분 — 가용 없음
    const c0 = effectiveCellSlices(780, 840, [], [])
    expect(c0.total).toBe(0)
    expect(c0.total > 0).toBe(false)
  })

  it('가용 없음(X/빈 셀/파싱 실패) → 유효 0분', () => {
    const cell = effectiveCellSlices(780, 840, [], [])
    expect(cell.slices).toEqual([])
    expect(cell.total).toBe(0)
  })

  it('가용이 칸 안에서 분리된 두 조각이면 그대로 두 조각', () => {
    const avail = parseAvailability('13~13:15,13:40~14', START, END)
    const cell = effectiveCellSlices(780, 840, avail.ranges, [])
    expect(cell.slices).toEqual([
      [780, 795],
      [820, 840],
    ])
    expect(cell.total).toBe(35)
  })
})

describe('cellBoundaryMemos — 가용성 경계 텍스트', () => {
  it('"~14:30" → 14시 칸에 "~14:30"', () => {
    const avail = parseAvailability('~14:30', START, END)
    expect(cellBoundaryMemos(840, 900, avail.ranges)).toEqual(['~14:30'])
  })

  it('"11:30~" → 11시 칸에 "11:30~"', () => {
    const avail = parseAvailability('11:30~', START, END)
    expect(cellBoundaryMemos(660, 720, avail.ranges)).toEqual(['11:30~'])
  })

  it('"14:10~14:50" → 14시 칸에 "14:10~14:50"', () => {
    const avail = parseAvailability('14:10~14:50', START, END)
    expect(cellBoundaryMemos(840, 900, avail.ranges)).toEqual(['14:10~14:50'])
  })

  it('칸 전체 커버 → 메모 없음', () => {
    const avail = parseAvailability('O', START, END)
    expect(cellBoundaryMemos(840, 900, avail.ranges)).toEqual([])
  })

  it('가용 없음 → 메모 없음', () => {
    expect(cellBoundaryMemos(840, 900, [])).toEqual([])
  })

  it('칸 안 분리된 두 조각은 각각 메모', () => {
    const avail = parseAvailability('13~13:15,13:40~14', START, END)
    expect(cellBoundaryMemos(780, 840, avail.ranges)).toEqual([
      '~13:15',
      '13:40~',
    ])
  })
})
