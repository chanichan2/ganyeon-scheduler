import { describe, expect, it } from 'vitest'
import { parseAvailability } from './availability'
import {
  buildGanyeonExport,
  buildTsv,
  exportMemberEntry,
  type ExportContext,
} from './export'
import type { BoundaryState } from './overrides'
import type { Availability, MinRange } from './types'

/** 조사 범위 — 9:00~22:00, 2026 여름 (startDate 2026-07-25). */
const START_HOUR = 9
const END_HOUR = 22
const START = START_HOUR * 60
const END = END_HOUR * 60
const START_DATE = '2026-07-25'

const NO_OVERRIDE = new Map<string, BoundaryState>()

/** 테스트용 컨텍스트 빌더 — 부원별 raw 가용시간 문자열로 구성. */
function makeCtx(
  availRaw: Record<string, Record<string, string>>,
  teamRanges: Record<string, Record<string, MinRange[]>> = {},
): ExportContext {
  const parsed = new Map<string, Availability>()
  for (const [name, byDate] of Object.entries(availRaw)) {
    for (const [dateKey, raw] of Object.entries(byDate)) {
      parsed.set(`${name}|${dateKey}`, parseAvailability(raw, START, END))
    }
  }
  return {
    dateKeys: ['8/1', '8/2'],
    startHour: START_HOUR,
    endHour: END_HOUR,
    roster: new Set(Object.keys(availRaw)),
    availOf: (m, d) =>
      parsed.get(`${m}|${d}`) ?? { ranges: [], mijeong: false },
    teamRangesOf: (m, d) => teamRanges[m]?.[d] ?? [],
  }
}

