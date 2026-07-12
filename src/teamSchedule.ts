/**
 * 연습일정 탭(팀연습) 행 파싱.
 *
 * 입력은 새 갠연 Apps Script 가 getDisplayValues() 로 읽은 문자열 2D 배열 그대로.
 * 열 구조: 날짜 | 시작 | 종료 | 곡명 | 연습실 | 참여부원
 * (연습실 열은 존재하되 전부 비어 있어도 정상 동작 — 이 화면에서는 쓰지 않는다.)
 *
 * 오류 0 원칙: 해석에 실패한 행/토큰은 절대 추정하지 않는다 — 제외 + 경고.
 */

import { parseTimeToken, normalizeRaw } from './availability'
import { inferYear, parseSheetDateCell } from './dates'
import { GANYEON_SONG, parseMemberToken, tokenizeMembersCell } from './members'
import { parseMemberWindow } from './memberWindow'
import { rangesOverlap, fmtHM } from './ranges'
import type {
  AppWarning,
  MinRange,
  TeamMember,
  TeamPractice,
} from './types'

export interface TeamScheduleOptions {
  /** GET ① dates 를 정규화한 "M/D" 키 집합. */
  surveyDateKeys: Set<string>
  /** GET ① availability 의 부원 명단 (trim 완료). 이름 비교는 완전 일치만. */
  roster: Set<string>
  /** settings.startDate — 연도 추론 기준. 없으면 연도 검증 생략. */
  startDate: Date | null
}

export interface TeamScheduleResult {
  /** 조사 기간 안 날짜의, 화면에 쓸 팀연습 목록. */
  practices: TeamPractice[]
  warnings: AppWarning[]
}

/** 행이 전부 빈 문자열인지. */
function isEmptyRow(row: string[]): boolean {
  return row.every((c) => c == null || String(c).trim() === '')
}

/** 헤더 행 감지 — 첫 셀이 "날짜"면 헤더로 보고 건너뜀. */
function isHeaderRow(row: string[]): boolean {
  return String(row[0] ?? '').trim() === '날짜'
}

/** 시각 셀 "13" / "14:30" → 분. 실패 시 null. 전각/공백 정규화 포함. */
export function parseTimeCell(raw: string): number | null {
  const s = normalizeRaw(raw).replace(/\s+/g, '')
  if (s === '') return null
  const min = parseTimeToken(s)
  if (min == null) return null
  if (min < 0 || min > 24 * 60) return null
  return min
}

/**
 * 참여부원 1명의 실제 참여 구간 계산 (분).
 *  - 괄호 없음 / `이름()` / 임의 메모 / `미정` → 연습 전체 구간
 *  - 괄호 시간 메모(`~17`, `16:20~16:50`, `~19, 21~`) → 그 구간만
 * parseMemberWindow(fractional hours 기반)를 그대로 재사용하고,
 * 결과만 분 단위 정수로 반올림 변환한다.
 */
export function memberRangesInPractice(
  status: TeamMember['status'],
  window: string | undefined,
  startMin: number,
  endMin: number,
): MinRange[] {
  if (status === 'partial' && window) {
    const segs = parseMemberWindow(window, startMin / 60, endMin / 60)
    if (segs !== null) {
      return segs.map(([a, b]) => [Math.round(a * 60), Math.round(b * 60)])
    }
  }
  return [[startMin, endMin]]
}

/**
 * getDisplayValues 2D 배열 → 팀연습 목록 + 경고.
 * 조사 기간 밖 날짜의 행은 경고만 내고 practices 에서 제외
 * (화면·클리핑은 조사 날짜 단위이므로 어차피 그 일자 화면에서만 빠진다).
 */
