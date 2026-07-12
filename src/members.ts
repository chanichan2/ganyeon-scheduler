/**
 * 참여부원 셀 토큰화/파싱 — sonsesang2026 src/parseWorkbook.ts 에서
 * xlsx 의존성 없이 그대로 추출 (tokenizeMembersCell / parseMemberToken / GANYEON_SONG).
 */

/** 곡명이 정확히 이 값이면 개인연습(갠연) 슬롯. */
export const GANYEON_SONG = '갠연'

/**
 * 참여부원 토큰 파싱용 정규식.
 * 그룹1: 이름 (괄호 없음).
 * 그룹2(옵션): 괄호 안 특이사항.
 */
export const MEMBER_TOKEN_RE = /^([^()]+)(?:\(([^)]*)\))?$/

/** 부원 1명의 출석 상태. */
export type MemberStatus = 'confirmed' | 'tentative' | 'partial'

/** 참여부원 셀에서 파싱된 한 명의 부원 정보. */
export interface ParsedMember {
  name: string
  status: MemberStatus
  /** partial 일 때 괄호 안 원본 텍스트. */
  window?: string
}

/**
 * 토큰 1개 → ParsedMember.
 * 정규식에 매칭되지 않거나 이름이 비어있으면 ok=false.
 *
 * 괄호 안 내용 처리 정책 (관대한 쪽으로 일반화):
 *  - 비어있음 (`이름()`) / 괄호 없음 → confirmed
 *  - 정확히 `미정` → tentative
 *  - 그 외 모든 텍스트 (시간 윈도우 `16~17:30`, 콤마 포함 `~19, 21~`,
 *    임의 메모 `자전거 타다 옴` 등) → partial 로 두고 그 텍스트를 그대로
 *    `window` 에 보존.
 */
export function parseMemberToken(token: string): {
  member: ParsedMember | null
  ok: boolean
} {
  const m = MEMBER_TOKEN_RE.exec(token)
  if (!m) return { member: null, ok: false }
  const name = m[1].trim()
  if (!name) return { member: null, ok: false }
  const note = m[2]?.trim()
  if (note === undefined || note === '')
    return { member: { name, status: 'confirmed' }, ok: true }
  if (note === '미정') return { member: { name, status: 'tentative' }, ok: true }
  return { member: { name, status: 'partial', window: note }, ok: true }
}

/**
 * 참여부원 셀을 토큰들로 분리.
 *
 * 괄호 *밖* 공백만 split 경계로 사용. 괄호 안 공백·콤마·기타 텍스트는
 * 토큰의 일부로 그대로 보존됨. 닫는 괄호가 없는 비정상 토큰은 그대로
 * 토큰으로 내보내져 검증 단계에서 경고로 잡힘.
 *
 * 예: "조윤서(~19, 21~) 홍길동(미정)"
 *  → ["조윤서(~19, 21~)", "홍길동(미정)"]
 */
export function tokenizeMembersCell(cell: string): string[] {
  const tokens: string[] = []
  let cur = ''
  let depth = 0
  for (let i = 0; i < cell.length; i++) {
    const ch = cell[i]
    if (ch === '(') {
      depth++
      cur += ch
    } else if (ch === ')') {
      depth = Math.max(0, depth - 1)
      cur += ch
    } else if (depth === 0 && /\s/.test(ch)) {
      if (cur) {
        tokens.push(cur)
        cur = ''
      }
    } else {
      cur += ch
    }
  }
  if (cur) tokens.push(cur)
  return tokens
}
