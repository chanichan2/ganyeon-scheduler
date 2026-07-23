import type { FC } from 'react'
import { addDays, isSameDay, startOfWeek, WEEKDAYS } from '../dateUtils'
import { formatDurationShort } from '../ranges'

interface Props {
  selDate: Date
  today: Date
  /** 자정 ms → 그날 유효 갠연 분 합계. */
  minutesByDay: Map<number, number>
  onSelect: (d: Date) => void
}

/**
 * 주간 스트립 — 선택 날짜가 속한 주의 일요일부터 시작.
 * 모바일(<1024px)은 일~토 7칸, 아이패드 가로/PC(≥1024px)는 2주 14칸
 * (칸 전체가 44px 이상 터치 타깃 유지).
 * 요일/날짜 숫자 + 그날 유효 갠연 시간(tabular 캡션) — 부원표와 같은 의미.
 * 선택일은 accent 채운 원(글자 흰색), 오늘은 accent 링.
 */
const WeekStrip: FC<Props> = ({ selDate, today, minutesByDay, onSelect }) => {
  const start = startOfWeek(selDate)
  const days = Array.from({ length: 14 }, (_, i) => addDays(start, i))
  return (
    <div className="grid grid-cols-7 pb-2 pt-1 lg:grid-cols-[repeat(14,minmax(0,1fr))]">
      {days.map((d, i) => {
        const sel = isSameDay(d, selDate)
        const isToday = isSameDay(d, today)
        const min = minutesByDay.get(d.getTime()) ?? 0
        return (
          <button
            key={d.getTime()}
            type="button"
            onClick={() => onSelect(d)}
            aria-label={`${d.getMonth() + 1}월 ${d.getDate()}일`}
            aria-pressed={sel}
            className={`min-h-[44px] flex-col items-center gap-1 rounded-ctl py-1 ${
              i >= 7 ? 'hidden lg:flex' : 'flex'
            }`}
          >
            <span
              className={`text-[11px] font-medium ${
                d.getDay() === 0
                  ? 'text-sun'
                  : d.getDay() === 6
                    ? 'text-sat'
                    : 'text-mute'
              }`}
            >
              {WEEKDAYS[d.getDay()]}
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
              {min > 0 ? formatDurationShort(min) : ''}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default WeekStrip
