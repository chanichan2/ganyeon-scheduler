/**
 * App 스모크 테스트 — 두 API 를 목킹해 실제 payload 형태로 렌더링이
 * 끝까지 되는지(부원표/팀연습 바/누적 시간/경고 패널) 확인.
 */
import { render, screen, waitFor } from '@testing-library/react'
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
  bookings: ['8/1|13|민재'],
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

    // "이상한값" 파싱 실패 → 경고 패널 노출 (조용한 누락 금지)
    expect(screen.getByText(/확인이 필요한 항목/)).toBeInTheDocument()

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
    expect(screen.queryByText('갠연 TSV 복사')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '관리자' })).toBeInTheDocument()
  })
})
