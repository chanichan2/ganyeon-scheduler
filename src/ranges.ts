/**
 * 분 단위 정수 구간 헬퍼 — sonsesangscheduler app.js 에서 그대로 포팅.
 * 모든 구간은 [시작분, 끝분) 반개구간이며 시작 < 끝.
 */

import type { MinRange } from './types'

/** 겹치거나 맞닿은 구간을 정렬·병합. (app.js mergeRanges 포팅 — 로직 동일) */
export function mergeRanges(ranges: MinRange[]): MinRange[] {
  if (ranges.length === 0) return ranges
  ranges.sort((a, b) => a[0] - b[0])
  const out: MinRange[] = [[ranges[0][0], ranges[0][1]]]
  for (let i = 1; i < ranges.length; i++) {
    const last = out[out.length - 1]
    const cur = ranges[i]
    if (cur[0] <= last[1]) {
      last[1] = Math.max(last[1], cur[1])
    } else {
      out.push([cur[0], cur[1]])
    }
  }
  return out
}

/** ranges 에서 [s, e) 구간을 뺀 결과 (원본 불변). (app.js subtractRange 포팅) */
export function subtractRange(
  ranges: MinRange[],
  s: number,
  e: number,
): MinRange[] {
  const out: MinRange[] = []
  for (const [rs, re] of ranges) {
    if (re <= s || rs >= e) {
      out.push([rs, re])
      continue
    }
    if (rs < s) out.push([rs, s])
    if (re > e) out.push([e, re])
  }
  return out
}

/** ranges 를 [s, e) 창으로 잘라낸 교집합 (원본 불변). */
export function clipRanges(ranges: MinRange[], s: number, e: number): MinRange[] {
  const out: MinRange[] = []
  for (const [rs, re] of ranges) {
    const is = Math.max(rs, s)
    const ie = Math.min(re, e)
    if (is < ie) out.push([is, ie])
  }
  return out
}

/** 구간 길이 합계 (분). */
export function totalMinutes(ranges: MinRange[]): number {
  let t = 0
  for (const [s, e] of ranges) t += e - s
  return t
}

/** 두 구간 목록이 1분이라도 겹치는지. */
export function rangesOverlap(a: MinRange[], b: MinRange[]): boolean {
  for (const [as, ae] of a) {
    for (const [bs, be] of b) {
      if (Math.max(as, bs) < Math.min(ae, be)) return true
    }
  }
  return false
}

/**
 * "H" 또는 "H:MM" — 시트 입력 규격과 동일하게 정각이면 ":00" 생략.
 * (app.js fmtHM 포팅 — TSV 내보내기·괄호 메모 공용)
 */
export function fmtHM(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? String(h) : `${h}:${String(m).padStart(2, '0')}`
}

/** "H:MM" — 항상 분 포함 (화면 경계 텍스트용). (app.js formatTime 포팅) */
export function formatTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}:00` : `${h}:${String(m).padStart(2, '0')}`
}

/** 누적 갠연 시간 표기 — "2시간", "1시간 30분", "45분". */
export function formatDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h > 0 && m > 0) return `${h}시간 ${m}분`
  if (h > 0) return `${h}시간`
  return `${m}분`
}

/**
 * 좁은 캡션용 시간 표기 — "45분", "2시간", "1:30"(=1시간 30분).
 * 주간 스트립/월 달력 캡션 공용. 분 단위 손실 없음 (반올림 금지).
 */
export function formatDurationShort(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}분`
  if (m === 0) return `${h}시간`
  return `${h}:${String(m).padStart(2, '0')}`
}
