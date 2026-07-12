/**
 * TSV 내보내기 — sonsesangscheduler 의 내보내기와 동일한 규격.
 * 헤더 행 없음, 대상 시트 2행 이하에 붙여넣는 용도.
 *
 * 열 순서: 날짜 \t 시작 \t 종료 \t 곡명 \t 연습실 \t 참여부원
 *  - 날짜: "YYYY. M. D" (연도는 settings.startDate 에서 추론, 해 넘김 처리)
 *  - 시작/종료: 정각이면 "13", 아니면 "14:30" (블록 경계는 1시간 칸 병합
 *    결과라 항상 정각)
 *  - 곡명: 항상 정확히 "갠연" / 연습실: 빈 문자열
 *
 * 행 병합 (옵션 2): 날짜별로 모든 부원의 예약 칸 시간을 합집합으로 모아
 * 연속된 1시간 칸 묶음(run) 하나가 TSV 한 행. 칸 기준으로 하나라도 비면 별도 행.
 */

import { parseBookingKey } from './bookingKey'
import { exportDateString } from './dates'
import { effectiveCellSlices } from './effective'
import { fmtHM, mergeRanges } from './ranges'
import { GANYEON_SONG } from './members'
import type { Availability, MinRange } from './types'

export interface ExportContext {
  /** 조사 날짜 키 목록 ("M/D", 조사 순서 = 날짜 순서). */
  dateKeys: string[]
  startHour: number
  endHour: number
  /** 부원 명단 (완전 일치 매칭). */
  roster: Set<string>
  /** 부원·날짜의 가용시간 (파싱 실패 셀은 { ranges: [], mijeong: false }). */
  availOf: (member: string, dateKey: string) => Availability
  /** 부원·날짜의 팀연습 참여 구간들. */
  teamRangesOf: (member: string, dateKey: string) => MinRange[]
}

export interface ExportRow {
  dateKey: string
  /** 블록 시작/끝 (정수 시). */
  startHour: number
  endHour: number
  /** "민재(~14:30) 지수" 형태 — ko 정렬, 공백 join. */
  membersStr: string
}

/**
 * 병합 블록 기준으로 부원 1명의 참여 표기를 계산.
 * (sonsesangscheduler exportMemberEntry 포팅 — 로직 동일)
 *
 * slices 가 블록 전체를 정확히 덮으면 이름만, 아니면 괄호 메모:
 * 블록 시작과 같으면 시작 생략("~14:30"), 블록 끝과 같으면 끝 생략("15~"),
 * 둘 다 다르면 "14:30~15:30", 복수 조각은 콤마. 미정이면 메모 끝에 "미정".
 * 합계 30분 미만이면 null (참여 불가).
 */
export function exportMemberEntry(
  name: string,
  effRanges: MinRange[],
  blockStart: number,
  blockEnd: number,
  mijeong: boolean,
): string | null {
  let total = 0
  const slices: MinRange[] = []
  for (const [rs, re] of effRanges) {
    const is = Math.max(rs, blockStart)
    const ie = Math.min(re, blockEnd)
    if (is < ie) {
      total += ie - is
      slices.push([is, ie])
    }
  }
  if (total < 30) return null
  const fullCoverage =
    slices.length === 1 &&
    slices[0][0] === blockStart &&
    slices[0][1] === blockEnd
  const memos: string[] = []
  if (!fullCoverage) {
    for (const [is, ie] of slices) {
      const sStr = is === blockStart ? '' : fmtHM(is)
      const eStr = ie === blockEnd ? '' : fmtHM(ie)
      if (sStr && eStr) memos.push(`${sStr}~${eStr}`)
      else if (sStr) memos.push(`${sStr}~`)
      else memos.push(`~${eStr}`)
    }
  }
  if (mijeong) memos.push('미정')
  return memos.length ? `${name}(${memos.join(',')})` : name
}

