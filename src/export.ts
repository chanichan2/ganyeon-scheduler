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
 * 행 병합 — "실제 겹침" 기반:
 *  - run: 날짜별 (모든 부원의) 유효 구간이 있는 예약 칸 합집합에서 연속된
 *    1시간 칸 묶음. 죽은(유효 0분) 예약 칸은 run 을 연장하지 않는다.
 *  - 경계: run 내부의 정각 시각 (run 시작/끝 제외).
 *  - 경계 자동 기본값: 어떤 부원의 유효 slice [a,b) 가 경계를 엄격히
 *    가로지르면(a < h*60 < b) 연결(join), 아무도 없으면 절단(cut).
 *    맞닿기만 한 두 갠연(…~13 / 13~…)은 절단 — 별도 행.
 *  - 경계 유효 상태 = override(경계 스위치, 서버 저장) ?? 자동 기본값.
 *  - 각 run 을 절단 경계에서 잘라 만든 sub-block 하나가 TSV 한 행.
 *  - 떨어진 run 끼리 합치는 기능은 없다 (사이 빈 시간이 행 범위에 들어가
 *    거짓 정보가 되므로).
 *
 * 미리보기 모달과 실제 복사 TSV 는 반드시 같은 buildGanyeonExport 결과를
 * 공유한다 — 불일치 금지.
 */

import { parseBookingKey } from './bookingKey'
import { exportDateString } from './dates'
import { effectiveCellSlices } from './effective'
import { fmtHM, mergeRanges } from './ranges'
import { GANYEON_SONG } from './members'
import { boundaryMapKey, type BoundaryState } from './overrides'
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

/** run 내부 경계 1개의 상태 — 미리보기 토글 UI 용. */
export interface ExportBoundary {
  dateKey: string
  /** 경계 시각 (정수 시). */
  hour: number
  auto: BoundaryState
  /** override ?? auto. */
  effective: BoundaryState
  /** override key 존재 여부 — 자동값과 시각적으로 구분해 표시. */
  overridden: boolean
}

export interface ExportComputation {
  /** 실제 복사될 행 (sub-block 단위, 날짜 → 시작 시각 정렬). */
  rows: ExportRow[]
  /** dateKey → 예약 칸 합집합의 연속 run 목록 [시작 시, 끝 시). */
  runs: Map<string, Array<[number, number]>>
  /** 모든 run 의 내부 경계 (날짜·시각 순). */
  boundaries: ExportBoundary[]
  /** 현재 데이터와 매칭되지 않아 제외된 예약 수 — 경고 패널이 별도 처리. */
  skipped: number
}

/**
 * 병합 블록 기준으로 부원 1명의 참여 표기를 계산.
 * (sonsesangscheduler exportMemberEntry 포팅 — 로직 동일)
 *
 * slices 가 블록 전체를 정확히 덮으면 이름만, 아니면 괄호 메모:
 * 블록 시작과 같으면 시작 생략("~14:30"), 블록 끝과 같으면 끝 생략("15~"),
 * 둘 다 다르면 "14:30~15:30", 복수 조각은 콤마. 미정이면 메모 끝에 "미정".
 * 블록 안 유효 구간이 전혀 없으면(0분) null — 1분이라도 있으면 포함.
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
  if (total <= 0) return null
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

/** 경계 자동 기본값 — 누군가의 유효 slice 가 경계를 엄격히 가로지르면 join. */
function autoBoundaryState(
  slicesByMember: Map<string, MinRange[]>,
  boundaryMin: number,
): BoundaryState {
  for (const slices of slicesByMember.values()) {
    for (const [a, b] of slices) {
      if (a < boundaryMin && boundaryMin < b) return 'join'
    }
  }
  return 'cut'
}

/**
 * booking key 집합 + 경계 override → 내보내기 계산 전체.
 * 미리보기 모달과 클립보드 복사가 이 함수 하나를 공유한다.
 *
 * 현재 데이터와 매칭되지 않는 예약(명단에 없는 이름, 기간 밖 날짜,
 * 범위 밖 시각)은 skipped 로 집계 — 경고 패널이 별도로 다룬다.
 * 어떤 run 의 내부 경계도 아닌 override 는 조용히 무시된다.
 */