export function parseTeamRows(
  teamRows: string[][],
  opts: TeamScheduleOptions,
): TeamScheduleResult {
  const practices: TeamPractice[] = []
  const warnings: AppWarning[] = []

  for (let i = 0; i < teamRows.length; i++) {
    const row = teamRows[i] ?? []
    const sheetRow = i + 1 // 시트 화면 행 번호 (1-based)
    if (isEmptyRow(row)) continue
    if (isHeaderRow(row)) continue

    const rawDate = String(row[0] ?? '')
    const rawStart = String(row[1] ?? '')
    const rawEnd = String(row[2] ?? '')
    const song = String(row[3] ?? '').trim()
    // row[4] = 연습실 — 이 화면에서는 사용하지 않음 (비어 있어도 무방)
    const rawMembers = String(row[5] ?? '')

    const rowText = `${rawDate} | ${rawStart}~${rawEnd} | ${song}`

    // 날짜
    const sheetDate = parseSheetDateCell(rawDate)
    if (!sheetDate) {
      warnings.push({
        kind: 'team-row-parse',
        message: `연습일정 ${sheetRow}행: 날짜를 해석하지 못했어요`,
        detail: `행 내용: ${rowText} / 날짜 값: "${rawDate}"`,
      })
      continue
    }

    // 시작/종료 시각
    const startMin = parseTimeCell(rawStart)
    const endMin = parseTimeCell(rawEnd)
    if (startMin == null || endMin == null || startMin >= endMin) {
      warnings.push({
        kind: 'team-row-parse',
        message: `연습일정 ${sheetRow}행: 시작/종료 시각을 해석하지 못했어요`,
        detail: `행 내용: ${rowText} / 시작: "${rawStart}", 종료: "${rawEnd}"`,
      })
      continue
    }

    if (!song) {
      warnings.push({
        kind: 'team-row-parse',
        message: `연습일정 ${sheetRow}행: 곡명이 비어 있어요`,
        detail: `행 내용: ${rowText}`,
      })
      continue
    }

    // 곡명이 정확히 "갠연"인 행 — 이 도구가 내보낸 기존 갠연 행.
    // 예약의 진실은 PropertiesService 에만 있으므로 팀연습으로 취급하지 않고
    // 무시하되 경고 패널에 표시 (이중 카운트 방지).
    if (song === GANYEON_SONG) {
      warnings.push({
        kind: 'ganyeon-row',
        message: `연습일정 ${sheetRow}행: 곡명 "${GANYEON_SONG}" 행이 있어요 — 이 행은 무시돼요`,
        detail:
          `행 내용: ${rowText} — 갠연 예약의 진실은 서버(PropertiesService)에만 있어요. ` +
          `이 행이 남아 있으면 스프레드시트에서 이중 카운트될 수 있으니 TSV 를 다시 붙여넣을 때 정리해 주세요.`,
      })
      continue
    }

    // 조사 기간 매칭 — M/D 키가 조사 날짜에 없거나, 연도가 명시돼 있는데
    // 추론 연도와 다르면 기간 밖으로 처리 (경고 + 화면 제외).
    const month = parseInt(sheetDate.dateKey.split('/')[0], 10)
    const yearMismatch =
      sheetDate.explicitYear != null &&
      opts.startDate != null &&
      sheetDate.explicitYear !== inferYear(month, opts.startDate)
    if (!opts.surveyDateKeys.has(sheetDate.dateKey) || yearMismatch) {
      warnings.push({
        kind: 'date-out-of-range',
        message: `연습일정 ${sheetRow}행: 날짜 ${rawDate.trim()} 이(가) 일정조사 기간에 없어요`,
        detail: `행 내용: ${rowText} — 이 행은 화면에 표시되지 않아요.`,
      })
      continue
    }

    // 참여부원
    const members: TeamMember[] = []
    for (const token of tokenizeMembersCell(rawMembers)) {
      const { member, ok } = parseMemberToken(token)
      if (!ok || !member) {
        warnings.push({
          kind: 'team-row-parse',
          message: `연습일정 ${sheetRow}행: 참여부원 토큰 "${token}" 을(를) 인식하지 못했어요`,
          detail: `행 내용: ${rowText}`,
        })
        continue
      }
      if (!opts.roster.has(member.name)) {
        warnings.push({
          kind: 'name-mismatch',
          message: `연습일정 ${sheetRow}행: 참여부원 "${member.name}" 이(가) 일정조사 명단에 없어요`,
          detail: `행 내용: ${rowText} — 이 부원은 화면에서 제외돼요. 오타이거나 명단 누락일 수 있어요.`,
        })
        continue
      }
      members.push({
        name: member.name,
        status: member.status,
        window: member.window,
        ranges: memberRangesInPractice(
          member.status,
          member.window,
          startMin,
          endMin,
        ),
      })
    }

    practices.push({
      rowIndex: sheetRow,
      dateKey: sheetDate.dateKey,
      startMin,
      endMin,
      song,
      members,
    })
  }

  warnings.push(...findTeamOverlaps(practices))

  practices.sort(
    (a, b) => a.startMin - b.startMin || a.rowIndex - b.rowIndex,
  )
  return { practices, warnings }
}

/**
 * 같은 부원이 같은 날 두 팀연습에 겹치게 들어간 데이터 이상 탐지.
 * (같은 부원 행에서 곡 오버레이가 겹치는 케이스 — 화면에는 그대로 그리되 경고.)
 */
export function findTeamOverlaps(practices: TeamPractice[]): AppWarning[] {
  const warnings: AppWarning[] = []
  const byDate = new Map<string, TeamPractice[]>()
  for (const p of practices) {
    const list = byDate.get(p.dateKey)
    if (list) list.push(p)
    else byDate.set(p.dateKey, [p])
  }
  for (const [dateKey, list] of byDate) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]
        const b = list[j]
        for (const ma of a.members) {
          const mb = b.members.find((m) => m.name === ma.name)
          if (!mb) continue
          if (rangesOverlap(ma.ranges, mb.ranges)) {
            warnings.push({
              kind: 'team-overlap',
              message: `${dateKey} ${ma.name}: 팀연습 "${a.song}" 와 "${b.song}" 참여 구간이 겹쳐요`,
              detail:
                `${a.song} ${fmtHM(a.startMin)}~${fmtHM(a.endMin)} (${a.rowIndex}행) / ` +
                `${b.song} ${fmtHM(b.startMin)}~${fmtHM(b.endMin)} (${b.rowIndex}행)`,
            })
          }
        }
      }
    }
  }
  return warnings
}
