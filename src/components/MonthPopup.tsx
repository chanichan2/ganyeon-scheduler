import { useState, type FC } from 'react'
import { isSameDay, WEEKDAYS } from '../dateUtils'
import { formatDurationShort } from '../ranges'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'

interface Props {
  open: boolean
  selDate: Date
  today: Date
  /** 자정 ms → 그날 유효 갠연 분 합계 (tabular 캡션 표시용). */
  minutesByDay: Map<number, number>
  onSelect: (d: Date) => void
  onClose: () => void
}

/**
 * 날짜 점프용 월 달력 팝업 — 날짜 히어로를 탭하면 열림.
 * 흰 카드 + elevated 그림자. 선택일 accent 원, 오늘 accent 링.
 * 날짜를 탭하면 그 날짜로 이동하고 닫힘. 배경 탭으로 닫기.
 * 열릴 때마다 내부가 새로 마운트되어 선택 날짜의 달에서 시작.
 */
const MonthPopup: FC<Props> = (props) => {
  if (!props.open) return null
  return <MonthPopupInner {...props} />
}

const MonthPopupInner: FC<Props> = ({
  selDate,
  today,
  minutesByDay,
  onSelect,
  onClose,
}) => {
  const [anchor, setAnchor] = useState(() => firstOfMonth(selDate))
  const year = anchor.getFullYear()
  const month = anchor.getMonth()
  const cells = buildMonthCells(year, month)

  return (
    <div
      className="absolute inset-0 z-50 flex items-start justify-center bg-[rgba(2,9,19,0.45)] px-4 pt-24"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="날짜 선택 달력"
    >
      <div
        className="w-full max-w-[420px] rounded-card bg-card p-4 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center">
          <button
            type="button"
            onClick={() => setAnchor(new Date(year, month - 1, 1))}
            aria-label="이전 달"
            className="flex h-11 w-11 items-center justify-center rounded-full text-body transition hover:bg-paper active:scale-90 active:bg-paper"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <span className="flex-1 text-center text-[17px] font-semibold tracking-tight text-ink tabular-nums">
            {year}년 {month + 1}월
          </span>
          <button
            type="button"
            onClick={() => setAnchor(new Date(year, month + 1, 1))}
            aria-label="다음 달"
            className="flex h-11 w-11 items-center justify-center rounded-full text-body transition hover:bg-paper active:scale-90 active:bg-paper"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-7">
          {WEEKDAYS.map((w, i) => (
            <span
              key={w}
              className={`py-1 text-center text-[11px] font-medium ${
                i === 0 ? 'text-sun' : i === 6 ? 'text-sat' : 'text-mute'
              }`}
            >
              {w}
            </span>
          ))}
          {cells.map(({ date, inMonth }) => {
            const sel = isSameDay(date, selDate)
            const isToday = isSameDay(date, today)
            const min = minutesByDay.get(date.getTime()) ?? 0
            return (
              <button
                key={date.getTime()}
                type="button"
                onClick={() => onSelect(date)}
                aria-label={`${date.getMonth() + 1}월 ${date.getDate()}일`}
                className="flex min-h-[44px] flex-col items-center gap-1 rounded-ctl py-1"
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-[15px] tabular-nums transition-colors ${
                    sel
                      ? 'bg-accent font-bold text-white'
                      : isToday
                        ? 'font-bold text-accent ring-[1.5px] ring-inset ring-accent'
                        : inMonth
                          ? 'font-medium text-body'
                          : 'font-medium text-faint'
                  }`}
                >
                  {date.getDate()}
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
      </div>
    </div>
  )
}

function firstOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

/** 일~토 그리드 셀. 마지막 주가 통째로 다음 달이면 잘라냄. */
function buildMonthCells(
  year: number,
  month: number,
): { date: Date; inMonth: boolean }[] {
  const startWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: { date: Date; inMonth: boolean }[] = []
  for (let i = startWeekday - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month, -i), inMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), inMonth: true })
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date
    cells.push({
      date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1),
      inMonth: false,
    })
  }
  return cells
}

export default MonthPopup
