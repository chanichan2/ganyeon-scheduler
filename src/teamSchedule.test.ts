import { describe, expect, it } from 'vitest'
import { parseStartDate } from './dates'
import { parseTeamRows, type TeamScheduleOptions } from './teamSchedule'

const HEADER = ['날짜', '시작', '종료', '곡명', '연습실', '참여부원']

function opts(over?: Partial<TeamScheduleOptions>): TeamScheduleOptions {
  return {
    surveyDateKeys: new Set(['8/1', '8/2']),
    roster: new Set(['민재', '지수', '나형']),
    startDate: parseStartDate('2026-07-25'),
    ...over,
  }
}

describe('parseTeamRows — 날짜 형식/헤더/빈 행', () => {
  it('"2026. 8. 1" / "8/1" / "2026-08-01" 모두 같은 날짜 키로', () => {
    const { practices, warnings } = parseTeamRows(
      [
        HEADER,
        ['2026. 8. 1', '13', '15', '곡A', '', '민재'],
        ['8/1', '15', '16', '곡B', '', '지수'],
        ['2026-08-01', '16', '17', '곡C', '공2', '나형'],
      ],
      opts(),
    )
    expect(warnings).toEqual([])
    expect(practices.map((p) => p.dateKey)).toEqual(['8/1', '8/1', '8/1'])
    expect(practices.map((p) => p.song)).toEqual(['곡A', '곡B', '곡C'])
  })

  it('헤더 행과 빈 행은 조용히 건너뜀', () => {
    const { practices, warnings } = parseTeamRows(
      [HEADER, ['', '', '', '', '', ''], ['8/1', '13', '15', '곡A', '', '민재']],
      opts(),
    )
    expect(warnings).toEqual([])
    expect(practices).toHaveLength(1)
  })

  it('연습실 열이 전부 비어 있어도 정상 동작', () => {
    const { practices, warnings } = parseTeamRows(
      [HEADER, ['8/1', '13', '15', '곡A', '', '민재 지수']],
      opts(),
    )
    expect(warnings).toEqual([])
    expect(practices[0].members.map((m) => m.name)).toEqual(['민재', '지수'])
  })

  it('시각 "14:30" 형식 + 분 단위 정수 변환', () => {
    const { practices } = parseTeamRows(
      [['8/1', '14:30', '16', '곡A', '', '민재']],
      opts(),
    )
    expect(practices[0].startMin).toBe(870)
    expect(practices[0].endMin).toBe(960)
  })
})

describe('parseTeamRows — 해석 실패는 경고 + 제외 (추정 금지)', () => {
  it('날짜 해석 실패', () => {
    const { practices, warnings } = parseTeamRows(
      [['8월1일', '13', '15', '곡A', '', '민재']],
      opts(),
    )
    expect(practices).toHaveLength(0)
    expect(warnings).toHaveLength(1)
    expect(warnings[0].kind).toBe('team-row-parse')
  })

  it('시각 해석 실패 / 역순', () => {
    const { practices, warnings } = parseTeamRows(
      [
        ['8/1', '한시', '15', '곡A', '', '민재'],
        ['8/1', '15', '13', '곡B', '', '민재'],
      ],
      opts(),
    )
    expect(practices).toHaveLength(0)
    expect(warnings.map((w) => w.kind)).toEqual([
      'team-row-parse',
      'team-row-parse',
    ])
  })

  it('곡명 "갠연" 행은 팀연습으로 취급하지 않고 경고 (이중 카운트 방지)', () => {
    const { practices, warnings } = parseTeamRows(
      [['8/1', '13', '15', '갠연', '', '민재(~14:30)']],
      opts(),
    )
    expect(practices).toHaveLength(0)
    expect(warnings).toHaveLength(1)
    expect(warnings[0].kind).toBe('ganyeon-row')
  })

  it('일정조사 기간 밖 날짜는 date-out-of-range 경고 + 제외', () => {
    const { practices, warnings } = parseTeamRows(
      [['9/9', '13', '15', '곡A', '', '민재']],
      opts(),
    )
    expect(practices).toHaveLength(0)
    expect(warnings[0].kind).toBe('date-out-of-range')
  })

  it('M/D 는 맞지만 명시 연도가 추론 연도와 다르면 기간 밖 처리', () => {
    const { practices, warnings } = parseTeamRows(
      [['2025. 8. 1', '13', '15', '곡A', '', '민재']],
      opts(),
    )
    expect(practices).toHaveLength(0)
    expect(warnings[0].kind).toBe('date-out-of-range')
  })

  it('명단에 없는 참여부원은 name-mismatch 경고 + 그 부원만 제외', () => {
    const { practices, warnings } = parseTeamRows(
      [['8/1', '13', '15', '곡A', '', '민재 유령']],
      opts(),
    )
    expect(practices).toHaveLength(1)
    expect(practices[0].members.map((m) => m.name)).toEqual(['민재'])
    expect(warnings).toHaveLength(1)
    expect(warnings[0].kind).toBe('name-mismatch')
    expect(warnings[0].message).toContain('유령')
  })
})

