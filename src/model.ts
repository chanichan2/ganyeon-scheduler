/**
 * 화면 모델 조립 — GET ①(일정조사) + GET ②(갠연) payload 를 받아
 * 부원표 렌더링에 필요한 모든 파생 데이터를 계산한다.
 *
 * 예약(bookings)에 의존하지 않는 정적 모델: 가용시간 파싱, 팀연습 파싱,
 * 칸별 유효 구간/경계 텍스트, 경고(1~5, 7번).
 * 예약 의존 계산(잡힘/죽은 예약/누적시간/6번 경고)은 별도 함수로 분리 —
 * 클릭마다 전체 모델을 다시 만들지 않기 위함.
 */

import { parseAvailability } from './availability'
import { parseBookingKey } from './bookingKey'
import { dateKeyToDate, formatDateShort, parseStartDate } from './dates'
import { cellBoundaryMemos, effectiveCellSlices } from './effective'
import { mergeRanges, formatTime } from './ranges'
import { parseTeamRows } from './teamSchedule'
import type {
  AppWarning,
  Availability,
  GanyeonPayload,
  MinRange,
  SurveyPayload,
  TeamPractice,
} from './types'

const EMPTY_AVAIL: Availability = { ranges: [], mijeong: false }

export interface CellInfo {
  /** 칸 시작 시각 (정수 시). */
  hour: number
  /** 유효 구간 = 칸 ∩ 가용 − 팀연습. */
  slices: MinRange[]
  total: number
  /** 가용성 경계 텍스트 ("~14:30" 등). 갠연이 잡혀도 계속 표시. */
  memos: string[]
}

export interface MemberDay {
  name: string
  avail: Availability
  /** 가용시간 셀 파싱 실패 — 불가능 처리됨. */
  parseFailed: boolean
  /** 이 부원이 이 날짜에 참여하는 팀연습들 (오버레이용). */
  practices: TeamPractice[]
  /** 팀연습 참여 구간 병합 (클리핑용). */
  teamRanges: MinRange[]
  cells: CellInfo[]
}

export interface ScheduleModel {
  startDate: string | undefined
  startHour: number
  endHour: number
  startMin: number
  endMin: number
  /** 그리드 칸 시작 시각 목록 [startHour, ..., endHour-1]. */
  hours: number[]
  /** 조사 날짜 키 ("M/D", 조사 순서). */
  dateKeys: string[]
  /** 날짜 키 → 자정 Date (연도 추론). */
  dateByKey: Map<string, Date>
  /** ko 정렬된 부원 명단. */
  roster: string[]
  rosterSet: Set<string>
  /** dateKey → 부원별 하루 모델 (roster 순서). */
  days: Map<string, MemberDay[]>
  /** 예약과 무관한 경고 (1~5, 7번). */
  warnings: AppWarning[]
  availOf: (member: string, dateKey: string) => Availability
  teamRangesOf: (member: string, dateKey: string) => MinRange[]
}

/** settings 숫자 필드 검증 — 실패 시 throw (화면은 오류 상태로 전환). */
function requireHour(v: unknown, label: string): number {
  const n = Number(v)
  if (!Number.isInteger(n) || n < 0 || n > 24) {
    throw new Error(`일정조사 settings.${label} 값이 올바르지 않아요: ${String(v)}`)
  }
  return n
}

