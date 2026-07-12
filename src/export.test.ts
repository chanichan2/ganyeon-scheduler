import { describe, expect, it } from 'vitest'
import { parseAvailability } from './availability'
import {
  buildGanyeonExportRows,
  buildTsv,
  exportMemberEntry,
  type ExportContext,
} from './export'
import type { Availability, MinRange } from './types'

/** 조사 범위 — 9:00~22:00, 2026 여름 (startDate 2026-07-25). */
const START_HOUR = 9
const END_HOUR = 22
const START = START_HOUR * 60
const END = END_HOUR * 60
const START_DATE = '2026-07-25'

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

describe('TSV 내보내기 — 수용 기준', () => {
  it('민재(8/1, "~14:30") 13~14·14~15 칸 예약 → 정확히 이 한 줄', () => {
    const ctx = makeCtx({ 민재: { '8/1': '~14:30' } })
    const { rows, skipped } = buildGanyeonExportRows(
      ['8/1|13|민재', '8/1|14|민재'],
      ctx,
    )
    expect(skipped).toBe(0)
    expect(rows).toHaveLength(1)
    const tsv = buildTsv(rows, START_DATE)
    expect(tsv).toBe('2026. 8. 1\t13\t15\t갠연\t\t민재(~14:30)')
  })
})

describe('TSV 내보내기 — 행 병합 (옵션 2)', () => {
  it('두 부원 블록 병합 — 갠연 13~16 에 지수(~14)', () => {
    const ctx = makeCtx({
      민재: { '8/1': 'O' },
      지수: { '8/1': '~14' },
    })
    const { rows } = buildGanyeonExportRows(
      ['8/1|13|민재', '8/1|14|민재', '8/1|15|민재', '8/1|13|지수'],
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

  it('사이가 빈 두 run 은 두 행으로 분리', () => {
    const ctx = makeCtx({ 민재: { '8/1': 'O' } })
    const { rows } = buildGanyeonExportRows(
      ['8/1|13|민재', '8/1|15|민재'],
      ctx,
    )
    expect(rows).toHaveLength(2)
    expect(rows[0].startHour).toBe(13)
    expect(rows[0].endHour).toBe(14)
    expect(rows[1].startHour).toBe(15)
    expect(rows[1].endHour).toBe(16)
  })

  it('다른 부원의 예약이 사이를 메우면 한 run 으로 병합', () => {
    const ctx = makeCtx({
      민재: { '8/1': 'O' },
      지수: { '8/1': 'O' },
    })
    const { rows } = buildGanyeonExportRows(
      ['8/1|13|민재', '8/1|14|지수', '8/1|15|민재'],
      ctx,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].startHour).toBe(13)
    expect(rows[0].endHour).toBe(16)
    // 민재는 13~14 + 15~16 두 조각 → "13~14 가 아니라" 블록 기준 메모
    expect(rows[0].membersStr).toBe('민재(~14,15~) 지수(14~15)')
  })

  it('행 정렬 — 날짜 → 시작 시각 순', () => {
    const ctx = makeCtx({
      민재: { '8/1': 'O', '8/2': 'O' },
    })
    const { rows } = buildGanyeonExportRows(
      ['8/2|10|민재', '8/1|15|민재', '8/1|10|민재'],
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
    const { rows } = buildGanyeonExportRows(['8/1|13|지수'], ctx)
    expect(rows[0].membersStr).toBe('지수(미정)')
  })

  it('부분 가용 + 미정 — 이름(15~,미정)', () => {
    const ctx = makeCtx({ 지수: { '8/1': '15~(미정)' } })
    const { rows } = buildGanyeonExportRows(['8/1|14|지수', '8/1|15|지수'], ctx)
    expect(rows).toHaveLength(1)
    expect(rows[0].startHour).toBe(14)
    expect(rows[0].endHour).toBe(16)
    expect(rows[0].membersStr).toBe('지수(15~,미정)')
  })

  it('참여부원 ko locale 정렬', () => {
    const ctx = makeCtx({
      하늘: { '8/1': 'O' },
      가온: { '8/1': 'O' },
      나래: { '8/1': 'O' },
    })
    const { rows } = buildGanyeonExportRows(
      ['8/1|13|하늘', '8/1|13|가온', '8/1|13|나래'],
      ctx,
    )
    expect(rows[0].membersStr).toBe('가온 나래 하늘')
  })

  it('팀연습이 칸 중간에 있으면 두 조각 메모 (16~16:20,16:50~)', () => {
    const ctx = makeCtx(
      { 민재: { '8/1': 'O' } },
      { 민재: { '8/1': [[16 * 60 + 20, 16 * 60 + 50]] } },
    )
    const { rows } = buildGanyeonExportRows(['8/1|16|민재'], ctx)
    expect(rows).toHaveLength(1)
    expect(rows[0].membersStr).toBe('민재(~16:20,16:50~)')
  })

  it('매칭되지 않는 예약은 skipped 로 집계 (조용한 누락 금지 — 경고 패널이 별도 처리)', () => {
    const ctx = makeCtx({ 민재: { '8/1': 'O' } })
    const { rows, skipped } = buildGanyeonExportRows(
      [
        '8/1|13|민재', // 정상
        '8/1|13|없는사람', // 명단에 없음
        '9/9|13|민재', // 조사 기간 밖
        '8/1|23|민재', // 시간 범위 밖
        '이상한키', // 형식 오류
      ],
      ctx,
    )
    expect(rows).toHaveLength(1)
    expect(skipped).toBe(4)
  })

  it('유효 구간이 30분 미만이 된 예약만 있는 블록은 행을 만들지 않음', () => {
    const ctx = makeCtx({ 민재: { '8/1': '~13:10' } })
    const { rows } = buildGanyeonExportRows(['8/1|13|민재'], ctx)
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
