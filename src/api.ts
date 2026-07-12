/**
 * Apps Script 웹앱 API — sonsesangscheduler app.js 의 fetch/post 패턴 포팅.
 *
 * GET ① — 기존 sonsesangscheduler Apps Script (읽기 전용, 수정 금지):
 *   settings / dates / availability 만 사용.
 * GET/POST ② — 새 갠연 Apps Script:
 *   teamRows(연습일정 탭 getDisplayValues) + bookings(PropertiesService).
 *
 * POST 는 preflight 를 피하려고 Content-Type: text/plain 으로 보낸다.
 * 변경 액션(add/remove)은 서버가 스크립트 속성 ADMIN_TOKEN 과 대조 —
 * unauthorized 응답은 err.unauthorized 로 표시해 호출자가 일반 실패와 구분.
 */

import type { GanyeonPayload, SurveyPayload } from './types'

export class ApiError extends Error {
  unauthorized?: boolean
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch (e) {
    throw new ApiError(
      '네트워크 오류: Apps Script 서버에 연결할 수 없습니다. URL과 인터넷 연결을 확인해 주세요.' +
        (e instanceof Error ? ` (${e.message})` : ''),
    )
  }
  if (!res.ok) {
    throw new ApiError(
      `서버 응답 오류 (HTTP ${res.status}). Apps Script 배포 권한을 확인해 주세요.`,
    )
  }
  try {
    return await res.json()
  } catch {
    throw new ApiError(
      '응답을 JSON으로 해석하지 못했습니다. Apps Script가 JSON을 반환하는지 확인해 주세요.',
    )
  }
}

function requireOk(data: unknown): Record<string, unknown> {
  const obj = data as Record<string, unknown> | null
  if (!obj || obj.ok !== true) {
    const msg =
      obj && typeof obj.error === 'string' ? obj.error : '응답에 ok=true가 없습니다.'
    const err = new ApiError('서버가 오류를 반환했습니다: ' + msg)
    if (obj && obj.error === 'unauthorized') err.unauthorized = true
    throw err
  }
  return obj
}

/** GET ① — 일정조사 payload. */
export async function fetchSurvey(url: string): Promise<SurveyPayload> {
  const data = requireOk(await fetchJson(url, { method: 'GET' }))
  return data as unknown as SurveyPayload
}

/** GET ② — 갠연 payload (teamRows + bookings). */
export async function fetchGanyeon(url: string): Promise<GanyeonPayload> {
  const data = requireOk(await fetchJson(url, { method: 'GET' }))
  return data as unknown as GanyeonPayload
}

async function postGanyeon(
  url: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const data = await fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  })
  return requireOk(data)
}

/**
 * add/remove POST — 성공 시 서버의 최신 bookings 배열 반환.
 * 실패 시 throw (unauthorized 는 err.unauthorized=true).
 */
export async function postBookingChange(
  url: string,
  action: 'add' | 'remove',
  key: string,
  token: string | null,
): Promise<string[]> {
  const body: Record<string, unknown> = { action, key }
  if (token != null) body.token = token
  const data = await postGanyeon(url, body)
  return Array.isArray(data.bookings) ? (data.bookings as string[]) : []
}

/**
 * action:"verify" POST — 토큰이 유효하면 true, unauthorized 면 false.
 * 네트워크/서버 오류는 throw (unauthorized 와 구분해서 호출자가 처리).
 */
export async function postVerifyToken(
  url: string,
  token: string,
): Promise<boolean> {
  try {
    await postGanyeon(url, { action: 'verify', token })
    return true
  } catch (e) {
    if (e instanceof ApiError && e.unauthorized) return false
    throw e
  }
}