export function buildScheduleModel(
  survey: SurveyPayload,
  ganyeon: GanyeonPayload,
): ScheduleModel {
  const warnings: AppWarning[] = []

  const startHour = requireHour(survey.settings?.startHour, 'startHour')
  const endHour = requireHour(survey.settings?.endHour, 'endHour')
  if (startHour >= endHour) {
    throw new Error(
      `일정조사 settings 의 시간 범위가 올바르지 않아요: ${startHour}~${endHour}`,
    )
  }
  const startMin = startHour * 60
  const endMin = endHour * 60
  const hours: number[] = []
  for (let h = startHour; h < endHour; h++) hours.push(h)

  const startDateObj = parseStartDate(survey.settings?.startDate)

  // 조사 날짜 정규화 — 원본 헤더 문자열과 "M/D" 키를 함께 유지
  const dateKeys: string[] = []
  const dateByKey = new Map<string, Date>()
  const rawHeaderByKey = new Map<string, string>()
  for (const rawDate of survey.dates ?? []) {
    const key = formatDateShort(rawDate)
    if (!/^\d{1,2}\/\d{1,2}$/.test(key)) continue
    if (dateByKey.has(key)) continue
    dateKeys.push(key)
    rawHeaderByKey.set(key, String(rawDate))
    const d = dateKeyToDate(key, startDateObj)
    if (d) dateByKey.set(key, d)
  }

  // 부원 명단 — GET ① availability 의 키가 진실
  const roster = Object.keys(survey.availability ?? {})
    .map((n) => n.trim())
    .filter((n) => n !== '')
  roster.sort((a, b) => a.localeCompare(b, 'ko'))
  const rosterSet = new Set(roster)

  // 가용시간 파싱 — member|dateKey → Availability (+ 실패 여부)
  const availMap = new Map<string, { avail: Availability; failed: boolean }>()
  for (const [rawName, byDate] of Object.entries(survey.availability ?? {})) {
    const name = rawName.trim()
    if (!name) continue
    // availability 의 날짜 키는 원본 헤더 문자열 — 정규화 키 양쪽으로 조회
    for (const dateKey of dateKeys) {
      const rawHeader = rawHeaderByKey.get(dateKey) ?? dateKey
      const raw = byDate?.[rawHeader] ?? byDate?.[dateKey] ?? ''
      let avail: Availability
      let failed = false
      try {
        avail = parseAvailability(raw, startMin, endMin)
      } catch (e) {
        // 절대 추정하지 않는다 — 불가능 처리 + 경고
        avail = EMPTY_AVAIL
        failed = true
        warnings.push({
          kind: 'availability-parse',
          message: `${name} | ${dateKey} | "${String(raw)}" — 가용시간을 해석하지 못했어요`,
          detail: e instanceof Error ? e.message : String(e),
        })
      }
      availMap.set(`${name}|${dateKey}`, { avail, failed })
    }
  }

  // 팀연습 파싱
  const { practices, warnings: teamWarnings } = parseTeamRows(
    ganyeon.teamRows ?? [],
    {
      surveyDateKeys: new Set(dateKeys),
      roster: rosterSet,
      startDate: startDateObj,
    },
  )
  warnings.push(...teamWarnings)

  // 부원·날짜별 팀연습/구간 인덱스
  const practicesOf = new Map<string, TeamPractice[]>()
  const teamRangesMap = new Map<string, MinRange[]>()
  for (const p of practices) {
    for (const m of p.members) {
      const key = `${m.name}|${p.dateKey}`
      const list = practicesOf.get(key)
      if (list) list.push(p)
      else practicesOf.set(key, [p])
      const acc = teamRangesMap.get(key)
      if (acc) acc.push(...m.ranges)
      else teamRangesMap.set(key, m.ranges.map((r) => [r[0], r[1]] as MinRange))
    }
  }
  for (const [key, ranges] of teamRangesMap) {
    teamRangesMap.set(key, mergeRanges(ranges))
  }

  const availOf = (member: string, dateKey: string): Availability =>
    availMap.get(`${member}|${dateKey}`)?.avail ?? EMPTY_AVAIL
  const teamRangesOf = (member: string, dateKey: string): MinRange[] =>
    teamRangesMap.get(`${member}|${dateKey}`) ?? []

  // 날짜별 부원표 셀 계산
  const days = new Map<string, MemberDay[]>()
  for (const dateKey of dateKeys) {
    const memberDays: MemberDay[] = []
    for (const name of roster) {
      const entry = availMap.get(`${name}|${dateKey}`)
      const avail = entry?.avail ?? EMPTY_AVAIL
      const teamRanges = teamRangesOf(name, dateKey)
      const cells: CellInfo[] = hours.map((h) => {
        const { slices, total } = effectiveCellSlices(
          h * 60,
          (h + 1) * 60,
          avail.ranges,
          teamRanges,
        )
        return {
          hour: h,
          slices,
          total,
          memos: cellBoundaryMemos(h * 60, (h + 1) * 60, avail.ranges),
        }
      })
      memberDays.push({
        name,
        avail,
        parseFailed: entry?.failed ?? false,
        practices: practicesOf.get(`${name}|${dateKey}`) ?? [],
        teamRanges,
        cells,
      })
    }
    days.set(dateKey, memberDays)
  }

  return {
    startDate: survey.settings?.startDate,
    startHour,
    endHour,
    startMin,
    endMin,
    hours,
    dateKeys,
    dateByKey,
    roster,
    rosterSet,
    days,
    warnings,
    availOf,
    teamRangesOf,
  }
}

/* ── 예약 의존 계산 ───────────────────────────────────────────── */

export interface BookingIssues {
  /** 6번(유효 구간 소멸) + 매칭 실패 booking 경고. */
  warnings: AppWarning[]
  /** 죽은 예약 key 집합 — 유효 구간이 0분. 회색 빗금 표시 + TSV/누적 제외. */
  deadKeys: Set<string>
}

