import type { FC } from 'react'
import { addDays, isSameDay, WEEKDAYS } from '../dateUtils'
import WeekStrip from './WeekStrip'
import { ChevronLeftIcon, ChevronRightIcon, RefreshIcon } from './icons'

interface Props {
  selDate: Date
  today: Date
  /** 자정 ms → 그날 유효 갠연 분 합계 (주간 스트립/월 달력 캡션). */
  minutesByDay: Map<number, number>
  loading: boolean
  /** 마지막 성공 갱신 시각 — 아직 없으면 null. */
  updatedAt: Date | null
  isAdmin: boolean
  onGoto: (d: Date) => void
  onRefresh: () => void
  onOpenMonth: () => void
  onAdminLogin: () => void
  onAdminLogout: () => void
  /** TSV 내보내기 미리보기 모달 열기 (관리자 전용). */
  onOpenExport: () => void
}

/** "14:05" — 갱신시각 캡션. */
const fmtClock = (d: Date) =>
  `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`

/**
 * 상단 헤더 — 모바일(<1024px)은 브랜드 행 + 날짜 히어로 두 줄,
 * 아이패드 가로/PC(≥1024px)는 [타이틀 | ◀ 날짜 ▶ 오늘 | 갱신시각·새로고침·
 * 관리자/TSV] 한 줄 툴바로 정리. 아래에 주간 스트립(넓은 화면 14일).
 * 날짜 히어로 탭 → 월 달력 팝업.
 */
const Header: FC<Props> = ({
  selDate,
  today,
  minutesByDay,
  loading,
  updatedAt,
  isAdmin,
  onGoto,
  onRefresh,
  onOpenMonth,
  onAdminLogin,
  onAdminLogout,
  onOpenExport,
}) => {
  const wd = selDate.getDay()
  const isToday = isSameDay(selDate, today)
  return (
    <header className="relative z-10 bg-card px-4 pt-2 shadow-subtle md:px-6 lg:px-8">
      {/* 툴바 — 모바일: [브랜드|버튼] + 날짜 히어로 두 줄, ≥1024px: 한 줄 */}
      <div className="flex flex-wrap items-center gap-x-2 lg:flex-nowrap lg:gap-x-4 lg:py-1">
        <h1 className="order-1 text-[15px] font-bold tracking-tight text-ink">
          갠연 스케줄러
        </h1>
        <div className="order-2 ml-auto flex items-center gap-1 lg:order-3 lg:ml-0">
          {updatedAt && (
            <span
              title="마지막 갱신 시각"
              className="text-[13px] tabular-nums text-mute"
            >
              {fmtClock(updatedAt)}
            </span>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="새로고침"
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-mute transition hover:bg-paper active:scale-90 active:bg-paper disabled:opacity-40"
          >
            <RefreshIcon
              className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
            />
          </button>
          {isAdmin ? (
            <>
              <button
                type="button"
                onClick={onOpenExport}
                className="h-9 rounded-full bg-accent px-3.5 text-[13px] font-semibold text-white transition hover:bg-accent-deep active:scale-95"
              >
                TSV 내보내기
              </button>
              <button
                type="button"
                onClick={onAdminLogout}
                className="h-9 rounded-full bg-paper px-3 text-[13px] font-medium text-body transition hover:bg-line active:scale-95"
              >
                로그아웃
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onAdminLogin}
              className="h-9 rounded-full bg-paper px-3.5 text-[13px] font-medium text-body transition hover:bg-line active:scale-95"
            >
              관리자
            </button>
          )}
        </div>

        {/* 날짜 히어로 — 모바일 둘째 줄 전체 폭, ≥1024px 툴바 중앙 */}
        <div className="order-3 flex w-full items-center gap-1 pb-1 pt-2 lg:order-2 lg:w-auto lg:min-w-0 lg:flex-1 lg:justify-center lg:pb-0 lg:pt-0">
        <button
          type="button"
          onClick={() => onGoto(addDays(selDate, -1))}
          aria-label="어제"
          className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-body transition hover:bg-paper active:scale-90 active:bg-paper"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onOpenMonth}
          aria-label="달력에서 날짜 선택"
          className="flex min-w-0 flex-1 items-baseline justify-center gap-2 lg:flex-none"
        >
          <span className="truncate text-[26px] font-bold leading-[1.3] tracking-[-0.02em] text-ink tabular-nums lg:text-[22px]">
            {selDate.getMonth() + 1}월 {selDate.getDate()}일
          </span>
          <span
            className={`text-[17px] font-semibold lg:text-[15px] ${
              wd === 0 ? 'text-sun' : wd === 6 ? 'text-sat' : 'text-body'
            }`}
          >
            {WEEKDAYS[wd]}요일
          </span>
        </button>
        <button
          type="button"
          onClick={() => onGoto(today)}
          className={`flex h-11 flex-none items-center transition active:scale-95 ${
            isToday ? 'invisible' : ''
          }`}
        >
          <span className="rounded-full bg-accent-soft px-3 py-1 text-[13px] font-semibold text-accent">
            오늘
          </span>
        </button>
        <button
          type="button"
          onClick={() => onGoto(addDays(selDate, 1))}
          aria-label="내일"
          className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-body transition hover:bg-paper active:scale-90 active:bg-paper"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
        </div>
      </div>

      <WeekStrip
        selDate={selDate}
        today={today}
        minutesByDay={minutesByDay}
        onSelect={onGoto}
      />

      {loading && <div className="ss-progress" aria-hidden />}
    </header>
  )
}

export default Header
