/**
 * 날짜 문자열 정규화/추론 헬퍼.
 *
 * 날짜 키는 항상 "M/D" (예: "8/1"). 연도는 GET ① settings.startDate 의 연도에서
 * 추론하며, 조사 기간이 해를 넘기는 경우(12월→1월)는 "월이 startDate 의 월보다
 * 작으면 +1년" 규칙 — sonsesangscheduler exportDateString 과 동일 로직.
 */

/**
 * GET ① dates[i] 는 "5/8" 같은 짧은 형식으로 오기도 하고, Apps Script 에서
 * Date 객체가 직렬화되며 "Fri May 08 2026 09:00:00 GMT+0900 (한국 표준시)" 같은
 * 긴 형식으로 오기도 한다. 항상 "M/D" 로 정규화. (app.js formatDateShort 포팅)
 */
export function formatDateShort(raw: unknown): string {
  if (raw == null) return ''
  const s = String(raw).trim()
  if (s === '') return ''
  if (/^\d{1,2}\/\d{1,2}$/.test(s)) return s
  const d = new Date(s)
  if (!isNaN(d.getTime())) {
    return `${d.getMonth() + 1}/${d.getDate()}`
  }
  return s
}

/** "YYYY-MM-DD" → 자정 로컬 Date. 실패 시 null. */
export function parseStartDate(startDateStr: string | undefined): Date | null {
  if (!startDateStr) return null
  const d = new Date(startDateStr + 'T00:00:00')
  return isNaN(d.getTime()) ? null : d
}

/**
 * 월(1~12)에 대한 연도 추론 — 기준(startDate)의 월보다 작으면 해를 넘긴 것으로
 * 보고 +1년. (exportDateString 과 동일 로직)
 */
export function inferYear(month: number, base: Date): number {
  let year = base.getFullYear()
  if (month < base.getMonth() + 1) year += 1
  return year
}

/** "M/D" 날짜 키 → 자정 로컬 Date (연도 추론). 기준 없으면 null. */
export function dateKeyToDate(dateKey: string, base: Date | null): Date | null {
  const m = dateKey.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (!m || !base) return null
  const month = parseInt(m[1], 10)
  const day = parseInt(m[2], 10)
  return new Date(inferYear(month, base), month - 1, day)
}

/** 연습일정 날짜 셀 파싱 결과. */
export interface SheetDate {
  /** "M/D" 정규화 키. */
  dateKey: string
  /** 셀에 연도가 명시돼 있으면 그 값, 없으면 null (추론 대상). */
  explicitYear: number | null
}

/**
 * 연습일정 탭 날짜 셀 (getDisplayValues 문자열) 파싱.
 * 허용 형식: "YYYY. M. D"(끝 점 허용) / "YYYY-MM-DD" / "M/D".
 * 해석 실패 시 null — 호출자는 추정하지 않고 경고 처리.
 */
export function parseSheetDateCell(raw: string): SheetDate | null {
  const s = raw.trim()
  if (s === '') return null

  // "YYYY. M. D" (구글 시트 한국 로케일 표시 형식, 끝 점 허용)
  let m = s.match(/^(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?$/)
  if (m) return toSheetDate(+m[1], +m[2], +m[3])

  // "YYYY-MM-DD"
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return toSheetDate(+m[1], +m[2], +m[3])

  // "M/D"
  m = s.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (m) {
    const month = +m[1]
    const day = +m[2]
    if (!validMD(month, day)) return null
    return { dateKey: `${month}/${day}`, explicitYear: null }
  }

  return null
}

function toSheetDate(year: number, month: number, day: number): SheetDate | null {
  if (!validMD(month, day)) return null
  return { dateKey: `${month}/${day}`, explicitYear: year }
}

function validMD(month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= 31
}

/**
 * "M/D" 날짜 키 → "YYYY. M. D" (예: "2026. 8. 1").
 * 붙여넣기 시 구글 시트가 날짜로 자동 인식하는 형식.
 * (sonsesangscheduler exportDateString 포팅 — 인덱스 대신 날짜 키 기반)
 */
export function exportDateString(
  dateKey: string,
  startDateStr: string | undefined,
): string {
  const base = parseStartDate(startDateStr)
  const m = dateKey.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (m && base) {
    const month = parseInt(m[1], 10)
    const day = parseInt(m[2], 10)
    return `${inferYear(month, base)}. ${month}. ${day}`
  }
  return dateKey
}
