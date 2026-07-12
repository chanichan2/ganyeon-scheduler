import { describe, expect, it } from 'vitest'
import { parseMemberWindow } from './memberWindow'

/** 스펙의 기준 연습 시간 — [16, 21]. */
const S = 16
const E = 21

describe('parseMemberWindow — 기본 형태', () => {
  it('"~17:30" → [S, 17.5]', () => {
    expect(parseMemberWindow('~17:30', S, E)).toEqual([[16, 17.5]])
  })

  it('"16~" → [16, E]', () => {
    expect(parseMemberWindow('16~', 15, E)).toEqual([[16, 21]])
  })

  it('"16~17:30" → [16, 17.5]', () => {
    expect(parseMemberWindow('16~17:30', S, E)).toEqual([[16, 17.5]])
  })

  it('정수시와 HH:MM 혼용 — "16:30~19"', () => {
    expect(parseMemberWindow('16:30~19', S, E)).toEqual([[16.5, 19]])
  })

  it('분 단위 fractional 변환 — "21:15~" → 21.25', () => {
    expect(parseMemberWindow('21:15~', 20, 23)).toEqual([[21.25, 23]])
  })

  it('공백 허용 — " 16 ~ 17:30 "', () => {
    expect(parseMemberWindow(' 16 ~ 17:30 ', S, E)).toEqual([[16, 17.5]])
  })
})

describe('parseMemberWindow — 콤마 복수 구간', () => {
  it('"~19, 21~" → [S,19] 와 [21,E] 두 구간', () => {
    expect(parseMemberWindow('~19, 21~', 17, 23)).toEqual([
      [17, 19],
      [21, 23],
    ])
  })

  it('공백 없는 콤마 — "~18,20~"', () => {
    expect(parseMemberWindow('~18,20~', S, E)).toEqual([
      [16, 18],
      [20, 21],
    ])
  })
})

describe('parseMemberWindow — 클램프', () => {
  it('연습 범위 밖으로 넘치면 [S, E] 로 클램프 — "~23"', () => {
    expect(parseMemberWindow('~23', S, E)).toEqual([[16, 21]])
  })

  it('시작이 연습보다 이르면 S 로 클램프 — "15~17"', () => {
    expect(parseMemberWindow('15~17', S, E)).toEqual([[16, 17]])
  })

  it('클램프 후 길이 0 이하인 구간은 버림 — "12~15" → []', () => {
    expect(parseMemberWindow('12~15', S, E)).toEqual([])
  })

  it('복수 구간 중 일부만 살아남음 — "12~15, 18~"', () => {
    expect(parseMemberWindow('12~15, 18~', S, E)).toEqual([[18, 21]])
  })

  it('경계에 정확히 닿는 구간(길이 0)은 버림 — "~16"', () => {
    expect(parseMemberWindow('~16', S, E)).toEqual([])
  })
})

describe('parseMemberWindow — "미정" 토큰 무시', () => {
  it('"~15,미정" → 미정은 건너뛰고 시간 토큰만 해석', () => {
    expect(parseMemberWindow('~15,미정', 14, 16)).toEqual([[14, 15]])
  })

  it('"~15, 16:20~, 미정" → 두 시간 구간', () => {
    expect(parseMemberWindow('~15, 16:20~, 미정', 14, 17)).toEqual([
      [14, 15],
      [16 + 20 / 60, 17],
    ])
  })

  it('"미정" 단독은 기존대로 null (임의 메모 취급)', () => {
    expect(parseMemberWindow('미정', 14, 16)).toBeNull()
  })

  it('미정 아닌 해석 불가 토큰이 섞이면 여전히 전체 null — "~15, 자전거, 미정"', () => {
    expect(parseMemberWindow('~15, 자전거, 미정', 14, 16)).toBeNull()
  })
})

describe('parseMemberWindow — 해석 불가 메모는 null', () => {
  it('임의 메모 — "자전거 타다 옴"', () => {
    expect(parseMemberWindow('자전거 타다 옴', S, E)).toBeNull()
  })

  it('빈 문자열', () => {
    expect(parseMemberWindow('', S, E)).toBeNull()
  })

  it('"~" 단독 — 정보 없음', () => {
    expect(parseMemberWindow('~', S, E)).toBeNull()
  })

  it('물결 없는 단일 시각 — "19"', () => {
    expect(parseMemberWindow('19', S, E)).toBeNull()
  })

  it('토큰 하나라도 해석 불가면 전체 null — "~19, 자전거"', () => {
    expect(parseMemberWindow('~19, 자전거', S, E)).toBeNull()
  })

  it('시각 아님 — "25~"', () => {
    expect(parseMemberWindow('25~', S, E)).toBeNull()
  })

  it('분이 60 이상 — "16:60~"', () => {
    expect(parseMemberWindow('16:60~', S, E)).toBeNull()
  })
})
