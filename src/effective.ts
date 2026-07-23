/**
 * 클리핑 엔진 — 클릭한 1시간 칸의 "유효 구간" 계산.
 *
 * 유효 구간 = 칸 [h:00, h+1:00) ∩ 그 부원의 가용 ranges − 그 날짜의 팀연습 구간들.
 *
 * 예약의 저장 단위는 클릭한 1시간 칸이며, 유효 구간은 저장하지 않고
 * 렌더링/내보내기 시점에 항상 이 함수로 재계산한다 — 나중에 팀연습 TSV 가
 * 다시 붙여넣어지거나 가용시간이 수정되어도 자동으로 반영되게 하기 위함.
 */

import { clipRanges, mergeRanges, subtractRange, totalMinutes, formatTime } from './ranges'
import type { MinRange } from './types'

export interface EffectiveCell {
  /** 유효 구간 조각들 (병합·정렬 완료). */
  slices: MinRange[]
  /** 조각 합계 (분). */
  total: number
}

/**
 * 칸 [cellStart, cellEnd) 의 유효 구간.
 * @param avail 그 부원·날짜의 가용 ranges (파싱 실패면 빈 배열을 넘길 것)
 * @param teamRanges 그 부원·날짜의 팀연습 참여 구간들
 */
export function effectiveCellSlices(
  cellStart: number,
  cellEnd: number,
  avail: MinRange[],
  teamRanges: MinRange[],
): EffectiveCell {
  let cur = clipRanges(avail, cellStart, cellEnd)
  for (const [s, e] of teamRanges) {
    cur = subtractRange(cur, s, e)
  }
  const slices = mergeRanges(cur)
  return { slices, total: totalMinutes(slices) }
}

/**
 * 가용성 경계 텍스트 — 가용성 경계가 칸 중간을 지나는 칸에 표기할 문자열.
 * (예: "~14:30", "11:30~", "14:10~14:50")
 * 팀연습/갠연과 무관하게 가용성만 기준 — 갠연이 잡힌 뒤에도 계속 유지된다.
 * 칸 전체를 단일 구간으로 덮거나 아예 없으면 빈 배열.
 */
export function cellBoundaryMemos(
  cellStart: number,
  cellEnd: number,
  avail: MinRange[],
): string[] {
  const slices = clipRanges(avail, cellStart, cellEnd)
  if (slices.length === 0) return []
  const fullCoverage =
    slices.length === 1 &&
    slices[0][0] === cellStart &&
    slices[0][1] === cellEnd
  if (fullCoverage) return []
  const memos: string[] = []
  for (const [is, ie] of slices) {
    const sStr = is === cellStart ? '' : formatTime(is)
    const eStr = ie === cellEnd ? '' : formatTime(ie)
    if (sStr && eStr) memos.push(`${sStr}~${eStr}`)
    else if (sStr) memos.push(`${sStr}~`)
    else memos.push(`~${eStr}`)
  }
  return memos
}
