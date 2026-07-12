import type { FC } from 'react'
import { addDays, isSameDay, startOfWeek, WEEKDAYS } from '../dateUtils'

interface Props {
  selDate: Date
  today: Date
  /** 자정 ms → 그날 연습 개수. */
  countByDay: Map<number, number>
  onSelect: (d: Date) => void
}

/**
 * 주간 스트립 — 선택 날짜가 속한 주의 일~토 7칸 (칸 전체가 44px 이상 터치 타깃).
 * 요일/날짜 숫자 + 그날 연습 개수(tabular 캡션).
 * 선택일은 accent 채운 원(글자 흰색), 오늘은 accent 링.
 */
const WeekStrip: FC<Props> = ({ selDate, today, countByDay, onSelect }) => {
  const start = startOfWeek(selDate)
  return (
    <div className="grid grid-cols-7 pb-2 pt-1">
      {WEEKDAYS.map((wl, i) => {
        const d = addDays(start, i)
        const sel = isSameDay(d, selDate)
        const isToday = isSameDay(d, today)
        const cnt = countByDay.get(d.getTime()) ?? 0
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(d)}
            aria-label={`${d.getMonth() + 1}월 ${d.getDate()}일`}
            aria-pressed={sel}
            className="flex min-h-[44px] flex-col items-center gap-1 rounded-ctl py-1"
          >
            <span
              className={`text-[11px] font-medium ${
                i === 0 ? 'text-sun' : i === 6 ? 'text-sat' : 'text-mute'
              }`}
            >
              {wl}
            </span>
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full text-[15px] tabular-nums transition-colors ${
                sel
                  ? 'bg-accent font-bold text-white'
                  : isToday
                    ? 'font-bold text-accent ring-[1.5px] ring-inset ring-accent'
                    : 'font-medium text-body'
              }`}
            >
              {d.getDate()}
            </span>
            <span
              className={`h-3 text-[11px] font-medium leading-none tabular-nums ${
                sel ? 'text-accent' : 'text-mute'
              }`}
            >
              {cnt > 0 ? cnt : ''}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default WeekStrip
