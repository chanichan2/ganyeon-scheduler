import { useState, type FC } from 'react'
import type { AppWarning, WarningKind } from '../types'
import { WarnIcon } from './icons'

/** 경고 종류별 섹션 제목 — 8장 순서 그대로. */
const KIND_LABEL: Record<WarningKind, string> = {
  'availability-parse': '가용시간 파싱 실패',
  'team-row-parse': '연습일정 행 파싱 실패',
  'name-mismatch': '이름 매칭 실패',
  'date-out-of-range': '일정조사 기간 밖 날짜',
  'ganyeon-row': '연습일정 탭의 갠연 행 (이중 카운트 위험)',
  'stale-booking': '유효 구간이 사라진 예약',
  'team-overlap': '팀연습 겹침 등 데이터 이상',
  'boundary-override': '경계 스위치 데이터 이상 (충돌/형식 오류)',
}

const KIND_ORDER: WarningKind[] = [
  'availability-parse',
  'team-row-parse',
  'name-mismatch',
  'date-out-of-range',
  'ganyeon-row',
  'stale-booking',
  'team-overlap',
  'boundary-override',
]

interface Props {
  warnings: AppWarning[]
}

/**
 * 경고 패널 — 화면 상단, 접을 수 있음. 항목 0개면 렌더하지 않는다 (호출부 처리).
 * 파싱 실패/매칭 실패는 절대 조용히 누락시키지 않고 전부 여기 나열된다.
 */
const WarningsPanel: FC<Props> = ({ warnings }) => {
  const [open, setOpen] = useState(false)
  if (warnings.length === 0) return null

  const groups = KIND_ORDER.map((kind) => ({
    kind,
    items: warnings.filter((w) => w.kind === kind),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="mb-3 rounded-ctl bg-warn-soft text-warn-deep">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center gap-2 px-4 py-2.5 text-left"
      >
        <WarnIcon className="h-4 w-4 flex-none" />
        <span className="text-[13px] font-semibold">
          확인이 필요한 항목 {warnings.length}건
        </span>
        <span className="ml-auto text-[13px] font-medium">
          {open ? '접기' : '펼치기'}
        </span>
      </button>
      {open && (
        <div className="space-y-3 px-4 pb-4">
          {groups.map((g) => (
            <section key={g.kind}>
              <h3 className="mb-1 text-[12px] font-bold">
                {KIND_LABEL[g.kind]} ({g.items.length})
              </h3>
              <ul className="space-y-1.5">
                {g.items.map((w, i) => (
                  <li
                    key={i}
                    className="rounded-blk bg-card/60 px-3 py-2 text-[12px] leading-relaxed"
                  >
                    <div className="font-medium">{w.message}</div>
                    {w.detail && (
                      <div className="mt-0.5 break-all text-[11px] opacity-80">
                        {w.detail}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

export default WarningsPanel