/**
 * booking key 집합 → 내보내기 행 목록. 날짜 → 시작 시각 순 정렬.
 * 현재 데이터와 매칭되지 않는 예약(명단에 없는 이름, 기간 밖 날짜,
 * 범위 밖 시각)은 skipped 로 집계 — 경고 패널이 별도로 다룬다.
 */
export function buildGanyeonExportRows(
  bookings: Iterable<string>,
  ctx: ExportContext,
): { rows: ExportRow[]; skipped: number } {
  const dateOrder = new Map<string, number>()
  ctx.dateKeys.forEach((k, i) => dateOrder.set(k, i))

  // 날짜별: 부원 → 예약 시각 집합
  const byDate = new Map<string, Map<string, Set<number>>>()
  let skipped = 0
  for (const key of bookings) {
    const ref = parseBookingKey(key)
    if (
      !ref ||
      !dateOrder.has(ref.dateKey) ||
      !ctx.roster.has(ref.member) ||
      ref.hour < ctx.startHour ||
      ref.hour >= ctx.endHour
    ) {
      skipped++
      continue
    }
    let memberMap = byDate.get(ref.dateKey)
    if (!memberMap) {
      memberMap = new Map()
      byDate.set(ref.dateKey, memberMap)
    }
    let hours = memberMap.get(ref.member)
    if (!hours) {
      hours = new Set()
      memberMap.set(ref.member, hours)
    }
    hours.add(ref.hour)
  }

  const rows: ExportRow[] = []
  for (const [dateKey, memberMap] of byDate) {
    // 모든 부원의 예약 칸 합집합 → 연속 run 병합
    const allHours = [...new Set([...memberMap.values()].flatMap((s) => [...s]))]
      .sort((a, b) => a - b)
    const runs: Array<[number, number]> = []
    for (const h of allHours) {
      const last = runs[runs.length - 1]
      if (last && h === last[1]) last[1] = h + 1
      else runs.push([h, h + 1])
    }

    for (const [h0, h1] of runs) {
      const blockStart = h0 * 60
      const blockEnd = h1 * 60
      const entries: string[] = []
      for (const [member, hours] of memberMap) {
        const avail = ctx.availOf(member, dateKey)
        const teamRanges = ctx.teamRangesOf(member, dateKey)
        // 부원별 slices = (블록 안에서 클릭한 각 칸의 유효 구간)의 합집합
        const pieces: MinRange[] = []
        for (const h of hours) {
          if (h < h0 || h >= h1) continue
          const { slices } = effectiveCellSlices(
            h * 60,
            (h + 1) * 60,
            avail.ranges,
            teamRanges,
          )
          pieces.push(...slices)
        }
        if (pieces.length === 0) continue
        const entry = exportMemberEntry(
          member,
          mergeRanges(pieces),
          blockStart,
          blockEnd,
          avail.mijeong,
        )
        if (entry) entries.push(entry)
      }
      if (entries.length === 0) continue // 유효 구간이 모두 사라진 블록 — 경고 패널이 다룸
      entries.sort((a, b) => a.localeCompare(b, 'ko'))
      rows.push({
        dateKey,
        startHour: h0,
        endHour: h1,
        membersStr: entries.join(' '),
      })
    }
  }

  rows.sort(
    (a, b) =>
      (dateOrder.get(a.dateKey) ?? 0) - (dateOrder.get(b.dateKey) ?? 0) ||
      a.startHour - b.startHour,
  )
  return { rows, skipped }
}

/** 내보내기 행 → TSV 문자열. (sonsesangscheduler buildTsv 규격과 동일) */
export function buildTsv(
  rows: ExportRow[],
  startDateStr: string | undefined,
): string {
  return rows
    .map((r) =>
      [
        exportDateString(r.dateKey, startDateStr),
        fmtHM(r.startHour * 60),
        fmtHM(r.endHour * 60),
        GANYEON_SONG,
        '', // 연습실은 따로 잡으므로 비워둠
        r.membersStr,
      ].join('\t'),
    )
    .join('\n')
}
