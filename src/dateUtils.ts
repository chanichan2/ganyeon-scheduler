/** 날짜 헬퍼 — 모든 날짜는 자정(00:00) 정규화된 로컬 Date. */

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const

/** 오늘 자정. */
export function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** 자정 정규화 사본. */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** d 가 속한 주의 일요일. */
export function startOfWeek(d: Date): Date {
  return addDays(d, -d.getDay())
}
