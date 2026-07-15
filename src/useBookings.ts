/**
 * 예약/경계 override 상태 + 동기화 — sonsesangscheduler 7장 패턴 포팅.
 *
 *  1) 클릭 시점에 즉시 낙관적 업데이트 (즉각 피드백).
 *  2) POST 는 직렬 큐(opChain)에 태워 응답 도착 순서와 무관하게 명령 순서대로 처리.
 *  3) 큐가 비었을 때만 서버 응답으로 state sync → 중간 응답으로 인한 깜빡임 방지.
 *  4) 실패 시: 추가 실패면 그 key 만 삭제, 취소 실패면 다시 추가 → 정확한 롤백.
 *     unauthorized 면 관리자 모드 해제 유도.
 *
 * 이 훅의 상태는 서버 배열 "그대로"(예약 key + boundary| override key 혼재) —
 * 예약/override 분리는 호출자가 splitServerKeys 로 한다.
 * 서버(PropertiesService)가 유일한 진실 — localStorage 에는 저장하지 않는다.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, postBookingChange } from './api'
import type { KeyOp } from './overrides'

export interface UseBookingsOptions {
  apiUrl: string | undefined
  /** 검증된 관리자 토큰 (변경 POST body 에 포함). */
  tokenRef: React.RefObject<string | null>
  onError: (message: string) => void
  onUnauthorized: () => void
}

export interface BookingsState {
  /** 서버 key 배열 그대로 (예약 + boundary| override). */
  bookings: Set<string>
  /** 전체 새로고침 시 서버 배열로 동기화 — 진행 중 POST 가 있으면 건너뜀
   *  (그 POST 응답이 stale 스냅샷을 덮어쓰는 것을 방지). */
  syncFromServer: (arr: string[]) => void
  /** 예약 토글 (add ↔ remove). 관리자 모드 확인은 호출자가 한다. */
  toggle: (key: string) => void
  /** 여러 key op 를 순서대로 적용 (경계 스위치: remove → add). */
  applyKeyOps: (ops: KeyOp[]) => void
  /** 진행 중(미확정) POST 가 있는지 — 내보내기 직전 안내용. */
  hasPendingOps: () => boolean
}

export function useBookings(opts: UseBookingsOptions): BookingsState {
  const [bookings, setBookings] = useState<Set<string>>(() => new Set())
  const opChain = useRef<Promise<void>>(Promise.resolve())
  const pendingOps = useRef(0)

  // 콜백/URL 최신값 참조 (직렬 큐 안에서 stale closure 방지)
  const optsRef = useRef(opts)
  useEffect(() => {
    optsRef.current = opts
  })

  const syncFromServer = useCallback((arr: string[]) => {
    if (pendingOps.current > 0) return
    setBookings(new Set(arr.filter((k) => typeof k === 'string')))
  }, [])

  /**
   * op 1개를 직렬 큐에 추가. 낙관적 업데이트는 호출자가 이미 수행한 상태.
   * 실패 시 이 op 만 정확히 롤백 — 다른 진행 중 POST 는 그대로 진행되며,
   * 마지막 응답의 sync 로 최종 일관성이 회복된다 (서버 상태가 곧 정답).
   */
  const enqueuePost = useCallback((apiUrl: string, op: KeyOp) => {
    pendingOps.current++
    opChain.current = opChain.current.then(async () => {
      let arr: string[]
      try {
        arr = await postBookingChange(
          apiUrl,
          op.action,
          op.key,
          optsRef.current.tokenRef.current,
        )
      } catch (err) {
        pendingOps.current--
        setBookings((prev) => {
          const next = new Set(prev)
          if (op.action === 'add') next.delete(op.key)
          else next.add(op.key)
          return next
        })
        if (err instanceof ApiError && err.unauthorized) {
          optsRef.current.onUnauthorized()
        } else {
          optsRef.current.onError(
            '예약 저장 실패: ' + (err instanceof Error ? err.message : String(err)),
          )
        }
        return
      }
      // POST 성공: 모든 진행 중 POST 가 끝났을 때만 서버 응답으로 sync.
      // 중간에 sync 하면 다른 in-flight 작업의 낙관적 상태가 사라져 깜빡임 발생.
      pendingOps.current--
      if (pendingOps.current === 0) {
        setBookings(new Set(arr.filter((k) => typeof k === 'string')))
      }
    })
  }, [])

  const toggle = useCallback(
    (key: string) => {
      const { apiUrl } = optsRef.current
      if (!apiUrl) {
        optsRef.current.onError('갠연 API URL이 설정되지 않았어요.')
        return
      }
      let wasBooked = false
      // 낙관적 적용 후 POST 큐잉
      setBookings((prev) => {
        wasBooked = prev.has(key)
        const next = new Set(prev)
        if (wasBooked) next.delete(key)
        else next.add(key)
        return next
      })
      enqueuePost(apiUrl, { action: wasBooked ? 'remove' : 'add', key })
    },
    [enqueuePost],
  )

  const applyKeyOps = useCallback(
    (ops: KeyOp[]) => {
      if (ops.length === 0) return
      const { apiUrl } = optsRef.current
      if (!apiUrl) {
        optsRef.current.onError('갠연 API URL이 설정되지 않았어요.')
        return
      }
      // 낙관적 일괄 적용 → op 순서대로(remove 먼저) 직렬 POST
      setBookings((prev) => {
        const next = new Set(prev)
        for (const op of ops) {
          if (op.action === 'add') next.add(op.key)
          else next.delete(op.key)
        }
        return next
      })
      for (const op of ops) enqueuePost(apiUrl, op)
    },
    [enqueuePost],
  )

  const hasPendingOps = useCallback(() => pendingOps.current > 0, [])

  return { bookings, syncFromServer, toggle, applyKeyOps, hasPendingOps }
}
