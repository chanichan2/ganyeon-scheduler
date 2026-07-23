/**
 * ExportPreview — 미확정 POST 가 있는 상태의 복사 차단 (P4).
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { copyTextToClipboard } from '../clipboard'
import { buildScheduleModel } from '../model'
import type { BoundaryState } from '../overrides'
import ExportPreview from './ExportPreview'

vi.mock('../clipboard', () => ({ copyTextToClipboard: vi.fn() }))

const mockCopy = vi.mocked(copyTextToClipboard)

function makeModel() {
  return buildScheduleModel(
    {
      ok: true,
      settings: { startDate: '2026-07-25', startHour: 9, endHour: 22 },
      dates: ['8/1', '8/2'],
      availability: { 민재: { '8/1': 'O', '8/2': 'O' } },
    },
    { ok: true, teamRows: [], bookings: [] },
  )
}

function renderPreview(hasPending: boolean) {
  const onToast = vi.fn()
  render(
    <ExportPreview
      open
      model={makeModel()}
      bookings={new Set(['8/1|13|민재'])}
      overrides={new Map<string, BoundaryState>()}
      hasPendingOps={() => hasPending}
      onToggleBoundary={vi.fn()}
      onResetDate={vi.fn()}
      onToast={onToast}
      onClose={vi.fn()}
    />,
  )
  return { onToast }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCopy.mockResolvedValue(true)
})

describe('ExportPreview — pending 중 복사 차단', () => {
  it('미확정 POST 가 있으면 복사 시도 시 클립보드 호출이 일어나지 않음', () => {
    const { onToast } = renderPreview(true)
    fireEvent.click(screen.getByRole('button', { name: '복사' }))
    expect(mockCopy).not.toHaveBeenCalled()
    expect(onToast).toHaveBeenCalledWith(
      '저장 중인 변경이 있어요. 잠시 후 다시 시도해 주세요.',
    )
  })

  it('미확정 POST 가 없으면 정상 복사', async () => {
    const { onToast } = renderPreview(false)
    fireEvent.click(screen.getByRole('button', { name: '복사' }))
    await vi.waitFor(() => expect(mockCopy).toHaveBeenCalledTimes(1))
    expect(mockCopy.mock.calls[0][0]).toBe('2026. 8. 1\t13\t14\t갠연\t\t민재')
    expect(onToast).toHaveBeenCalledWith('복사 완료 ✓ 1행')
  })
})
