/**
 * 부원 괄호 메모(Member.window)의 시간 윈도우 파싱 — 부원표 뷰 전용.
 *
 * 참여부원 셀의 괄호 메모가 시간 표현이면 실제 참여 구간으로 해석한다.
 * 연습 시간 [S, E] 기준:
 *   "~17:30"     → [S, 17.5]
 *   "16~"        → [16, E]
 *   "16~17:30"   → [16, 17.5]
 *   "~19, 21~"   → [S, 19] 와 [21, E] 두 구간 (콤마로 복수 구간)
 * 시각은 정수시("16") 또는 "HH:MM"("17:30") 지원.
 * 결과 구간은 [S, E] 로 클램프하고, 클램프 후 길이가 0 이하인 구간은 버린다.
 *
 * 시간 표현으로 해석할 수 없는 메모("자전거 타다 옴")는 null 을 반환 —
 * 호출부는 연습 전체 길이 바를 그리고 title 로 원문을 제공한다.
 * 정확히 "미정"인 토큰은 무시하고 시간 토큰만 해석한다 ("~15,미정" → [S,15])
 * — 손세상스케줄러 TSV 내보내기 형식. 시간 토큰이 하나도 없으면 null.
 * 토큰 중 하나라도 해석 불가면 메모 전체를 임의 메모로 취급한다(null).
 */

/** 참여 구간 1개 — [시작, 끝] fractional hours. */
export type HourInterval = [number, number]

/** "16" | "17:30" → fractional hours. 인식 불가면 null. */
function parseClock(text: string): number | null {
  const m = /^(\d{1,2})(?::([0-5]\d))?$/.exec(text)
  if (!m) return null
  const h = Number(m[1])
  const mm = m[2] ? Number(m[2]) : 0
  // 24:00 은 자정(하루 끝)으로 허용, 그 이상은 시각이 아님.
  if (h > 24 || (h === 24 && mm > 0)) return null
  return h + mm / 60
}

/**
 * window 메모 → 연습 [startHour, endHour] 기준 실제 참여 구간 목록.
 *
 * - null: 시간 표현으로 해석 불가(임의 메모).
 * - []  : 표현은 유효하지만 클램프 후 남는 구간이 없음.
 */
export function parseMemberWindow(
  window: string,
  startHour: number,
  endHour: number,
): HourInterval[] | null {
  const tokens = window
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t !== '' && t !== '미정')
  if (tokens.length === 0) return null

  const out: HourInterval[] = []
  for (const tok of tokens) {
    const m = /^([^~]*)~([^~]*)$/.exec(tok)
    if (!m) return null
    const leftRaw = m[1].trim()
    const rightRaw = m[2].trim()
    // "~" 단독은 정보가 없으므로 임의 메모로 취급.
    if (leftRaw === '' && rightRaw === '') return null
    const a = leftRaw === '' ? startHour : parseClock(leftRaw)
    const b = rightRaw === '' ? endHour : parseClock(rightRaw)
    if (a === null || b === null) return null
    const lo = Math.max(a, startHour)
    const hi = Math.min(b, endHour)
    if (hi - lo > 0) out.push([lo, hi])
  }
  return out
}
