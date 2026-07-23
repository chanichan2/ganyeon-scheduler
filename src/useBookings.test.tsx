/**
 * useBookings — 클릭→POST 경로 테스트.
 *
 * P1 회귀 방지: React 19 에서 setState updater 는 동기 실행이 보장되지 않으므로
 * add/remove 판단을 updater 안에서 하면 취소 클릭에도 'add' 가 전송된다.
 * 이 파일은 toggle 이 보내는 액션 자체를 검증한다 — 낙관적 화면 상태만이 아니라.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, postBookingChange } from './api'
import { useBookings } from './useBookings'

vi.mock('./api', () => {
  class ApiError extends Error {
    unauthorized?: boolean
  }
  return { ApiError, postBookingChange: vi.fn() }
})

const mockPost = vi.mocked(postBookingChange)
const API = 'https://ganyeon.test/exec'

function setup() {
  const onError = vi.fn()
  const onUnauthorized = vi.fn()
  const tokenRef = { current: 'tok' } as React.RefObject<string | null>
  const hook = renderHook(() =>
    useBookings({ apiUrl: API, tokenRef, onError, onUnauthorized }),
  )
  return { hook, onError, onUnauthorized }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPost.mockResolvedValue([])
})

describe('useBookings.toggle — 전송 액션 (P1)', () => {
  it('이미 있는 key 를 toggle → remove 로 POST (취소가 서버에 반영)', async () => {
    const { hook } = setup()
    act(() => hook.result.current.syncFromServer(['8/2|10|이경준']))
    act(() => hook.result.current.toggle('8/2|10|이경준'))
    // 낙관적 제거는 즉시
    expect(hook.result.current.bookings.has('8/2|10|이경준')).toBe(false)
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1))
    expect(mockPost).toHaveBeenCalledWith(API, 'remove', '8/2|10|이경준', 'tok')
  })

  it('없는 key 를 toggle → add 로 POST', async () => {
    const { hook } = setup()
    act(() => hook.result.current.toggle('8/1|13|민재'))
    expect(hook.result.current.bookings.has('8/1|13|민재')).toBe(true)
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1))
    expect(mockPost).toHaveBeenCalledWith(API, 'add', '8/1|13|민재', 'tok')
  })

  it('같은 key 를 연속 두 번 toggle → 순서대로 add, remove', async () => {
    const { hook } = setup()
    await act(async () => {
      hook.result.current.toggle('8/1|13|민재')
      hook.result.current.toggle('8/1|13|민재')
    })
    expect(mockPost.mock.calls.map((c) => c[1])).toEqual(['add', 'remove'])
    expect(hook.result.current.bookings.has('8/1|13|민재')).toBe(false)
  })
})

describe('useBookings — 실패 롤백', () => {
  it('remove POST 실패 → 그 key 가 복원되고 onError 호출', async () => {
    const { hook, onError } = setup()
    act(() => hook.result.current.syncFromServer(['8/1|13|민재']))
    mockPost.mockRejectedValueOnce(new ApiError('서버 오류'))
    await act(async () => {
      hook.result.current.toggle('8/1|13|민재')
    })
    expect(hook.result.current.bookings.has('8/1|13|민재')).toBe(true)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toContain('예약 저장 실패')
  })

  it('unauthorized 응답 → onUnauthorized 호출 + add 롤백', async () => {
    const { hook, onError, onUnauthorized } = setup()
    const err = new ApiError('unauthorized')
    err.unauthorized = true
    mockPost.mockRejectedValueOnce(err)
    await act(async () => {
      hook.result.current.toggle('8/1|13|민재')
    })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
    expect(hook.result.current.bookings.has('8/1|13|민재')).toBe(false)
  })
})

describe('useBookings.syncFromServer — 덮어쓰기 가드 (P3)', () => {
  it('POST 진행 중에는 sync 를 건너뜀 (기존 pendingOps 가드)', async () => {
    let resolvePost!: (arr: string[]) => void
    mockPost.mockImplementationOnce(
      () =>
        new Promise<string[]>((res) => {
          resolvePost = res
        }),
    )
    const { hook } = setup()
    await act(async () => {
      hook.result.current.toggle('8/1|13|민재')
    })
    expect(hook.result.current.hasPendingOps()).toBe(true)
    act(() => hook.result.current.syncFromServer([]))
    expect(hook.result.current.bookings.has('8/1|13|민재')).toBe(true)
    await act(async () => {
      resolvePost(['8/1|13|민재'])
    })
    expect(hook.result.current.hasPendingOps()).toBe(false)
  })

  it('GET 응답 지연 중 toggle 이 완료되면, 낡은 GET 응답이 상태를 덮어쓰지 않음', async () => {
    const { hook } = setup()
    act(() => hook.result.current.syncFromServer(['8/1|13|민재']))
    // 새 GET 시작 — 이 시점의 변경 세대를 기억 (App.load 가 하는 일)
    const seqAtGetStart = hook.result.current.getMutationSeq()
    // GET 응답 대기 중 사용자가 14시 칸 예약 → POST 성공, pendingOps 0 복귀
    mockPost.mockResolvedValueOnce(['8/1|13|민재', '8/1|14|민재'])
    await act(async () => {
      hook.result.current.toggle('8/1|14|민재')
    })
    expect(hook.result.current.hasPendingOps()).toBe(false)
    expect(hook.result.current.bookings.has('8/1|14|민재')).toBe(true)
    // 그제서야 도착한 낡은 GET 배열 — 세대가 달라졌으므로 무시
    act(() =>
      hook.result.current.syncFromServer(['8/1|13|민재'], seqAtGetStart),
    )
    expect(hook.result.current.bookings.has('8/1|14|민재')).toBe(true)
    // 변경 이후 시작된 새 GET 은 정상 반영 (서버가 진실)
    const seqFresh = hook.result.current.getMutationSeq()
    act(() => hook.result.current.syncFromServer(['8/1|13|민재'], seqFresh))
    expect(hook.result.current.bookings.has('8/1|14|민재')).toBe(false)
  })
})

describe('useBookings.applyKeyOps — 경계 스위치 op', () => {
  it('remove → add 순서대로 직렬 POST + 낙관적 일괄 적용', async () => {
    const { hook } = setup()
    act(() => hook.result.current.syncFromServer(['boundary|8/2|13|join']))
    await act(async () => {
      hook.result.current.applyKeyOps([
        { action: 'remove', key: 'boundary|8/2|13|join' },
        { action: 'add', key: 'boundary|8/2|13|cut' },
      ])
    })
    expect(mockPost.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      ['remove', 'boundary|8/2|13|join'],
      ['add', 'boundary|8/2|13|cut'],
    ])
  })
})
