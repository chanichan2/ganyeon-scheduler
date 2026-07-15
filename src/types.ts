/**
 * 갠연 스케줄러 도메인 타입.
 *
 * 데이터 흐름:
 *   GET ① (일정조사 Apps Script) → settings/dates/availability
 *   GET ② (갠연 Apps Script)     → teamRows(연습일정 탭)/bookings(PropertiesService)
 *
 * 모든 시간 계산은 "자정 기준 분 단위 정수" 로 한다 (예: 13:30 → 810).
 * 문자열/부동소수점 시(hour) 계산 금지 — 표시 단계에서만 포맷.
 */

/** 분 단위 정수 구간 [시작분, 끝분). 항상 시작 < 끝. */
export type MinRange = [number, number]

/** 가용시간 셀 파싱 결과. */
export interface Availability {
  ranges: MinRange[]
  mijeong: boolean
}

/* ── GET ① — 일정조사 API payload ─────────────────────────────── */

export interface SurveySettings {
  /** "YYYY-MM-DD". 연도 추론(해 넘김 포함)의 기준. */
  startDate: string
  endDate?: string
  /** 시간 그리드 범위 — 하드코딩 금지, 항상 이 값을 쓴다. */
  startHour: number
  endHour: number
}

export interface SurveyPayload {
  ok: true
  settings: SurveySettings
  /** 조사 날짜 목록 — "M/D" 짧은 형식 또는 Apps Script Date 직렬화 긴 형식. */
  dates: string[]
  /** 부원 → (날짜 헤더 → raw 셀 문자열). 부원 명단의 진실. */
  availability: Record<string, Record<string, string>>
}

/* ── GET ② — 갠연 API payload ─────────────────────────────────── */

export interface GanyeonPayload {
  ok: true
  /** 연습일정 탭을 getDisplayValues() 로 읽은 문자열 그대로 (헤더 행 포함 가능). */
  teamRows: string[][]
  /** booking key 배열 — `${M/D}|${hour}|${memberName}`. */
  bookings: string[]
}

/* ── 연습일정(팀연습) 행 ──────────────────────────────────────── */

export type TeamMemberStatus = 'confirmed' | 'tentative' | 'partial'

export interface TeamMember {
  name: string
  status: TeamMemberStatus
  /** partial 일 때 괄호 안 원본 텍스트. */
  window?: string
  /** 이 연습에서 실제로 참여하는 구간 (분). 괄호 시간 메모 반영. */
  ranges: MinRange[]
}

export interface TeamPractice {
  /** 시트 화면에 보이는 행 번호 (1-based). */
  rowIndex: number
  /** "M/D" 정규화된 날짜 키. */
  dateKey: string
  startMin: number
  endMin: number
  song: string
  members: TeamMember[]
}

/* ── 경고 패널 ────────────────────────────────────────────────── */

export type WarningKind =
  /** 1. 가용시간 파싱 실패 셀 */
  | 'availability-parse'
  /** 2. 연습일정 행 파싱 실패 */
  | 'team-row-parse'
  /** 3. 이름 매칭 실패 (연습일정 참여자/booking 이름이 명단에 없음) */
  | 'name-mismatch'
  /** 4. 일정조사 기간 밖 날짜의 연습일정 행 */
  | 'date-out-of-range'
  /** 5. 연습일정 탭에 곡명 "갠연" 행 존재 (이중 카운트 위험) */
  | 'ganyeon-row'
  /** 6. 유효 구간이 사라졌거나 30분 미만이 된 기존 예약 */
  | 'stale-booking'
  /** 7. 같은 부원의 팀연습끼리 겹침 등 데이터 이상 */
  | 'team-overlap'
  /** 8. 경계 스위치 override key 형식 오류/cut·join 충돌 */
  | 'boundary-override'

export interface AppWarning {
  kind: WarningKind
  /** 사람이 읽을 수 있는 한 줄 메시지. */
  message: string
  /** raw 값/오류 메시지 등 자세한 내용. */
  detail?: string
}