describe('parseTeamRows — 참여부원 구간 (parseMemberWindow 재사용)', () => {
  it('괄호 시간 메모 — 나형(~17) 은 16:45~18:00 연습에서 [16:45, 17:00] 만', () => {
    const { practices } = parseTeamRows(
      [['8/1', '16:45', '18', '곡A', '', '나형(~17)']],
      opts(),
    )
    expect(practices[0].members[0].ranges).toEqual([[1005, 1020]])
  })

  it('괄호 없음/미정/임의 메모 → 연습 전체 구간', () => {
    const { practices } = parseTeamRows(
      [['8/1', '13', '15', '곡A', '', '민재 지수(미정) 나형(자전거 타다 옴)']],
      opts(),
    )
    const [m1, m2, m3] = practices[0].members
    expect(m1.status).toBe('confirmed')
    expect(m1.ranges).toEqual([[780, 900]])
    expect(m2.status).toBe('tentative')
    expect(m2.ranges).toEqual([[780, 900]])
    expect(m3.status).toBe('partial')
    expect(m3.ranges).toEqual([[780, 900]])
  })

  it('콤마 복수 구간 — 지수(~13:30, 14:20~)', () => {
    const { practices } = parseTeamRows(
      [['8/1', '13', '15', '곡A', '', '지수(~13:30, 14:20~)']],
      opts(),
    )
    expect(practices[0].members[0].ranges).toEqual([
      [780, 810],
      [860, 900],
    ])
  })
})

describe('parseTeamRows — 팀연습 겹침 감지', () => {
  it('같은 부원이 같은 날 두 팀연습에 겹치면 team-overlap 경고', () => {
    const { warnings } = parseTeamRows(
      [
        ['8/1', '13', '15', '곡A', '', '민재'],
        ['8/1', '14', '16', '곡B', '', '민재'],
      ],
      opts(),
    )
    expect(warnings.some((w) => w.kind === 'team-overlap')).toBe(true)
  })

  it('겹치지 않으면 경고 없음', () => {
    const { warnings } = parseTeamRows(
      [
        ['8/1', '13', '15', '곡A', '', '민재'],
        ['8/1', '15', '16', '곡B', '', '민재'],
        ['8/2', '13', '15', '곡A', '', '민재'],
      ],
      opts(),
    )
    expect(warnings).toEqual([])
  })

  it('부분참여 구간이 겹치지 않으면 경고 없음', () => {
    const { warnings } = parseTeamRows(
      [
        ['8/1', '13', '15', '곡A', '', '민재(~14)'],
        ['8/1', '14', '16', '곡B', '', '민재(14~)'],
      ],
      opts(),
    )
    expect(warnings).toEqual([])
  })
})
