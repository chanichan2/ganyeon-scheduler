import { describe, expect, it } from 'vitest'
import { buildScheduleModel, computeBookingIssues } from './model'
import {
  boundaryOverrideKey,
  boundaryResetOps,
  boundaryToggleOps,
  splitServerKeys,
} from './overrides'

describe('splitServerKeys — 서버 key 분리', () => {
  it('수용8: boundary| key 는 예약에서 분리되고 경고를 만들지 않는다', () => {
    const split = splitServerKeys([
      '8/1|13|민재',
      'boundary|8/1|14|cut',
      'boundary|8/2|11|join',
    ])
    expect([...split.bookings]).toEqual(['8/1|13|민재'])
    expect(split.overrides.get('8/1|14')).toBe('cut')
    expect(split.overrides.get('8/2|11')).toBe('join')
    expect(split.warnings).toEqual([])
  })

  it('수용8: boundary| key 가 예약 파싱/경고 패널(이름 매칭 등)을 오염시키지 않음', () => {
    const model = buildScheduleModel(
      {
        ok: true,
        settings: { startDate: '2026-07-25', startHour: 9, endHour: 22 },
        dates: ['8/1', '8/2'],
        availability: { 민재: { '8/1': 'O', '8/2': 'O' } },
      },
      { ok: true, teamRows: [], bookings: [] },
    )
    const split = splitServerKeys(['8/1|13|민재', 'boundary|8/1|14|cut'])
    const { warnings, staleKeys } = computeBookingIssues(model, split.bookings)
    expect(warnings).toEqual([])
    expect(staleKeys.size).toBe(0)
  })

  it('수용9: 같은 경계에 cut/join 동시 존재 → cut 우선 + boundary-override 경고', () => {
    const split = splitServerKeys([
      'boundary|8/2|13|cut',
      'boundary|8/2|13|join',
    ])
    expect(split.overrides.get('8/2|13')).toBe('cut')
    expect(split.warnings).toHaveLength(1)
    expect(split.warnings[0].kind).toBe('boundary-override')
    expect(split.warnings[0].message).toContain('8/2')
    expect(split.warnings[0].message).toContain('13')
  })

  it('형식이 깨진 boundary key 는 무시 + boundary-override 경고 (name-mismatch 아님)', () => {
    const split = splitServerKeys([
      'boundary|8/2|xx|cut', // 시각이 숫자가 아님
      'boundary|8/2|13', // 상태 누락
      'boundary|8/2|13|maybe', // 알 수 없는 상태
    ])
    expect(split.bookings.size).toBe(0)
    expect(split.overrides.size).toBe(0)
    expect(split.warnings).toHaveLength(3)
    expect(split.warnings.every((w) => w.kind === 'boundary-override')).toBe(
      true,
    )
  })
})

describe('boundaryToggleOps — 토글 UX 규칙 (수용6)', () => {
  const CUT_KEY = boundaryOverrideKey('8/2', 13, 'cut')
  const JOIN_KEY = boundaryOverrideKey('8/2', 13, 'join')

  it('자동 cut 상태에서 토글 → join override 저장', () => {
    expect(boundaryToggleOps(new Set(), '8/2', 13, 'cut', 'cut')).toEqual([
      { action: 'add', key: JOIN_KEY },
    ])
  })

  it('수용6: 반전 결과가 자동값과 같아지면 override key 삭제 (자동 복귀)', () => {
    // 자동 cut + join override 상태에서 토글 → cut = 자동값 → key 삭제만
    expect(
      boundaryToggleOps(new Set([JOIN_KEY]), '8/2', 13, 'cut', 'join'),
    ).toEqual([{ action: 'remove', key: JOIN_KEY }])
  })

  it('자동 join + cut override 상태에서 토글 → cut key 삭제만', () => {
    expect(
      boundaryToggleOps(new Set([CUT_KEY]), '8/2', 13, 'join', 'cut'),
    ).toEqual([{ action: 'remove', key: CUT_KEY }])
  })

  it('override 저장 시 반대 상태 key 를 먼저 remove 후 add (직렬 순서)', () => {
    // 자동 join + cut override → 토글해 다시 join 이 아니라...
    // 자동 cut + cut/join 충돌(유효 cut) → 토글 → join(≠자동) 저장
    expect(
      boundaryToggleOps(
        new Set([CUT_KEY, JOIN_KEY]),
        '8/2',
        13,
        'cut',
        'cut',
      ),
    ).toEqual([{ action: 'remove', key: CUT_KEY }]) // join 은 이미 있으므로 add 불필요
  })

  it('cut/join 충돌 + 반전 결과가 자동값 → 둘 다 삭제', () => {
    expect(
      boundaryToggleOps(
        new Set([CUT_KEY, JOIN_KEY]),
        '8/2',
        13,
        'join',
        'cut', // 충돌 시 cut 우선이 유효 상태
      ),
    ).toEqual([
      { action: 'remove', key: CUT_KEY },
      { action: 'remove', key: JOIN_KEY },
    ])
  })
})

describe('boundaryResetOps — 날짜별 자동값 초기화', () => {
  it('그 날짜의 override key 만 전부 remove (형식 깨진 key 포함, 예약은 유지)', () => {
    const rawKeys = new Set([
      '8/2|13|민재',
      boundaryOverrideKey('8/2', 13, 'cut'),
      boundaryOverrideKey('8/2', 14, 'join'),
      'boundary|8/2|xx|cut',
      boundaryOverrideKey('8/1', 11, 'cut'),
    ])
    const ops = boundaryResetOps(rawKeys, '8/2')
    expect(ops.every((o) => o.action === 'remove')).toBe(true)
    expect(new Set(ops.map((o) => o.key))).toEqual(
      new Set([
        'boundary|8/2|13|cut',
        'boundary|8/2|14|join',
        'boundary|8/2|xx|cut',
      ]),
    )
  })

  it('override 가 없으면 op 없음', () => {
    expect(boundaryResetOps(new Set(['8/2|13|민재']), '8/2')).toEqual([])
  })
})
