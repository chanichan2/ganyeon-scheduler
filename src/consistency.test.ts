/**
 * 상호 일관성 회귀 테스트 (P7) — 화면·경고·TSV·누적 시간이 항상 같은 사실을
 * 말하는지 명시적 시나리오로 고정한다.
 *
 * 규칙 (단 하나):
 *   유효 구간이 1분이라도 있으면 예약 가능/화면 표시/TSV 포함.
 *   0분이면 예약 불가, 기존 예약은 죽은 예약(dead) — 화면 빗금, TSV·누적 제외.
 */
import { createElement } from 'react'
import { render, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { parseBookingKey } from './bookingKey'
import { effectiveCellSlices } from './effective'
import {
  buildGanyeonExport,
  buildTsv,
  type ExportContext,
} from './export'
import {
  buildScheduleModel,
  computeBookingIssues,
  cumulativeMinutesByMember,
  type ScheduleModel,
} from './model'
import type { BoundaryState } from './overrides'
import { clipRanges, mergeRanges, totalMinutes } from './ranges'
import type { GanyeonPayload, MinRange, SurveyPayload } from './types'
import ExportPreview from './components/ExportPreview'

const START_DATE = '2026-07-25'
const NO_OVERRIDE = new Map<string, BoundaryState>()

function makeSurvey(
  availability: Record<string, Record<string, string>>,
): SurveyPayload {
  return {
    ok: true,
    settings: { startDate: START_DATE, startHour: 9, endHour: 22 },
    dates: ['8/1', '8/2'],
    availability,
  }
}

function makeGanyeon(teamRows: string[][] = []): GanyeonPayload {
  return { ok: true, teamRows, bookings: [] }
}

function ctxOf(model: ScheduleModel): ExportContext {
  return {
    dateKeys: model.dateKeys,
    startHour: model.startHour,
    endHour: model.endHour,
    roster: model.rosterSet,
    availOf: model.availOf,
    teamRangesOf: model.teamRangesOf,
  }
}

/** 예약 key 1개의 유효 분 (모델 기준 재계산). */
function bookingMinutes(model: ScheduleModel, key: string): number {
  const ref = parseBookingKey(key)!
  return effectiveCellSlices(
    ref.hour * 60,
    (ref.hour + 1) * 60,
    model.availOf(ref.member, ref.dateKey).ranges,
    model.teamRangesOf(ref.member, ref.dateKey),
  ).total
}

/** `member|dateKey` → 예약 칸 유효 slices 합집합. */
function slicesByMemberDate(
  model: ScheduleModel,
  bookings: string[],
): Map<string, MinRange[]> {
  const acc = new Map<string, MinRange[]>()
  for (const key of bookings) {
    const ref = parseBookingKey(key)!
    const { slices } = effectiveCellSlices(
      ref.hour * 60,
      (ref.hour + 1) * 60,
      model.availOf(ref.member, ref.dateKey).ranges,
      model.teamRangesOf(ref.member, ref.dateKey),
    )
    const k = `${ref.member}|${ref.dateKey}`
    acc.set(k, [...(acc.get(k) ?? []), ...slices])
  }
  for (const [k, v] of acc) acc.set(k, mergeRanges(v))
  return acc
}

/** TSV 행들이 실제로 담고 있는 부원별 참여 분 합계 (행 블록으로 클리핑). */
function tsvMinutesByMember(
  model: ScheduleModel,
  bookings: string[],
): Map<string, number> {
  const slicesBy = slicesByMemberDate(model, bookings)
  const { rows } = buildGanyeonExport(bookings, NO_OVERRIDE, ctxOf(model))
  const out = new Map<string, number>()
  for (const r of rows) {
    for (const [k, slices] of slicesBy) {
      const [member, dateKey] = k.split('|')
      if (dateKey !== r.dateKey) continue
      const inBlock = totalMinutes(
        clipRanges(slices, r.startHour * 60, r.endHour * 60),
      )
      if (inBlock > 0) out.set(member, (out.get(member) ?? 0) + inBlock)
    }
  }
  return out
}

/* ── P2 재현 시나리오: 부분 잠식(20분 잔존) + 완전 잠식(죽은 예약) ── */

// 민재: 종일 가능, 8/2 에 13·14 칸 예약. 이후 팀연습 13~13:40 붙여넣어짐 → 13시 칸 유효 20분.
// 민수: 종일 가능, 8/2 에 10시 칸 예약. 이후 팀연습 10~11 이 칸 전체를 덮음 → 죽은 예약.
const SCENARIO_SURVEY = makeSurvey({
  민수: { '8/1': 'O', '8/2': 'O' },
  민재: { '8/1': 'O', '8/2': 'O' },
})
const SCENARIO_TEAM = [
  ['8/2', '13', '13:40', '곡A', '', '민재'],
  ['8/2', '10', '11', '곡B', '', '민수'],
]
const SCENARIO_BOOKINGS = ['8/2|13|민재', '8/2|14|민재', '8/2|10|민수']

function scenarioModel(): ScheduleModel {
  return buildScheduleModel(SCENARIO_SURVEY, makeGanyeon(SCENARIO_TEAM))
}

describe('일관성 1 — dead 로 표시된 칸의 분 합계 = TSV 에서 빠진 분 합계', () => {
  it('유효 20분 칸은 dead 가 아니고 TSV 에 포함, 0분 칸만 dead 로 제외', () => {
    const model = scenarioModel()
    const { deadKeys, warnings } = computeBookingIssues(model, SCENARIO_BOOKINGS)

    // 죽은 예약은 민수 10시 칸 하나뿐 — 20분 남은 민재 13시 칸은 dead 아님·경고 없음
    expect([...deadKeys]).toEqual(['8/2|10|민수'])
    expect(warnings.filter((w) => w.message.includes('민재'))).toEqual([])

    // dead 칸의 분 합계 (정의상 0)
    const deadMinutes = [...deadKeys].reduce(
      (s, k) => s + bookingMinutes(model, k),
      0,
    )
    expect(deadMinutes).toBe(0)

    // 전체 예약 유효 분 − TSV 에 실린 분 = dead 분 (= 0) — 빠지는 분이 없다
    const bookedMinutes = SCENARIO_BOOKINGS.reduce(
      (s, k) => s + bookingMinutes(model, k),
      0,
    )
    const tsvTotal = [...tsvMinutesByMember(model, SCENARIO_BOOKINGS).values()]
      .reduce((s, v) => s + v, 0)
    expect(bookedMinutes - tsvTotal).toBe(deadMinutes)

    // TSV 실제 내용: 20분 잔존 칸이 그대로 포함, 죽은 칸은 행 없음
    const { rows } = buildGanyeonExport(
      SCENARIO_BOOKINGS,
      NO_OVERRIDE,
      ctxOf(model),
    )
    expect(buildTsv(rows, START_DATE)).toBe(
      '2026. 8. 2\t13\t15\t갠연\t\t민재(13:40~)',
    )
  })
})

describe('일관성 2 — 부원별 누적 표시 시간 = TSV 전체 참여 분 합계', () => {
  it('민재 80분(20+60), 민수 0분 — 누적과 TSV 가 일치', () => {
    const model = scenarioModel()
    const cum = cumulativeMinutesByMember(model, SCENARIO_BOOKINGS)
    expect(cum.get('민재')).toBe(80)
    expect(cum.get('민수') ?? 0).toBe(0)

    const tsvMin = tsvMinutesByMember(model, SCENARIO_BOOKINGS)
    for (const name of model.roster) {
      expect(tsvMin.get(name) ?? 0).toBe(cum.get(name) ?? 0)
    }
  })
})

describe('일관성 3 — 미리보기 모달의 행 = buildTsv 결과 행 (완전 일치)', () => {
  it('모달 테이블의 각 행을 탭으로 이으면 TSV 문자열과 정확히 같다', () => {
    const model = scenarioModel()
    const bookings = new Set(SCENARIO_BOOKINGS)
    const { rows } = buildGanyeonExport(bookings, NO_OVERRIDE, ctxOf(model))
    const tsvLines = buildTsv(rows, model.startDate).split('\n')

    const { container } = render(
      createElement(ExportPreview, {
        open: true,
        model,
        bookings,
        overrides: NO_OVERRIDE,
        hasPendingOps: () => false,
        onToggleBoundary: vi.fn(),
        onResetDate: vi.fn(),
        onToast: vi.fn(),
        onClose: vi.fn(),
      }),
    )
    const table = container.querySelector('tbody')!
    const rendered = [...within(table as HTMLElement).getAllByRole('row')].map(
      (tr) =>
        [...tr.querySelectorAll('td')]
          .map((td) => td.textContent ?? '')
          .join('\t'),
    )
    expect(rendered).toEqual(tsvLines)
  })
})

describe('일관성 4 — 기존 수용 기준 유지', () => {
  it('민재 단독 ~14:30 — "2026. 8. 1\\t13\\t15\\t갠연\\t\\t민재(~14:30)"', () => {
    const model = buildScheduleModel(
      makeSurvey({ 민재: { '8/1': '~14:30', '8/2': 'O' } }),
      makeGanyeon(),
    )
    const { rows } = buildGanyeonExport(
      ['8/1|13|민재', '8/1|14|민재'],
      NO_OVERRIDE,
      ctxOf(model),
    )
    expect(buildTsv(rows, START_DATE)).toBe(
      '2026. 8. 1\t13\t15\t갠연\t\t민재(~14:30)',
    )
  })

  it('8/2 오전(10~13)/오후(13~15) — 맞닿기만 하면 두 행 분리', () => {
    const model = buildScheduleModel(
      makeSurvey({
        신연솔: { '8/1': 'O', '8/2': 'O' },
        안태건: { '8/1': 'O', '8/2': 'O' },
        이경준: { '8/1': 'O', '8/2': '~12:30' },
        이소영: { '8/1': 'O', '8/2': 'O' },
        전나형: { '8/1': 'O', '8/2': 'O' },
        정현찬: { '8/1': 'O', '8/2': 'O' },
      }),
      makeGanyeon(),
    )
    const bookings = [
      '8/2|10|신연솔',
      '8/2|11|신연솔',
      '8/2|10|안태건',
      '8/2|11|안태건',
      '8/2|12|안태건',
      '8/2|10|이경준',
      '8/2|11|이경준',
      '8/2|12|이경준',
      '8/2|10|이소영',
      '8/2|11|이소영',
      '8/2|12|이소영',
      '8/2|13|전나형',
      '8/2|14|전나형',
      '8/2|13|정현찬',
      '8/2|14|정현찬',
    ]
    const { rows } = buildGanyeonExport(bookings, NO_OVERRIDE, ctxOf(model))
    expect(buildTsv(rows, START_DATE)).toBe(
      '2026. 8. 2\t10\t13\t갠연\t\t신연솔(~12) 안태건 이경준(~12:30) 이소영\n' +
        '2026. 8. 2\t13\t15\t갠연\t\t전나형 정현찬',
    )
  })

  it('다리 놓기 + 13 경계 cut override → 앞 행 민수(12~), 뒷 행 민수(~14)', () => {
    const model = buildScheduleModel(
      makeSurvey({
        민수: { '8/1': 'O', '8/2': 'O' },
        전나형: { '8/1': 'O', '8/2': 'O' },
        정현찬: { '8/1': 'O', '8/2': 'O' },
        신연솔: { '8/1': 'O', '8/2': 'O' },
      }),
      makeGanyeon(),
    )
    const bookings = [
      '8/2|10|신연솔',
      '8/2|11|신연솔',
      '8/2|12|신연솔',
      '8/2|12|민수',
      '8/2|13|민수',
      '8/2|13|전나형',
      '8/2|14|전나형',
      '8/2|13|정현찬',
      '8/2|14|정현찬',
    ]
    // 민수 12~14 가 13 경계를 가로질러 자동은 join — cut override 로 분리
    const auto = buildGanyeonExport(bookings, NO_OVERRIDE, ctxOf(model))
    expect(auto.boundaries.find((b) => b.hour === 13)?.auto).toBe('join')

    const overrides = new Map<string, BoundaryState>([['8/2|13', 'cut']])
    const { rows } = buildGanyeonExport(bookings, overrides, ctxOf(model))
    expect(buildTsv(rows, START_DATE)).toBe(
      '2026. 8. 2\t10\t13\t갠연\t\t민수(12~) 신연솔\n' +
        '2026. 8. 2\t13\t15\t갠연\t\t민수(~14) 전나형 정현찬',
    )
  })
})