/** 수용 1·2 공용 — 8/2 오전/오후 갠연 시나리오 예약. */
const MORNING_AFTERNOON = [
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

const MORNING_AFTERNOON_CTX = {
  신연솔: { '8/2': 'O' },
  안태건: { '8/2': 'O' },
  이경준: { '8/2': '~12:30' },
  이소영: { '8/2': 'O' },
  전나형: { '8/2': 'O' },
  정현찬: { '8/2': 'O' },
}

describe('TSV 내보내기 — 수용 기준 (겹침 기반 병합)', () => {
  it('수용1: 맞닿기만 한 오전/오후 갠연은 두 행 (13 경계 자동 절단)', () => {
    const ctx = makeCtx(MORNING_AFTERNOON_CTX)
    const { rows, boundaries, skipped } = buildGanyeonExport(
      MORNING_AFTERNOON,
      NO_OVERRIDE,
      ctx,
    )
    expect(skipped).toBe(0)
    // run 10~15 의 내부 경계 11·12·14 는 연결, 13 은 절단
    expect(
      boundaries.map((b) => [b.hour, b.auto, b.effective, b.overridden]),
    ).toEqual([
      [11, 'join', 'join', false],
      [12, 'join', 'join', false],
      [13, 'cut', 'cut', false],
      [14, 'join', 'join', false],
    ])
    expect(buildTsv(rows, START_DATE)).toBe(
      '2026. 8. 2\t10\t13\t갠연\t\t신연솔(~12) 안태건 이경준(~12:30) 이소영\n' +
        '2026. 8. 2\t13\t15\t갠연\t\t전나형 정현찬',
    )
  })

  it('수용2: 다리 놓기 — 민수 12~14 추가로 13 경계가 연결되어 기본 한 행', () => {
    const ctx = makeCtx({ ...MORNING_AFTERNOON_CTX, 민수: { '8/2': 'O' } })
    const bookings = [...MORNING_AFTERNOON, '8/2|12|민수', '8/2|13|민수']
    const { rows, boundaries } = buildGanyeonExport(bookings, NO_OVERRIDE, ctx)
    expect(boundaries.find((b) => b.hour === 13)?.auto).toBe('join')
    expect(rows).toHaveLength(1)
    expect(buildTsv(rows, START_DATE)).toBe(
      '2026. 8. 2\t10\t15\t갠연\t\t민수(12~14) 신연솔(~12) 안태건(~13) 이경준(~12:30) 이소영(~13) 전나형(13~) 정현찬(13~)',
    )
  })

  it('수용2: 13 경계 cut override → 두 행 분리, 민수는 (12~)/(~14)', () => {
    const ctx = makeCtx({ ...MORNING_AFTERNOON_CTX, 민수: { '8/2': 'O' } })
    const bookings = [...MORNING_AFTERNOON, '8/2|12|민수', '8/2|13|민수']
    const overrides = new Map<string, BoundaryState>([['8/2|13', 'cut']])
    const { rows, boundaries } = buildGanyeonExport(bookings, overrides, ctx)
    const b13 = boundaries.find((b) => b.hour === 13)!
    expect(b13.auto).toBe('join')
    expect(b13.effective).toBe('cut')
    expect(b13.overridden).toBe(true)
    expect(buildTsv(rows, START_DATE)).toBe(
      '2026. 8. 2\t10\t13\t갠연\t\t민수(12~) 신연솔(~12) 안태건 이경준(~12:30) 이소영\n' +
        '2026. 8. 2\t13\t15\t갠연\t\t민수(~14) 전나형 정현찬',
    )
  })

  it('수용3: 사슬 — A 10~12·B 11~14·C 13~15 가 겹침으로 이어지면 한 행', () => {
    const ctx = makeCtx({
      가온: { '8/1': 'O' },
      나래: { '8/1': 'O' },
      다솜: { '8/1': 'O' },
    })
    const { rows } = buildGanyeonExport(
      [
        '8/1|10|가온',
        '8/1|11|가온',
        '8/1|11|나래',
        '8/1|12|나래',
        '8/1|13|나래',
        '8/1|13|다솜',
        '8/1|14|다솜',
      ],
      NO_OVERRIDE,
      ctx,
    )
    expect(rows).toHaveLength(1)
    expect(buildTsv(rows, START_DATE)).toBe(
      '2026. 8. 1\t10\t15\t갠연\t\t가온(~12) 나래(11~14) 다솜(13~)',
    )
  })

  it('수용4: 클리핑 경계 — 가용 ~12:30 이면 13 경계는 절단, 빈 블록은 행 없음', () => {
    const ctx = makeCtx({ 민재: { '8/1': '~12:30' } })
    const { rows, boundaries } = buildGanyeonExport(
      ['8/1|12|민재', '8/1|13|민재'],
      NO_OVERRIDE,
      ctx,
    )
    // 클릭 칸이 경계 양쪽에 있어도 slice(12:00~12:30)가 안 가로지르면 절단
    expect(
      boundaries.map((b) => [b.hour, b.auto, b.effective]),
    ).toEqual([[13, 'cut', 'cut']])
    // 13~14 블록은 유효 slices 있는 부원이 없어 행 자체가 생성되지 않음
    expect(buildTsv(rows, START_DATE)).toBe(
      '2026. 8. 1\t12\t13\t갠연\t\t민재(~12:30)',
    )
  })

  it('수용5(기존 유지): 민재 ~14:30, 13·14 칸 → slice 가 14 를 가로질러 한 행', () => {
    const ctx = makeCtx({ 민재: { '8/1': '~14:30' } })
    const { rows, boundaries, skipped } = buildGanyeonExport(
      ['8/1|13|민재', '8/1|14|민재'],
      NO_OVERRIDE,
      ctx,
    )
    expect(skipped).toBe(0)
    expect(boundaries).toEqual([
      { dateKey: '8/1', hour: 14, auto: 'join', effective: 'join', overridden: false },
    ])
    expect(rows).toHaveLength(1)
    expect(buildTsv(rows, START_DATE)).toBe(
      '2026. 8. 1\t13\t15\t갠연\t\t민재(~14:30)',
    )
  })

  it('수용7: 어떤 run 의 내부 경계도 아닌 stale override 는 조용히 무시', () => {
    const ctx = makeCtx({ 민재: { '8/1': 'O' } })
    const staleOverrides = new Map<string, BoundaryState>([
      ['8/1|20', 'cut'],
      ['8/2|11', 'join'],
    ])
    const base = buildGanyeonExport(['8/1|13|민재'], NO_OVERRIDE, ctx)
    const withStale = buildGanyeonExport(['8/1|13|민재'], staleOverrides, ctx)
    expect(withStale.rows).toEqual(base.rows)
    expect(withStale.boundaries).toEqual([])
  })
})

describe('TSV 내보내기 — 행 병합', () => {
  it('겹침으로 이어지는 두 부원 블록 병합 — 갠연 13~16 에 지수(~14)', () => {
    const ctx = makeCtx({
      민재: { '8/1': 'O' },
      지수: { '8/1': '~14' },
    })
    const { rows } = buildGanyeonExport(
      ['8/1|13|민재', '8/1|14|민재', '8/1|15|민재', '8/1|13|지수'],
      NO_OVERRIDE,
      ctx,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].startHour).toBe(13)
    expect(rows[0].endHour).toBe(16)
    expect(rows[0].membersStr).toBe('민재 지수(~14)')
    expect(buildTsv(rows, START_DATE)).toBe(
      '2026. 8. 1\t13\t16\t갠연\t\t민재 지수(~14)',
    )
  })

  it('사이가 빈 두 run 은 두 행으로 분리 (떨어진 run 은 합치지 않음)', () => {
    const ctx = makeCtx({ 민재: { '8/1': 'O' } })
    const { rows } = buildGanyeonExport(
      ['8/1|13|민재', '8/1|15|민재'],
      NO_OVERRIDE,
      ctx,
    )
    expect(rows).toHaveLength(2)
    expect(rows[0].startHour).toBe(13)
    expect(rows[0].endHour).toBe(14)
    expect(rows[1].startHour).toBe(15)
    expect(rows[1].endHour).toBe(16)
  })

  it('다른 부원이 사이를 메워도 겹치는 시간이 없으면 경계에서 절단 — 세 행', () => {
    const ctx = makeCtx({
      민재: { '8/1': 'O' },
      지수: { '8/1': 'O' },
    })
    const { rows, boundaries } = buildGanyeonExport(
      ['8/1|13|민재', '8/1|14|지수', '8/1|15|민재'],
      NO_OVERRIDE,
      ctx,
    )
    // run 은 13~16 하나지만 14·15 경계를 가로지르는 slice 가 없음
    expect(boundaries.map((b) => [b.hour, b.auto])).toEqual([
      [14, 'cut'],
      [15, 'cut'],
    ])
    expect(rows.map((r) => [r.startHour, r.endHour, r.membersStr])).toEqual([
      [13, 14, '민재'],
      [14, 15, '지수'],
      [15, 16, '민재'],
    ])
  })

  it('행 정렬 — 날짜 → 시작 시각 순', () => {
    const ctx = makeCtx({
      민재: { '8/1': 'O', '8/2': 'O' },
    })
    const { rows } = buildGanyeonExport(
      ['8/2|10|민재', '8/1|15|민재', '8/1|10|민재'],
      NO_OVERRIDE,
      ctx,
    )
    expect(rows.map((r) => [r.dateKey, r.startHour])).toEqual([
      ['8/1', 10],
      ['8/1', 15],
      ['8/2', 10],
    ])
  })
})

