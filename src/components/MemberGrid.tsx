import type { FC, ReactNode } from 'react'
import { bookingKey } from '../bookingKey'
import { duo } from '../duotone'
import { MIN_BOOKABLE_MIN } from '../effective'
import { formatDuration, formatTime, fmtHM } from '../ranges'
import { songColor } from '../songColors'
import type { MemberDay } from '../model'
import type { MinRange } from '../types'

/** 1시간 칸의 가로 픽셀 수 — 경계 텍스트("14:10~14:50")가 들어갈 만큼. */
const CELL_W = 64
/** 이름 열 고정폭 (이름 + 누적 갠연 시간 + 미정 배지). */
const NAME_W = 104
/** 부원 행 높이 / 팀연습 바 높이. */
const ROW_H = 48
const BAR_H = 30
/** 이보다 좁은 바 조각에는 곡명 라벨을 넣지 않는다 (px). */
const LABEL_MIN_W = 28

interface Props {
  startHour: number
  endHour: number
  dateKey: string
  memberDays: MemberDay[]
  bookings: Set<string>
  /** 유효 구간이 30분 미만이 된 예약 key — 회색 처리. */
  staleKeys: Set<string>
  /** 부원 → 전체 기간 누적 갠연 시간 (분). */
  cumMinutes: Map<string, number>
  isAdmin: boolean
  songColors: Record<string, string>
  onToggle: (key: string) => void
}

/**
 * 단일 일자 부원표 — 왼쪽 고정(이름) 열 + startHour~endHour 1시간 단위 열.
 *
 * 가로 스크롤은 단일 스크롤 컨테이너 하나로만 구현 (중첩 overflow 금지 —
 * 첫 제스처 스크롤 실패, 텍스트 오버플로로 인한 페이지 가로 스크롤 버그 재발 방지).
 * 이름 열은 position: sticky; left: 0.
 *
 * 배경: 가능 = 흰색, 불가능 = unavail(#1B1D22). 부분 가능 칸은 실제 분 단위
 * 비율로 나눠 칠한다. 팀연습은 곡 듀오톤 막대, 갠연은 인디고 채움(유효 구간만).
 */
