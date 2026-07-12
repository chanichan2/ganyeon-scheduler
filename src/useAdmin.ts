/**
 * 관리자 모드 — sonsesangscheduler 의 공유 관리자 토큰 패턴 포팅.
 *
 * 토큰 값은 서버(갠연 Apps Script 스크립트 속성 ADMIN_TOKEN)에만 저장되고,
 * 클라이언트는 사용자가 입력한 비밀번호를 verify 액션으로 확인한 뒤
 * localStorage 에 보관해 세션을 복원한다. localStorage 는 관리자 토큰
 * 저장에만 사용 — 예약 데이터는 절대 저장하지 않는다.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { postVerifyToken } from './api'

const ADMIN_TOKEN_STORAGE_KEY = 'ganyeon_admin_token'

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}
function writeStoredToken(token: string): void {
  try {
    localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token)
  } catch {
    /* localStorage 비활성화 환경 — 무시 */
  }
}
function removeStoredToken(): void {
  try {
    localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY)
  } catch {
    /* 무시 */
  }
}

export interface AdminState {
  isAdmin: boolean
  /** 검증된 관리자 토큰 — 변경 POST body 에 포함. */
  tokenRef: React.RefObject<string | null>
  /** 비밀번호 입력 → verify → 성공 시 관리자 모드. 실패 메시지는 반환값. */
  login: (password: string) => Promise<string | null>
  logout: () => void
  /** 서버가 unauthorized 를 반환했을 때 공통 처리 (토큰 폐기 + 모드 해제). */
  handleUnauthorized: () => void
}

export function useAdmin(apiUrl: string | undefined): AdminState {
  const [isAdmin, setIsAdmin] = useState(false)
  const tokenRef = useRef<string | null>(null)

  // 페이지 로드 시 localStorage 토큰으로 세션 자동 복원.
  // unauthorized 면 토큰 폐기, 네트워크 오류면 토큰은 남겨두고 열람 모드 유지
  // (다음 로드에서 재시도).
  useEffect(() => {
    if (!apiUrl) return
    const token = readStoredToken()
    if (!token) return
    let cancelled = false
    void (async () => {
      let ok: boolean
      try {
        ok = await postVerifyToken(apiUrl, token)
      } catch {
        return
      }
      if (cancelled) return
      if (ok) {
        tokenRef.current = token
        setIsAdmin(true)
      } else {
        removeStoredToken()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [apiUrl])

  const login = useCallback(
    async (password: string): Promise<string | null> => {
      if (!apiUrl) return '갠연 API URL이 설정되지 않았어요.'
      let ok: boolean
      try {
        ok = await postVerifyToken(apiUrl, password)
      } catch (e) {
        return (
          '관리자 인증 중 오류가 발생했어요: ' +
          (e instanceof Error ? e.message : String(e))
        )
      }
      if (!ok) return '관리자 비밀번호가 올바르지 않아요.'
      tokenRef.current = password
      writeStoredToken(password)
      setIsAdmin(true)
      return null
    },
    [apiUrl],
  )

  const logout = useCallback(() => {
    removeStoredToken()
    tokenRef.current = null
    setIsAdmin(false)
  }, [])

  const handleUnauthorized = useCallback(() => {
    removeStoredToken()
    tokenRef.current = null
    setIsAdmin(false)
  }, [])

  return { isAdmin, tokenRef, login, logout, handleUnauthorized }
}