describe('TSV 내보내기 — 미정/정렬/제외', () => {
  it('미정 부원 — 이름(미정)', () => {
    const ctx = makeCtx({ 지수: { '8/1': '미정' } })
    const { rows } = buildGanyeonExport(['8/1|13|지수'], NO_OVERRIDE, ctx)
    expect(rows[0].membersStr).toBe('지수(미정)')
  })

  it('부분 가용 + 미정 — 15 경계 절단 후 15~16 행에 지수(미정)', () => {
    const ctx = makeCtx({ 지수: { '8/1': '15~(미정)' } })
    const { rows } = buildGanyeonExport(
      ['8/1|14|지수', '8/1|15|지수'],
      NO_OVERRIDE,
      ctx,
    )
    // 14~15 칸의 유효 slice 가 없으므로 15 경계는 절단 → 14~15 블록은 행 없음
    expect(rows).toHaveLength(1)
    expect(rows[0].startHour).toBe(15)
    expect(rows[0].endHour).toBe(16)
    expect(rows[0].membersStr).toBe('지수(미정)')
  })

  it('참여부원 ko locale 정렬', () => {
    const ctx = makeCtx({
      하늘: { '8/1': 'O' },
      가온: { '8/1': 'O' },
      나래: { '8/1': 'O' },
    })
    const { rows } = buildGanyeonExport(
      ['8/1|13|하늘', '8/1|13|가온', '8/1|13|나래'],
      NO_OVERRIDE,
      ctx,
    )
    expect(rows[0].membersStr).toBe('가온 나래 하늘')
  })

  it('팀연습이 칸 중간에 있으면 두 조각 메모 (16~16:20,16:50~)', () => {
    const ctx = makeCtx(
      { 민재: { '8/1': 'O' } },
      { 민재: { '8/1': [[16 * 60 + 20, 16 * 60 + 50]] } },
    )
    const { rows } = buildGanyeonExport(['8/1|16|민재'], NO_OVERRIDE, ctx)
    expect(rows).toHaveLength(1)
    expect(rows[0].membersStr).toBe('민재(~16:20,16:50~)')
  })

  it('매칭되지 않는 예약은 skipped 로 집계 (조용한 누락 금지 — 경고 패널이 별도 처리)', () => {
    const ctx = makeCtx({ 민재: { '8/1': 'O' } })
    const { rows, skipped } = buildGanyeonExport(
      [
        '8/1|13|민재', // 정상
        '8/1|13|없는사람', // 명단에 없음
        '9/9|13|민재', // 조사 기간 밖
        '8/1|23|민재', // 시간 범위 밖
        '이상한키', // 형식 오류
      ],
      NO_OVERRIDE,
      ctx,
    )
    expect(rows).toHaveLength(1)
    expect(skipped).toBe(4)
  })

  it('유효 구간이 30분 미만이 된 예약만 있는 블록은 행을 만들지 않음', () => {
    const ctx = makeCtx({ 민재: { '8/1': '~13:10' } })
    const { rows } = buildGanyeonExport(['8/1|13|민재'], NO_OVERRIDE, ctx)
    expect(rows).toHaveLength(0)
  })
})