const MemberGrid: FC<Props> = ({
  startHour,
  endHour,
  dateKey,
  memberDays,
  bookings,
  staleKeys,
  cumMinutes,
  isAdmin,
  songColors,
  onToggle,
}) => {
  const startMin = startHour * 60
  const hourCount = endHour - startHour
  const trackW = hourCount * CELL_W
  const pxPerMin = CELL_W / 60
  const leftOf = (min: number) => (min - startMin) * pxPerMin

  const boundaries: number[] = []
  for (let h = startHour; h <= endHour; h++) boundaries.push(h)

  /** 시간 눈금 라벨 위치 — 양 끝은 잘리지 않게 안쪽 정렬. */
  const tickStyle = (h: number): React.CSSProperties =>
    h === startHour
      ? { left: 3 }
      : h === endHour
        ? { left: trackW - 3, transform: 'translateX(-100%)' }
        : { left: (h - startHour) * CELL_W, transform: 'translateX(-50%)' }

  /** 행 트랙 안 세로 그리드선 (내부 정시만) — 흰/검 배경 모두에서 보이게 반투명. */
  const gridLines = boundaries
    .filter((h) => h > startHour && h < endHour)
    .map((h) => (
      <div
        key={`gl-${h}`}
        aria-hidden
        className="absolute inset-y-0 z-[4] w-px bg-[rgba(139,149,161,0.4)]"
        style={{ left: (h - startHour) * CELL_W }}
      />
    ))

  return (
    <>
      <div className="overflow-hidden rounded-card bg-card shadow-subtle">
        {/* 가로 전용 단일 스크롤러 — overflow-y-hidden 없으면 overflow-x-auto 가
            overflow-y 를 auto 로 만들어 세로 스크롤러로 오인됨(첫 제스처 씹힘).
            touch-action 은 pan-x pan-y 로 두어 세로 팬이 main 으로 넘어가게 한다. */}
        <div className="no-scrollbar touch-pan-x touch-pan-y overflow-x-auto overflow-y-hidden overscroll-x-contain">
          <div className="w-max min-w-full">
            {/* 시간 눈금 헤더 행 */}
            <div className="flex h-7">
              <div
                className="sticky left-0 z-[8] flex flex-none items-center bg-card px-2.5 text-[10px] font-semibold text-faint shadow-[inset_-1px_0_var(--grid)]"
                style={{ width: NAME_W }}
              >
                부원
              </div>
              <div className="relative flex-none" style={{ width: trackW }}>
                {boundaries.map((h) => (
                  <span
                    key={h}
                    className="absolute bottom-1 text-[10px] font-medium tabular-nums text-faint"
                    style={tickStyle(h)}
                  >
                    {h}
                  </span>
                ))}
              </div>
            </div>

            {/* 부원 행 */}
            {memberDays.map((md) => {
              const cum = cumMinutes.get(md.name) ?? 0
              return (
                <div
                  key={md.name}
                  className="flex border-t border-grid"
                  style={{ height: ROW_H }}
                >
                  {/* 이름 열 (sticky) — 미정 배지는 칸 빗금 대신 행당 한 번 여기만 */}
                  <div
                    className="sticky left-0 z-[8] flex flex-none flex-col justify-center bg-card px-2.5 shadow-[inset_-1px_0_var(--grid)]"
                    style={{ width: NAME_W }}
                  >
                    <div className="flex min-w-0 items-center gap-1">
                      <span className="min-w-0 truncate text-[13px] font-medium tracking-tight text-body">
                        {md.name}
                      </span>
                      {md.avail.mijeong && (
                        <span className="flex-none rounded-full bg-warn-soft px-1.5 py-px text-[9px] font-semibold leading-tight text-warn-deep">
                          미정
                        </span>
                      )}
                    </div>
                    {cum > 0 && (
                      <span className="text-[10px] font-semibold leading-tight tracking-tight text-accent tabular-nums">
                        {formatDuration(cum)}
                      </span>
                    )}
                  </div>

                  {/* 시간 트랙 */}
                  <div className="relative flex-none" style={{ width: trackW }}>
                    {/* 1. 불가능 배경 (아주 살짝 연한 검정) */}
                    <div aria-hidden className="absolute inset-0 bg-unavail" />

                    {/* 2. 가용 = 흰색 (분 단위 비율) */}
                    {md.avail.ranges.map(([s, e], i) => (
                      <div
                        key={`av-${i}`}
                        aria-hidden
                        className="absolute inset-y-0 z-[1] bg-card"
                        style={{ left: leftOf(s), width: (e - s) * pxPerMin }}
                      />
                    ))}

                    {/* 3. 갠연 인디고 채움 — 유효 구간(흰색이었던 부분)에만 */}
                    {md.cells.map((cell) => {
                      const key = bookingKey(dateKey, cell.hour, md.name)
                      if (!bookings.has(key) || staleKeys.has(key)) return null
                      return cell.slices.map(([s, e], i) => (
                        <div
                          key={`gy-${cell.hour}-${i}`}
                          aria-hidden
                          className="absolute inset-y-0 z-[2] bg-accent"
                          style={{ left: leftOf(s), width: (e - s) * pxPerMin }}
                        />
                      ))
                    })}

                    {/* 4. 팀연습 오버레이 (곡 듀오톤, 실제 시간 비율) */}
                    {renderTeamBars(md, songColors, leftOf, pxPerMin)}

                    {/* 5. 그리드선 */}
                    {gridLines}

                    {/* 6. 경계 텍스트 — 갠연이 잡힌 뒤에도 계속 유지 */}
                    {md.cells.map((cell) =>
                      cell.memos.length > 0 ? (
                        <div
                          key={`memo-${cell.hour}`}
                          aria-hidden
                          className="pointer-events-none absolute bottom-0.5 z-[5] flex justify-center"
                          style={{
                            left: (cell.hour - startHour) * CELL_W,
                            width: CELL_W,
                          }}
                        >
                          <span className="max-w-full truncate rounded bg-card/90 px-1 text-[9px] font-medium leading-[13px] tracking-tight text-body tabular-nums">
                            {cell.memos.join(',')}
                          </span>
                        </div>
                      ) : null,
                    )}

                    {/* 7. 클릭 버튼 + 잡힘 테두리/틴트 (칸 전체) */}
                    {md.cells.map((cell) => {
                      const key = bookingKey(dateKey, cell.hour, md.name)
                      const booked = bookings.has(key)
                      const stale = booked && staleKeys.has(key)
                      const bookable = cell.total >= MIN_BOOKABLE_MIN
                      // 잡힌 칸은 언제나 클릭해 제거 가능 (stale 정리 경로)
                      const clickable = isAdmin && (booked || bookable)
                      const label =
                        `${md.name} ${cell.hour}시 칸` +
                        (booked
                          ? stale
                            ? ' — 예약됨(유효 구간 소멸), 클릭해 제거'
                            : ' — 갠연 예약됨'
                          : bookable
                            ? ` — 유효 ${cell.total}분`
                            : ' — 예약 불가')
                      return (
                        <button
                          key={`bt-${cell.hour}`}
                          type="button"
                          disabled={!clickable}
                          onClick={() => onToggle(key)}
                          title={
                            cell.slices.length
                              ? `유효 구간: ${cell.slices
                                  .map(([s, e]) => `${fmtHM(s)}~${fmtHM(e)}`)
                                  .join(', ')} (${cell.total}분)`
                              : '유효 구간 없음'
                          }
                          aria-label={label}
                          aria-pressed={booked}
                          className={`absolute inset-y-0 z-[6] ${
                            booked
                              ? stale
                                ? 'stale-hatch ring-2 ring-inset ring-line-strong'
                                : 'bg-accent/10 ring-2 ring-inset ring-accent'
                              : ''
                          } ${
                            clickable
                              ? 'cursor-pointer hover:ring-2 hover:ring-inset hover:ring-accent/50'
                              : isAdmin
                                ? 'cursor-not-allowed'
                                : 'cursor-default'
                          }`}
                          style={{
                            left: (cell.hour - startHour) * CELL_W,
                            width: CELL_W,
                          }}
                        />
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <p className="mt-2 px-1.5 text-[11px] font-medium leading-relaxed text-faint">
        흰색 = 가능 · 어두움 = 불가 · 색 막대 = 팀연습 · 인디고 = 갠연
        {isAdmin
          ? ' — 칸을 클릭해 예약/취소 (유효 30분 미만은 클릭 불가)'
          : ' — 예약 변경은 관리자 모드에서만 가능해요'}
      </p>
    </>
  )
}

/** 부원 1명의 행에 들어가는 팀연습 바 전부 — 실제 참여 구간(분)대로. */
function renderTeamBars(
  md: MemberDay,
  songColors: Record<string, string>,
  leftOf: (min: number) => number,
  pxPerMin: number,
): ReactNode[] {
  const out: ReactNode[] = []
  for (const p of md.practices) {
    const mem = p.members.find((m) => m.name === md.name)
    if (!mem) continue
    const c = duo(songColor(p.song, songColors))
    const tent = mem.status === 'tentative'
    const title =
      `${p.song} ${formatTime(p.startMin)}~${formatTime(p.endMin)}` +
      (mem.window ? ` (${mem.window})` : '') +
      (tent ? ' · 미정' : '')
    const widest = widestIndex(mem.ranges)
    mem.ranges.forEach(([s, e], i) => {
      const w = (e - s) * pxPerMin - 2
      out.push(
        <div
          key={`tb-${p.rowIndex}-${i}`}
          title={title}
          className={`absolute z-[3] flex items-center overflow-hidden rounded-[7px] border-l-[3px] ${
            tent ? 'opacity-60' : ''
          }`}
          style={{
            top: (ROW_H - BAR_H) / 2,
            height: BAR_H,
            left: leftOf(s) + 1,
            width: Math.max(w, 2),
            background: c.bg,
            color: c.tx,
            borderLeftColor: c.ed,
          }}
        >
          {i === widest && w >= LABEL_MIN_W && (
            <span className="min-w-0 truncate px-[6px] text-[11px] font-semibold leading-none tracking-tight">
              {p.song}
            </span>
          )}
        </div>,
      )
    })
  }
  return out
}

function widestIndex(ranges: MinRange[]): number {
  let widest = -1
  let widestLen = 0
  ranges.forEach(([a, b], i) => {
    if (b - a > widestLen) {
      widestLen = b - a
      widest = i
    }
  })
  return widest
}

export default MemberGrid
