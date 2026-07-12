import { describe, expect, it } from 'vitest'
import {
  dateKeyToDate,
  exportDateString,
  formatDateShort,
  inferYear,
  parseSheetDateCell,
  parseStartDate,
} from './dates'

describe('parseSheetDateCell — 연습일정 날짜 셀 3형식', () => {
  it('"2026. 8. 1" (구글 시트 표시 형식)', () => {
    expect(parseSheetDateCell('2026. 8. 1')).toEqual({
      dateKey: '8/1',
      explicitYear: 2026,
    })
  })

  it('끝 점 허용 — "2026. 8. 1."', () => {
    expect(parseSheetDateCell('2026. 8. 1.')).toEqual({
      dateKey: '8/1',
      explicitYear: 2026,
    })
  })

  it('"2026-08-01"', () => {
    expect(parseSheetDateCell('2026-08-01')).toEqual({
      dateKey: '8/1',
      explicitYear: 2026,
    })
  })

  it('"8/1" (연도 없음 → 추론 대상)', () => {
    expect(parseSheetDateCell('8/1')).toEqual({
      dateKey: '8/1',
      explicitYear: null,
    })
  })

  it('해석 불가 값은 null (추정 금지)', () => {
    expect(parseSheetDateCell('')).toBeNull()
    expect(parseSheetDateCell('8월 1일')).toBeNull()
    expect(parseSheetDateCell('2026/08/01/')).toBeNull()
    expect(parseSheetDateCell('13/40')).toBeNull()
  })
})

describe('연도 추론 — 해 넘김 (12월→1월)', () => {
  const decBase = parseStartDate('2026-12-20')!

  it('12월 startDate 기준 1월 날짜는 +1년', () => {
    expect(inferYear(1, decBase)).toBe(2027)
    expect(inferYear(12, decBase)).toBe(2026)
  })

  it('exportDateString — "1/5" + 2026-12-20 → "2027. 1. 5"', () => {
    expect(exportDateString('1/5', '2026-12-20')).toBe('2027. 1. 5')
    expect(exportDateString('12/31', '2026-12-20')).toBe('2026. 12. 31')
  })

  it('exportDateString — 수용 기준 형식 "2026. 8. 1"', () => {
    expect(exportDateString('8/1', '2026-07-25')).toBe('2026. 8. 1')
  })

  it('dateKeyToDate — 해 넘김 반영', () => {
    const d = dateKeyToDate('1/5', decBase)!
    expect(d.getFullYear()).toBe(2027)
    expect(d.getMonth()).toBe(0)
    expect(d.getDate()).toBe(5)
  })
})

describe('formatDateShort — GET ① dates 정규화', () => {
  it('"5/8" 은 그대로', () => {
    expect(formatDateShort('5/8')).toBe('5/8')
  })

  it('Apps Script Date 직렬화 긴 형식 → "M/D"', () => {
    expect(formatDateShort('2026-05-08T00:00:00')).toBe('5/8')
  })
})