describe('exportMemberEntry — 괄호 메모 규칙', () => {
  const B0 = 13 * 60
  const B1 = 15 * 60

  it('블록 전체 커버 → 이름만', () => {
    expect(exportMemberEntry('민재', [[B0, B1]], B0, B1, false)).toBe('민재')
  })

  it('블록 시작과 같으면 시작 생략 — ~14:30', () => {
    expect(exportMemberEntry('민재', [[B0, 870]], B0, B1, false)).toBe(
      '민재(~14:30)',
    )
  })

  it('블록 끝과 같으면 끝 생략 — 14~', () => {
    expect(exportMemberEntry('민재', [[840, B1]], B0, B1, false)).toBe(
      '민재(14~)',
    )
  })

  it('둘 다 다르면 14:30~15:30 형태', () => {
    expect(
      exportMemberEntry('민재', [[870, 930]], 13 * 60, 16 * 60, false),
    ).toBe('민재(14:30~15:30)')
  })

  it('복수 조각은 콤마', () => {
    expect(
      exportMemberEntry(
        '민재',
        [
          [B0, 830],
          [850, B1],
        ],
        B0,
        B1,
        false,
      ),
    ).toBe('민재(~13:50,14:10~)')
  })

  it('30분 미만이면 null', () => {
    expect(exportMemberEntry('민재', [[B0, B0 + 29]], B0, B1, false)).toBeNull()
  })

  it('미정이면 메모 끝에 미정', () => {
    expect(exportMemberEntry('민재', [[B0, B1]], B0, B1, true)).toBe(
      '민재(미정)',
    )
    expect(exportMemberEntry('민재', [[900, 960]], B0, 16 * 60, true)).toBe(
      '민재(15~,미정)',
    )
  })
})