export function buildGanyeonExport(
  bookings: Iterable<string>,
  overrides: ReadonlyMap<string, BoundaryState>,
  ctx: ExportContext,
): ExportComputation {
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
  const runsByDate = new Map<string, Array<[number, number]>>()
  const boundaries: ExportBoundary[] = []

  for (const [dateKey, memberMap] of byDate) {
    // 부원의 유효 slices = 클릭한 각 칸의 유효 구간(칸 ∩ 가용 − 팀연습) 합집합.
    // liveHours = 유효 구간이 1분이라도 있는 예약 칸의 합집합 — 죽은(0분) 칸이
    // run 을 연장해 존재하지 않는 블록 경계를 만들지 않게 run 계산에서 제외한다.
    const slicesByMember = new Map<string, MinRange[]>()
    const liveHours = new Set<number>()
    for (const [member, hours] of memberMap) {
      const avail = ctx.availOf(member, dateKey)
      const teamRanges = ctx.teamRangesOf(member, dateKey)
      const pieces: MinRange[] = []
      for (const h of hours) {
        const { slices } = effectiveCellSlices(
          h * 60,
          (h + 1) * 60,
          avail.ranges,
          teamRanges,
        )
        if (slices.length > 0) liveHours.add(h)
        pieces.push(...slices)
      }
      slicesByMember.set(member, mergeRanges(pieces))
    }

    // 유효 구간이 있는 예약 칸 합집합 → 연속 run
    const allHours = [...liveHours].sort((a, b) => a - b)
    const runs: Array<[number, number]> = []
    for (const h of allHours) {
      const last = runs[runs.length - 1]
      if (last && h === last[1]) last[1] = h + 1
      else runs.push([h, h + 1])
    }
    if (runs.length > 0) runsByDate.set(dateKey, runs)

    for (const [h0, h1] of runs) {
      // run 내부 경계의 유효 상태 → 절단 지점
      const cuts: number[] = []
      for (let h = h0 + 1; h < h1; h++) {
        const auto = autoBoundaryState(slicesByMember, h * 60)
        const override = overrides.get(boundaryMapKey(dateKey, h))
        const effective = override ?? auto
        boundaries.push({
          dateKey,
          hour: h,
          auto,
          effective,
          overridden: override != null,
        })
        if (effective === 'cut') cuts.push(h)
      }

      // 절단 지점에서 잘라 sub-block → 행
      const edges = [h0, ...cuts, h1]
      for (let i = 0; i < edges.length - 1; i++) {
        const b0 = edges[i]
        const b1 = edges[i + 1]
        const blockStart = b0 * 60
        const blockEnd = b1 * 60
        const entries: string[] = []
        for (const [member, slices] of slicesByMember) {
          const entry = exportMemberEntry(
            member,
            slices,
            blockStart,
            blockEnd,
            ctx.availOf(member, dateKey).mijeong,
          )
          if (entry) entries.push(entry)
        }
        // 유효 slices 가 있는 부원이 없는 블록은 행을 만들지 않음 —
        // (유효 구간 소멸 예약은 기존 경고 패널 항목이 커버)
        if (entries.length === 0) continue
        entries.sort((a, b) => a.localeCompare(b, 'ko'))
        rows.push({
          dateKey,
          startHour: b0,
          endHour: b1,
          membersStr: entries.join(' '),
        })
      }
    }
  }

  rows.sort(
    (a, b) =>
      (dateOrder.get(a.dateKey) ?? 0) - (dateOrder.get(b.dateKey) ?? 0) ||
      a.startHour - b.startHour,
  )
  boundaries.sort(
    (a, b) =>
      (dateOrder.get(a.dateKey) ?? 0) - (dateOrder.get(b.dateKey) ?? 0) ||
      a.hour - b.hour,
  )
  return { rows, runs: runsByDate, boundaries, skipped }
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