/**
 * 저장된 booking 들을 현재 데이터에 대조 — 조용히 지우지 않는다.
 * 매칭 실패(명단에 없는 이름/기간 밖 날짜/범위 밖 시각)와 유효 구간이
 * 완전히 사라진(0분) 예약을 경고로 만든다. 유효 구간이 1분이라도 남은
 * 예약은 정상 — 화면·TSV·누적에 그대로 포함된다.
 */
export function computeBookingIssues(
  model: ScheduleModel,
  bookings: Iterable<string>,
): BookingIssues {
  const warnings: AppWarning[] = []
  const deadKeys = new Set<string>()
  for (const key of bookings) {
    const ref = parseBookingKey(key)
    if (!ref) {
      warnings.push({
        kind: 'stale-booking',
        message: `형식이 올바르지 않은 예약 key: "${key}"`,
        detail: '이 예약은 화면/내보내기에서 제외돼요.',
      })
      continue
    }
    if (!model.rosterSet.has(ref.member)) {
      warnings.push({
        kind: 'name-mismatch',
        message: `예약된 부원 "${ref.member}" 이(가) 일정조사 명단에 없어요 (${ref.dateKey} ${ref.hour}시)`,
        detail: `key: ${key} — 명단 이름이 바뀌었거나 오타일 수 있어요.`,
      })
      continue
    }
    if (
      !model.dateByKey.has(ref.dateKey) ||
      ref.hour < model.startHour ||
      ref.hour >= model.endHour
    ) {
      warnings.push({
        kind: 'stale-booking',
        message: `예약 ${ref.dateKey} ${ref.hour}시 ${ref.member} — 현재 조사 기간/시간 범위에 없어요`,
        detail: `key: ${key} — 관리자 모드에서 해당 칸을 찾을 수 없어 화면에 표시되지 않아요.`,
      })
      continue
    }
    const avail = model.availOf(ref.member, ref.dateKey)
    const { total } = effectiveCellSlices(
      ref.hour * 60,
      (ref.hour + 1) * 60,
      avail.ranges,
      model.teamRangesOf(ref.member, ref.dateKey),
    )
    if (total === 0) {
      deadKeys.add(key)
      warnings.push({
        kind: 'stale-booking',
        message: `예약 ${ref.dateKey} ${formatTime(ref.hour * 60)} ${ref.member} — 유효 구간이 사라졌어요`,
        detail:
          '팀연습 재붙여넣기 또는 가용시간 수정으로 이 칸에 유효 구간이 남아 있지 않아요. ' +
          '화면에 회색 빗금으로 남아 있으니 관리자 모드에서 칸을 클릭해 직접 제거할 수 있어요.',
      })
    }
  }
  return { warnings, deadKeys }
}

/** 현재 데이터와 매칭되는 예약마다 유효 분 합계를 콜백 — 누적 계산 공용. */
function eachValidBookingTotal(
  model: ScheduleModel,
  bookings: Iterable<string>,
  cb: (member: string, dateKey: string, total: number) => void,
): void {
  for (const key of bookings) {
    const ref = parseBookingKey(key)
    if (!ref) continue
    if (!model.rosterSet.has(ref.member)) continue
    if (!model.dateByKey.has(ref.dateKey)) continue
    if (ref.hour < model.startHour || ref.hour >= model.endHour) continue
    const avail = model.availOf(ref.member, ref.dateKey)
    const { total } = effectiveCellSlices(
      ref.hour * 60,
      (ref.hour + 1) * 60,
      avail.ranges,
      model.teamRangesOf(ref.member, ref.dateKey),
    )
    cb(ref.member, ref.dateKey, total)
  }
}

/**
 * 부원별 전체 기간 누적 갠연 시간 (분) — 클릭한 칸 수가 아니라
 * 유효 구간의 실제 분 합계. 죽은(0분) 예약은 자연히 0 기여.
 */
export function cumulativeMinutesByMember(
  model: ScheduleModel,
  bookings: Iterable<string>,
): Map<string, number> {
  const out = new Map<string, number>()
  eachValidBookingTotal(model, bookings, (member, _dateKey, total) => {
    out.set(member, (out.get(member) ?? 0) + total)
  })
  return out
}

/**
 * 날짜별(전 부원 합산) 유효 갠연 분 합계 — 주간 스트립/월 달력 캡션용.
 * 예약 칸 수가 아니라 유효 분 기준이라 부분 참여·죽은 예약에 왜곡되지 않는다.
 * 합계가 0 인 날짜는 담지 않는다.
 */
export function cumulativeMinutesByDate(
  model: ScheduleModel,
  bookings: Iterable<string>,
): Map<string, number> {
  const out = new Map<string, number>()
  eachValidBookingTotal(model, bookings, (_member, dateKey, total) => {
    if (total > 0) out.set(dateKey, (out.get(dateKey) ?? 0) + total)
  })
  return out
}
