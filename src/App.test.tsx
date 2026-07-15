/**
 * App 스모크 테스트 — 두 API 를 목킹해 실제 payload 형태로 렌더링이
 * 끝까지 되는지(부원표/팀연습 바/누적 시간/경고 패널) 확인.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const SURVEY_URL = 'https://survey.test/exec'
const GANYEON_URL = 'https://ganyeon.test/exec'

const surveyPayload = {
  ok: true,
  settings: {
    startDate: '2026-07-25',
    endDate: '2026-08-05',
    startHour: 9,
    endHour: 22,
  },
  dates: ['8/1', '8/2'],
  availability: {
    민재: { '8/1': '~14:30', '8/2': 'O' },
    지수: { '8/1': 'X(미정)', '8/2': '13~15' },
    유령표기: { '8/1': '이상한값', '8/2': '' },
  },
}

const ganyeonPayload = {
  ok: true,
  teamRows: [
    ['날짜', '시작', '종료', '곡명', '연습실', '참여부원'],
    ['2026. 8. 1', '16:45', '18', '곡A', '', '민재'],
  ],
  // boundary| key(stale override)는 예약 파싱/경고 패널을 오염시키면 안 됨
  bookings: ['8/1|13|민재', 'boundary|8/1|20|cut'],
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response
}

beforeEach(() => {
  vi.stubEnv('VITE_SURVEY_API_URL', SURVEY_URL)
  vi.stubEnv('VITE_GANYEON_API_URL', GANYEON_URL)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith(SURVEY_URL)) return jsonResponse(surveyPayload)
      if (url.startsWith(GANYEON_URL)) return jsonResponse(ganyeonPayload)
      throw new Error('unexpected fetch: ' + url)
    }),
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('App — 로드/렌더 스모크', () => {
  it('부원표가 렌더되고 팀연습·누적 시간·미정 배지·경고 패널이 보인다', async () => {
    render(<App />)

    // 오늘(2026-07-13 가정)은 조사 기간 밖 → 첫 조사일(8/1)로 자동 이동
    await waitFor(() => {
      expect(screen.getByText('민재')).toBeInTheDocument()
    })
    expect(screen.getByText('지수')).toBeInTheDocument()

    // 팀연습 오버레이 (곡A, 16:45~18:00)
    expect(screen.getByTitle(/곡A 16:45~18:00/)).toBeInTheDocument()

    // 예약 8/1|13|민재 — 가용 ~14:30 → 13시 칸 유효 60분 → 누적 "1시간"
    expect(screen.getByText('1시간')).toBeInTheDocument()

    // 지수 8/1 = X(미정) → 이름 열 미정 배지
    expect(screen.getByText('미정')).toBeInTheDocument()

    // "이상한값" 파싱 실패 → 경고 패널 노출 (조용한 누락 금지).
    // boundary| key 는 경고를 만들지 않으므로 정확히 1건이어야 한다.
    expect(screen.getByText(/확인이 필요한 항목 1건/)).toBeInTheDocument()

    // 비관리자 — 모든 칸 클릭 버튼은 비활성
    const cell = screen.getByRole('button', {
      name: /민재 13시 칸 — 갠연 예약됨/,
    })
    expect(cell).toBeDisabled()
  })

  it('관리자 아님 → TSV 버튼 없음, 관리자 버튼 표시', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('민재')).toBeInTheDocument()
    })
    expect(screen.queryByText('TSV 내보내기')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '관리자' })).toBeInTheDocument()
  })

  it('관리자 세션 복원 → TSV 내보내기 미리보기 모달 (같은 계산 함수 공유)', async () => {
    // localStorage 토큰 → verify POST(목킹은 ok:true 반환) → 관리자 자동 복원
    localStorage.setItem('ganyeon_admin_token', 'pw')
    render(<App />)
    const exportBtn = await screen.findByRole('button', {
      name: 'TSV 내보내기',
    })
    fireEvent.click(exportBtn)

    const dialog = await screen.findByRole('dialog', {
      name: /TSV 내보내기 미리보기/,
    })
    // 예약 8/1|13|민재 (가용 ~14:30, 13~14 칸 전체 유효) → 한 행
    expect(within(dialog).getByText('복사될 내용 (1행)')).toBeInTheDocument()
    expect(within(dialog).getByText('2026. 8. 1')).toBeInTheDocument()
    const row = within(dialog).getByText('2026. 8. 1').closest('tr')!
    expect(row.textContent).toContain('갠연')
    expect(row.textContent).toContain('민재')
    // 닫기
    fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})
