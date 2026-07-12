/**
 * booking key — 갠연 예약의 저장 단위 (클릭한 1시간 칸).
 * 형식: `${M/D}|${hour}|${memberName}` (예: "8/1|13|김민재")
 */

export interface BookingRef {
  /** "M/D" 날짜 키. */
  dateKey: string
  /** 칸 시작 시각 (정수 시). */
  hour: number
  /** 부원 이름. */
  member: string
}

export function bookingKey(dateKey: string, hour: number, member: string): string {
  return `${dateKey}|${hour}|${member}`
}

/**
 * key 문자열 → BookingRef. 형식이 어긋나면 null (조용한 누락 금지 —
 * 호출자는 경고 패널에 올린다). 이름에 '|' 가 들어가는 비정상 케이스도
 * 앞의 두 구분자만 사용해 이름 전체를 보존한다.
 */
export function parseBookingKey(key: string): BookingRef | null {
  if (typeof key !== 'string') return null
  const i1 = key.indexOf('|')
  if (i1 < 0) return null
  const i2 = key.indexOf('|', i1 + 1)
  if (i2 < 0) return null
  const dateKey = key.slice(0, i1)
  const hourStr = key.slice(i1 + 1, i2)
  const member = key.slice(i2 + 1)
  if (!/^\d{1,2}\/\d{1,2}$/.test(dateKey)) return null
  if (!/^\d{1,2}$/.test(hourStr)) return null
  if (member === '') return null
  return { dateKey, hour: parseInt(hourStr, 10), member }
}
