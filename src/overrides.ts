/**
 * 경계 스위치 override — run 내부의 정각 경계를 사람이 수동으로
 * 연결(join)/절단(cut) 지정하는 기능의 저장·파싱 계층.
 *
 * 저장소는 기존 예약과 같은 서버 배열(Apps Script PropertiesService)을
 * 그대로 재사용하며, key 형식만 다르다:
 *   `boundary|M/D|H|cut` 또는 `boundary|M/D|H|join` (예: "boundary|8/2|13|cut")
 *
 * 규칙:
 *  - localStorage 에 저장하지 않는다 — 서버가 유일한 진실.
 *  - `boundary|` 접두 key 는 예약 파싱/경고 패널을 오염시키면 안 된다 —
 *    항상 splitServerKeys 로 먼저 분리한다.
 *  - 한 경계에 cut/join 이 동시에 있으면 cut 우선 + 경고.
 *  - 예약 변경으로 어떤 run 의 내부 경계도 아니게 된 override 는
 *    조용히 무시된다 (행 생성 시 참조되지 않을 뿐 — 에러/경고/삭제 불필요).
 */

import type { AppWarning } from './types'

export type BoundaryState = 'cut' | 'join'

export const BOUNDARY_PREFIX = 'boundary|'

/** override 저장 key. */
export function boundaryOverrideKey(
  dateKey: string,
  hour: number,
  state: BoundaryState,
): string {
  return `${BOUNDARY_PREFIX}${dateKey}|${hour}|${state}`
}

/** override 맵 조회 key — `M/D|H`. */
export function boundaryMapKey(dateKey: string, hour: number): string {
  return `${dateKey}|${hour}`
}

export interface ServerKeySplit {
  /** 예약 key 만 (boundary| 제외). 화면/모델/경고 계산은 전부 이것만 쓴다. */
  bookings: Set<string>
  /** `M/D|H` → 유효 override 상태 (충돌 시 cut 우선). */
  overrides: Map<string, BoundaryState>
  /** override key 형식 오류/충돌 경고. */
  warnings: AppWarning[]
}

/**
 * 서버 bookings 배열을 예약 key 와 경계 override 로 분리.
 * boundary| 접두 key 는 여기서만 해석하고, 이후 예약 파싱 경로
 * (parseBookingKey/경고 패널)에는 절대 흘러들지 않는다.
 */
export function splitServerKeys(keys: Iterable<string>): ServerKeySplit {
  const bookings = new Set<string>()
  const cut = new Set<string>()
  const join = new Set<string>()
  const warnings: AppWarning[] = []

  for (const key of keys) {
    if (typeof key !== 'string') continue
    if (!key.startsWith(BOUNDARY_PREFIX)) {
      bookings.add(key)
      continue
    }
    const parts = key.split('|')
    const valid =
      parts.length === 4 &&
      /^\d{1,2}\/\d{1,2}$/.test(parts[1]) &&
      /^\d{1,2}$/.test(parts[2]) &&
      (parts[3] === 'cut' || parts[3] === 'join')
    if (!valid) {
      warnings.push({
        kind: 'boundary-override',
        message: `형식이 올바르지 않은 경계 스위치 key: "${key}"`,
        detail:
          '이 key 는 무시돼요. 내보내기 미리보기에서 해당 날짜를 "자동값으로 초기화" 하면 정리할 수 있어요.',
      })
      continue
    }
    const mapKey = boundaryMapKey(parts[1], parseInt(parts[2], 10))
    if (parts[3] === 'cut') cut.add(mapKey)
    else join.add(mapKey)
  }

  const overrides = new Map<string, BoundaryState>()
  for (const k of join) overrides.set(k, 'join')
  for (const k of cut) {
    if (join.has(k)) {
      const [d, h] = k.split('|')
      warnings.push({
        kind: 'boundary-override',
        message: `경계 ${d} ${h}시에 절단/연결 override 가 동시에 있어요 — 절단(cut)을 우선 적용해요`,
        detail:
          '내보내기 미리보기에서 그 경계 스위치를 토글하면 정리돼요.',
      })
    }
    overrides.set(k, 'cut') // 충돌 시 cut 우선
  }
  return { bookings, overrides, warnings }
}

/* ── 토글/초기화 op 계산 ─────────────────────────────────────── */

export interface KeyOp {
  action: 'add' | 'remove'
  key: string
}

/**
 * 경계 스위치 탭 → 서버에 보낼 op 목록 (remove 먼저, add 나중 — 직렬 큐 순서).
 * 유효 상태(effective)를 반전한 결과가 자동 기본값(auto)과 같아지면
 * override key 를 전부 삭제(자동 복귀), 다르면 그 상태의 key 를 저장.
 * cut/join 이 동시에 남은 비정상 상태도 한 번의 토글로 정리된다.
 */
export function boundaryToggleOps(
  rawKeys: ReadonlySet<string>,
  dateKey: string,
  hour: number,
  auto: BoundaryState,
  effective: BoundaryState,
): KeyOp[] {
  const next: BoundaryState = effective === 'cut' ? 'join' : 'cut'
  const ops: KeyOp[] = []
  for (const state of ['cut', 'join'] as const) {
    const key = boundaryOverrideKey(dateKey, hour, state)
    if (rawKeys.has(key) && (next === auto || state !== next)) {
      ops.push({ action: 'remove', key })
    }
  }
  if (next !== auto) {
    const key = boundaryOverrideKey(dateKey, hour, next)
    if (!rawKeys.has(key)) ops.push({ action: 'add', key })
  }
  return ops
}

/**
 * 한 날짜의 override 전부 삭제 (자동값으로 초기화).
 * 형식이 깨진 boundary key 도 날짜가 일치하면 함께 정리한다.
 */
export function boundaryResetOps(
  rawKeys: ReadonlySet<string>,
  dateKey: string,
): KeyOp[] {
  const ops: KeyOp[] = []
  for (const key of rawKeys) {
    if (!key.startsWith(BOUNDARY_PREFIX)) continue
    if (key.split('|')[1] === dateKey) ops.push({ action: 'remove', key })
  }
  return ops
}
