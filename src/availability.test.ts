import { describe, expect, it } from 'vitest'
import { normalizeRaw, parseAvailability } from './availability'

/** 조사 범위 — 9:00~22:00. */
const START = 9 * 60
const END = 22 * 60

describe('parseAvailability — 3-1 표의 모든 행', () => {
  it('빈 셀 / null / undefined → 불가능', () => {
    expect(parseAvailability(null, START, END)).toEqual({
      ranges: [],
      mijeong: false,
    })
    expect(parseAvailability(undefined, START, END)).toEqual({
      ranges: [],
      mijeong: false,
    })
    expect(parseAvailability('', START, END)).toEqual({
      ranges: [],
      mijeong: false,
    })
    expect(parseAvailability('   ', START, END)).toEqual({
      ranges: [],
      mijeong: false,
    })
  })

  it('"O" → 조사 전체 범위', () => {
    expect(parseAvailability('O', START, END)).toEqual({
      ranges: [[START, END]],
      mijeong: false,
    })
  })

  it('소문자 "o"/"x" 도 대문자로 정규화', () => {
    expect(parseAvailability('o', START, END)).toEqual({
      ranges: [[START, END]],
      mijeong: false,
    })
    expect(parseAvailability('x', START, END)).toEqual({
      ranges: [],
      mijeong: false,
    })
  })

  it('"X" → 불가능', () => {
    expect(parseAvailability('X', START, END)).toEqual({
      ranges: [],
      mijeong: false,
    })
  })

  it('"미정" 단독 → 전체 범위 + mijeong', () => {
    expect(parseAvailability('미정', START, END)).toEqual({
      ranges: [[START, END]],
      mijeong: true,
    })
  })

  it('"X(미정)" → 불가능 + mijeong', () => {
    expect(parseAvailability('X(미정)', START, END)).toEqual({
      ranges: [],
      mijeong: true,
    })
  })

  it('"13~15" → [[780, 900]]', () => {
    expect(parseAvailability('13~15', START, END)).toEqual({
      ranges: [[780, 900]],
      mijeong: false,
    })
  })

  it('하이픈 동일 — "13-15"', () => {
    expect(parseAvailability('13-15', START, END)).toEqual({
      ranges: [[780, 900]],
      mijeong: false,
    })
  })

  it('"13:30~" → [[810, end]]', () => {
    expect(parseAvailability('13:30~', START, END)).toEqual({
      ranges: [[810, END]],
      mijeong: false,
    })
  })

  it('"~14:30" → [[start, 870]]', () => {
    expect(parseAvailability('~14:30', START, END)).toEqual({
      ranges: [[START, 870]],
      mijeong: false,
    })
  })

  it('"13~15,18~" → 두 구간', () => {
    expect(parseAvailability('13~15,18~', START, END)).toEqual({
      ranges: [
        [780, 900],
        [1080, END],
      ],
      mijeong: false,
    })
  })

  it('"12~18(미정)" → 구간 + mijeong', () => {
    expect(parseAvailability('12~18(미정)', START, END)).toEqual({
      ranges: [[720, 1080]],
      mijeong: true,
    })
  })

  it('"(미정)" 만 → 전체 범위 + mijeong', () => {
    expect(parseAvailability('(미정)', START, END)).toEqual({
      ranges: [[START, END]],
      mijeong: true,
    })
  })
})

describe('parseAvailability — 전각/유사문자 입력', () => {
  it('전각 숫자·물결 "１３～１５"', () => {
    expect(parseAvailability('１３～１５', START, END)).toEqual({
      ranges: [[780, 900]],
      mijeong: false,
    })
  })

  it('전각 X·괄호 "Ｘ（미정）"', () => {
    expect(parseAvailability('Ｘ（미정）', START, END)).toEqual({
      ranges: [],
      mijeong: true,
    })
  })

  it('물결 변형 + 전각 콜론 "〜１４：３０"', () => {
    expect(parseAvailability('〜１４：３０', START, END)).toEqual({
      ranges: [[START, 870]],
      mijeong: false,
    })
  })

  it('제로폭 문자/BOM 이 섞여도 동일하게 해석', () => {
    expect(parseAvailability('13​~15﻿', START, END)).toEqual({
      ranges: [[780, 900]],
      mijeong: false,
    })
    expect(parseAvailability('‍미정‌', START, END)).toEqual({
      ranges: [[START, END]],
      mijeong: true,
    })
  })

  it('전각 쉼표 "１３～１５，１８～"', () => {
    expect(parseAvailability('１３～１５，１８～', START, END)).toEqual({
      ranges: [
        [780, 900],
        [1080, END],
      ],
      mijeong: false,
    })
  })

  it('normalizeRaw — 대시류/물결류/전각 정규화', () => {
    expect(normalizeRaw('１３−１５')).toBe('13-15')
    expect(normalizeRaw('（미정）')).toBe('(미정)')
    expect(normalizeRaw('13：30〜')).toBe('13:30~')
  })
})

describe('parseAvailability — 오류/경계', () => {
  it('"15~13" 양쪽 명시 역순은 오류', () => {
    expect(() => parseAvailability('15~13', START, END)).toThrow()
  })

  it('"~9" (시작시각 이전) 한쪽 자동 채움 빈 구간은 조용히 무시', () => {
    expect(parseAvailability('~9', START, END)).toEqual({
      ranges: [],
      mijeong: false,
    })
  })

  it('"24~" (끝시각 이후) 도 조용히 무시', () => {
    expect(parseAvailability('24~', START, END)).toEqual({
      ranges: [],
      mijeong: false,
    })
  })

  it('콤마 다중 구간은 정렬·병합', () => {
    expect(parseAvailability('14~16,13~15', START, END)).toEqual({
      ranges: [[780, 960]],
      mijeong: false,
    })
  })

  it('조사 범위 밖은 클리핑', () => {
    expect(parseAvailability('8~23', START, END)).toEqual({
      ranges: [[START, END]],
      mijeong: false,
    })
  })

  it('30분 단위가 아닌 값("~14:20")도 그대로 허용', () => {
    expect(parseAvailability('~14:20', START, END)).toEqual({
      ranges: [[START, 860]],
      mijeong: false,
    })
  })

  it('잘못된 (미정) 위치는 오류', () => {
    expect(() => parseAvailability('미정13~15', START, END)).toThrow()
    expect(() => parseAvailability('(미정)13~15', START, END)).toThrow()
  })

  it('구간 형식 오류는 throw (추정 금지)', () => {
    expect(() => parseAvailability('13~15~17', START, END)).toThrow()
    expect(() => parseAvailability('13~15,,18~', START, END)).toThrow()
    expect(() => parseAvailability('아무말', START, END)).toThrow()
  })
})
