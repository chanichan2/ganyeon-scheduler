import type { CSSProperties, FC, ReactNode } from 'react'
import { bookingKey } from '../bookingKey'
import { duo } from '../duotone'
import { MIN_BOOKABLE_MIN } from '../effective'
import { formatDuration, formatTime, fmtHM } from '../ranges'
import { songColor } from '../songColors'
import type { MemberDay } from '../model'
import type { MinRange } from '../types'

/** <1024px 스크롤 모드에서 1시간 칸의 가로 픽셀 수 — 경계 텍스트가 들어갈 만큼. */
const CELL_W = 64
/** 팀연습 바 높이 (px). 행 높이는 클래스(h-[48px] lg:h-[45px])로 반응형 —
    border-t 1px 를 빼고도 칸 버튼 히트 영역이 44px 이상이어야 한다. */
const BAR_H = 30
/** 이보다 짧은(분) 바 조각에는 곡명 라벨을 넣지 않는다 — 폭이 유동이라 분 기준. */
const LABEL_MIN_MINUTES = 28

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
 * 모든 오버레이/칸 배치는 트랙 폭의 퍼센트 기준이라 트랙 폭과 무관하게 동작:
 *  - <1024px: 트랙 폭 고정(시간당 64px), 단일 가로 스크롤 컨테이너 하나로만
 *    스크롤 (중첩 overflow 금지 — 첫 제스처 스크롤 실패 버그 재발 방지),
 *    이름 열 sticky left.
 *  - ≥1024px(아이패드 가로/PC): 트랙이 화면 폭에 유동 분배되어 전체 시간이
 *    가로 스크롤 없이 한 화면에 들어온다. 이때 overflow 를 전부 visible 로
 *    풀어 시간 눈금 헤더가 <main> 세로 스크롤에 sticky top 으로 고정된다.
 *
 * 배경: 가능 = 흰색, 불가능 = unavail(#1B1D22). 부분 가능 칸은 실제 분 단위
 * 비율로 나눠 칠한다. 팀연습은 곡 듀오톤 막대, 갠연은 인디고 채움(유효 구간만).
 *
 * hover 효과(링/툴팁)는 전부 (hover:hover) and (pointer:fine) 미디어로 한정 —
 * 아이패드 첫 탭이 hover 소모로 씹히지 않는다. 툴팁은 장식일 뿐, 없어도
 * 모든 기능이 동작한다.
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
  const totalMin = hourCount * 60
  const trackW = hourCount * CELL_W
  /** 분 → 트랙 왼쪽 기준 퍼센트. */
  const pctOf = (min: number) => ((min - startMin) / totalMin) * 100
  /** 구간 길이(분) → 트랙 폭 퍼센트. */
  const pctLen = (s: number, e: number) => ((e - s) / totalMin) * 100

  const boundaries: number[] = []
  for (let h = startHour; h <= endHour; h++) boundaries.push(h)

  /** 시간 눈금 라벨 위치 — 양 끝은 잘리지 않게 안쪽 정렬. */
  const tickStyle = (h: number): CSSProperties =>
    h === startHour
      ? { left: 3 }
      : h === endHour
        ? { left: 'calc(100% - 3px)', transform: 'translateX(-100%)' }
        : {
            left: `${((h - startHour) / hourCount) * 100}%`,
            transform: 'translateX(-50%)',
          }

  /** 행 트랙 안 세로 그리드선 (내부 정시만) — 흰/검 배경 모두에서 보이게 반투명. */
  const gridLines = boundaries
    .filter((h) => h > startHour && h < endHour)
    .map((h) => (
      <div
        key={`gl-${h}`}
        aria-hidden
        className="absolute inset-y-0 z-[4] w-px bg-[rgba(139,149,161,0.4)]"
        style={{ left: `${((h - startHour) / hourCount) * 100}%` }}
      />
    ))

  return (
    <>
      <div className="rounded-card bg-card shadow-subtle max-lg:overflow-hidden">
        {/* <1024px: 가로 전용 단일 스크롤러 — overflow-y-hidden 없으면 overflow-x-auto 가
            overflow-y 를 auto 로 만들어 세로 스크롤러로 오인됨(첫 제스처 씹힘).
            touch-action 은 pan-x pan-y 로 두어 세로 팬이 main 으로 넘어가게 한다.
            ≥1024px: 트랙이 유동 폭이라 가로 스크롤이 필요 없음 — overflow 를 전부
            visible 로 풀어 시간 헤더 sticky top 이 <main> 스크롤에 붙게 한다. */}
        <div className="no-scrollbar touch-pan-x touch-pan-y overflow-x-auto overflow-y-hidden overscroll-x-contain lg:overflow-visible">
          <div
            className="w-max min-w-full lg:w-full"
            style={{ '--track-w': `${trackW}px` } as CSSProperties}
          >
            {/* 시간 눈금 헤더 행 — ≥1024px 에서 세로 스크롤 시 상단 고정.
                top -16px = <main> 의 pt-4 보정 — 스크롤 컨테이너 패딩 띠로
                콘텐츠가 비쳐 보이지 않게 헤더가 main 상단까지 덮는다. */}
            <div className="flex h-7 bg-card lg:sticky lg:top-[-16px] lg:z-[9] lg:rounded-t-card lg:shadow-[0_1px_0_var(--grid)]">
              <div className="sticky left-0 z-[8] flex w-[104px] flex-none items-center bg-card px-2.5 text-[10px] font-semibold text-faint shadow-[inset_-1px_0_var(--grid)] lg:w-[140px]">
                부원
              </div>
              <div className="relative w-[var(--track-w)] flex-none lg:w-auto lg:flex-1">
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
                  className="group flex h-[48px] border-t border-grid lg:h-[45px]"
                >
                  {/* 이름 열 (sticky) — 미정 배지는 칸 빗금 대신 행당 한 번 여기만 */}
                  <div className="sticky left-0 z-[8] flex w-[104px] flex-none flex-col justify-center bg-card px-2.5 shadow-[inset_-1px_0_var(--grid)] lg:w-[140px] lg:group-last:rounded-bl-card">
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
                  <div className="relative w-[var(--track-w)] flex-none lg:w-auto lg:flex-1">
                    {/* 1. 불가능 배경 (아주 살짝 연한 검정) */}
                    <div
                      aria-hidden
                      className="absolute inset-0 bg-unavail lg:group-last:rounded-br-card"
                    />

                    {/* 2. 가용 = 흰색 (분 단위 비율) */}
                    {md.avail.ranges.map(([s, e], i) => (
                      <div
                        key={`av-${i}`}
                        aria-hidden
                        className="absolute inset-y-0 z-[1] bg-card"
                        style={{
                          left: `${pctOf(s)}%`,
                          width: `${pctLen(s, e)}%`,
                        }}
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
                          style={{
                            left: `${pctOf(s)}%`,
                            width: `${pctLen(s, e)}%`,
                          }}
                        />
                      ))
                    })}

                    {/* 4. 팀연습 오버레이 (곡 듀오톤, 실제 시간 비율) */}
                    {renderTeamBars(md, songColors, pctOf, pctLen)}

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
                            left: `${((cell.hour - startHour) / hourCount) * 100}%`,
                            width: `${100 / hourCount}%`,
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
                      const slicesText = cell.slices
                        .map(([s, e]) => `${fmtHM(s)}~${fmtHM(e)}`)
                        .join(', ')
                      return (
                        <button
                          key={`bt-${cell.hour}`}
                          type="button"
                          disabled={!clickable}
                          onClick={() => onToggle(key)}
                          title={
                            clickable
                              ? undefined
                              : cell.slices.length
                                ? `유효 구간: ${slicesText} (${cell.total}분)`
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
                              ? // hover:z — 첫 행 툴팁이 sticky 시간 헤더(z-9)에 가려지지 않게
                                'cursor-pointer hover:z-[10] hover:ring-2 hover:ring-inset hover:ring-accent/50'
                              : 'cursor-not-allowed'
                          }`}
                          style={{
                            left: `${((cell.hour - startHour) / hourCount) * 100}%`,
                            width: `${100 / hourCount}%`,
                          }}
                        >
                          {clickable && (
                            <span className="cell-tip" aria-hidden>
                              {booked
                                ? stale
                                  ? '클릭 시 제거'
                                  : '클릭 시 취소'
                                : `클릭 시 ${slicesText} 예약`}
                            </span>
                          )}
                        </button>
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
  pctOf: (min: number) => number,
  pctLen: (s: number, e: number) => number,
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
      out.push(
        <div
          key={`tb-${p.rowIndex}-${i}`}
          title={title}
          className={`absolute top-1/2 z-[3] flex -translate-y-1/2 items-center overflow-hidden rounded-[7px] border-l-[3px] ${
            tent ? 'opacity-60' : ''
          }`}
          style={{
            height: BAR_H,
            left: `calc(${pctOf(s)}% + 1px)`,
            width: `max(2px, calc(${pctLen(s, e)}% - 2px))`,
            background: c.bg,
            color: c.tx,
            borderLeftColor: c.ed,
          }}
        >
          {i === widest && e - s >= LABEL_MIN_MINUTES && (
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
