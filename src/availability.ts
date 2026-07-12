/**
 * 가용시간 셀 파서 — sonsesangscheduler app.js 의 normalizeRaw / parseAvailability
 * 를 로직 변경 없이 TypeScript 로 포팅.
 *
 * 결과: { ranges: [시작분, 끝분)[], mijeong: boolean }
 *
 * | 입력            | ranges (분)              | mijeong |
 * |-----------------|--------------------------|---------|
 * | 빈 셀 / null    | []                       | false   |
 * | O               | [[start, end]]           | false   |
 * | X               | []                       | false   |
 * | 미정 단독       | [[start, end]]           | true    |
 * | X(미정)         | []                       | true    |
 * | 13~15           | [[780, 900]]             | false   |
 * | 13:30~          | [[810, end]]             | false   |
 * | ~14:30          | [[start, 870]]           | false   |
 * | 13~15,18~       | [[780,900],[1080,end]]   | false   |
 * | 12~18(미정)     | [[720,1080]]             | true    |
 * | (미정) 만       | [[start, end]]           | true    |
 *
 * 해석 실패는 throw — 호출자는 절대 추정하지 않고 "불가능" 처리 + 경고 노출.
 */

import { mergeRanges } from './ranges'
import type { Availability, MinRange } from './types'

/** "13" → 780, "13:30" → 810. 인식 불가면 null. (app.js parseTimeToken 포팅) */
export function parseTimeToken(t: string): number | null {
  if (/^\d{1,2}$/.test(t)) {
    const h = parseInt(t, 10)
    return h * 60
  }
  const m = t.match(/^(\d{1,2}):(\d{2})$/)
  if (m) {
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
  }
  return null
}

/**
 * 한글 스프레드시트에서 흔히 섞이는 유사 문자/전각 문자를 정규화.
 * (한글 입력기가 자동으로 ~ → 〜, ( → （, : → ：, 13 → １３ 등으로 바꾸는 경우가 많음)
 * app.js normalizeRaw 포팅 — 문자 집합 동일.
 */
export function normalizeRaw(raw: unknown): string {
  let s = String(raw)
  // 제로폭/BOM 제거 (U+200B..U+200D, U+FEFF)
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, '')
  // 각종 대시/하이픈/장음 부호 → '-'
  //   U+2010..U+2015 (하이픈/대시류), U+2212 (마이너스), U+FE58/FE63/FF0D (전각/소형)
  s = s.replace(/[‐-―−﹘﹣－]/g, '-')
  // 각종 물결/웨이브 → '~'
  //   U+223C (∼), U+301C (〜), U+3030 (〰), U+FF5E (～)
  s = s.replace(/[∼〜〰～]/g, '~')
  // 전각 괄호 → 반각
  s = s.replace(/（/g, '(').replace(/）/g, ')')
  // 전각 콜론 → ':'
  s = s.replace(/：/g, ':')
  // 전각/한자 쉼표 → ','
  s = s.replace(/[，、]/g, ',')
  // 전각 숫자 → 반각
  s = s.replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30),
  )
  // 전각 영문 O/X
  s = s.replace(/[Ｏｏ]/g, 'O').replace(/[Ｘｘ]/g, 'X')
  return s
}

/**
 * 가용시간 셀 해석. (app.js parseAvailability 포팅 — 로직 동일)
 *
 * @param raw 원본 셀 문자열 (null/undefined 허용)
 * @param startMin 조사 범위 시작 (분)
 * @param endMin 조사 범위 끝 (분)
 * @throws 잘못된 입력일 때 — 호출자는 불가능 처리 + 경고 패널 노출
 */
export function parseAvailability(
  raw: unknown,
  startMin: number,
  endMin: number,
): Availability {
  if (raw == null) return { ranges: [], mijeong: false }
  let s = normalizeRaw(raw)
    .replace(/\s+/g, '')
    .replace(/o/g, 'O')
    .replace(/x/g, 'X')
  if (s === '') return { ranges: [], mijeong: false }

  // 끝의 (미정) 분리
  let mijeong = false
  const mj = s.match(/^(.*)\(미정\)$/)
  if (mj) {
    mijeong = true
    s = mj[1]
  }

  // 어딘가 (미정) 또는 잘못된 위치의 미정이 남아있으면 실패
  // (단, s === '미정' 단독은 허용)
  if (s !== '미정' && s.indexOf('미정') !== -1) {
    throw new Error('잘못된 (미정) 위치: ' + String(raw))
  }

  if (s === '미정') return { ranges: [[startMin, endMin]], mijeong: true }
  if (s === '') return { ranges: [[startMin, endMin]], mijeong } // '(미정)'만 있던 케이스
  if (s === 'O') return { ranges: [[startMin, endMin]], mijeong }
  if (s === 'X') return { ranges: [], mijeong }

  // 하이픈 → 물결
  s = s.replace(/-/g, '~')

  const parts = s.split(',')
  const ranges: MinRange[] = []
  for (const p of parts) {
    if (!p) throw new Error('빈 구간: ' + String(raw))
    const tokens = p.split('~')
    if (tokens.length !== 2) {
      throw new Error('올바르지 않은 구간 형식: ' + p)
    }
    const [left, right] = tokens
    const sM = left === '' ? startMin : parseTimeToken(left)
    const eM = right === '' ? endMin : parseTimeToken(right)
    if (sM == null) throw new Error('올바르지 않은 시간: ' + left)
    if (eM == null) throw new Error('올바르지 않은 시간: ' + right)
    if (sM >= eM) {
      // "~9"(startHour=9), "24~"(endHour=22) 처럼 한쪽 끝이 자동 채움이면서
      // 그 결과로 빈 구간이 되는 경우는 분석 범위 밖 입력이므로 조용히 무시.
      // 그러나 "15~13"처럼 양쪽이 모두 명시된 역순은 명백한 오타이므로 오류로 처리.
      if (left === '' || right === '') continue
      throw new Error('시작이 끝보다 큼: ' + p)
    }

    const cs = Math.max(sM, startMin)
    const ce = Math.min(eM, endMin)
    if (cs < ce) ranges.push([cs, ce])
  }
  return { ranges: mergeRanges(ranges), mijeong }
}
