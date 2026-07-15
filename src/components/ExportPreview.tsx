import { useMemo, type FC } from 'react'
import { copyTextToClipboard } from '../clipboard'
import { exportDateString } from '../dates'
import { WEEKDAYS } from '../dateUtils'
import {
  buildGanyeonExport,
  buildTsv,
  type ExportBoundary,
  type ExportComputation,
} from '../export'
import { boundaryMapKey, type BoundaryState } from '../overrides'
import { fmtHM } from '../ranges'
import type { ScheduleModel } from '../model'
import { LinkIcon, ScissorsIcon } from './icons'

interface Props {
  open: boolean
  model: ScheduleModel
  /** 예약 key 만 (boundary| 분리 완료). */
  bookings: ReadonlySet<string>
  /** `M/D|H` → override 상태. */
  overrides: ReadonlyMap<string, BoundaryState>
  onToggleBoundary: (b: ExportBoundary) => void
  onResetDate: (dateKey: string) => void
  onToast: (message: string) => void
  onClose: () => void
}

/**
 * TSV 내보내기 미리보기 모달 (관리자 전용).
 *
 * - 날짜별 시간축 막대: run 을 절단 경계에서 나눈 sub-block 을 교대 색으로
 *   표시하고, run 내부 경계마다 토글 핸들(연결=사슬, 절단=가위, override 는
 *   인디고 점)을 놓는다. 탭 즉시 낙관적 반영 + 서버 POST + 실패 롤백은
 *   상위(useBookings 직렬 큐)가 담당.
 * - 아래 테이블은 실제 복사될 TSV 행과 항상 동일 — 같은 buildGanyeonExport
 *   결과를 [복사] 버튼과 공유한다 (불일치 금지).
 * - hover 의존 조작 없음, 토글 핸들 터치 타깃 44px (아이패드/PC 우선).
 */
const ExportPreview: FC<Props> = (props) => {
  if (!props.open) return null
  return <ExportPreviewInner {...props} />
}

const ExportPreviewInner: FC<Props> = ({
  model,
  bookings,
  overrides,
  onToggleBoundary,
  onResetDate,
  onToast,
  onClose,
}) => {
  const comp: ExportComputation = useMemo(
    () =>
      buildGanyeonExport(bookings, overrides, {
        dateKeys: model.dateKeys,
        startHour: model.startHour,
        endHour: model.endHour,
        roster: model.rosterSet,
        availOf: model.availOf,
        teamRangesOf: model.teamRangesOf,
      }),
    [bookings, overrides, model],
  )
  /** 미리보기 테이블과 복사가 공유하는 단일 TSV — comp.rows 에서만 생성. */
  const tsv = useMemo(() => buildTsv(comp.rows, model.startDate), [comp, model])

  // 날짜 섹션 — 예약이 있는 날짜만, 조사 순서(=날짜 오름차순)
  const dates = model.dateKeys.filter((d) => comp.runs.has(d))

  const copy = async () => {
    if (comp.rows.length === 0) {
      onToast('내보낼 수 있는 행이 없어요 (경고 패널 참고).')
      return
    }
    const ok = await copyTextToClipboard(tsv)
    if (ok) onToast(`복사 완료 ✓ ${comp.rows.length}행`)
    else onToast('클립보드 복사에 실패했어요. 브라우저 권한을 확인해 주세요.')
  }

  const resetDate = (dateKey: string) => {
    if (
      window.confirm(
        `${dateKey} 의 경계 스위치 수동 설정을 모두 지우고 자동값으로 되돌릴까요?`,
      )
    ) {
      onResetDate(dateKey)
    }
  }

  return (
    <div
      className="absolute inset-0 z-50 flex items-start justify-center bg-[rgba(2,9,19,0.45)] px-4 pb-6 pt-8 lg:pt-14"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="갠연 TSV 내보내기 미리보기"
    >
      <div
        className="flex max-h-full w-full max-w-[880px] flex-col overflow-hidden rounded-card bg-card shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center gap-2 px-5 pb-3 pt-4">
          <h2 className="text-[17px] font-bold tracking-tight text-ink">
            TSV 내보내기 미리보기
          </h2>
          <span className="text-[13px] text-mute">
            {comp.rows.length}행
            {comp.skipped > 0 &&
              ` · 매칭되지 않아 제외된 예약 ${comp.skipped}건 (경고 패널 참고)`}
          </span>
        </div>

        {/* 본문 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          <p className="mb-4 text-[12px] leading-relaxed text-mute">
            시간축의 스위치를 탭해 정각 경계를 연결(
            <LinkIcon className="inline h-3 w-3" />
            )/절단(
            <ScissorsIcon className="inline h-3 w-3" />
            )할 수 있어요. 자동값과 다르게 수동으로 바꾼 스위치에는 인디고 점이
            붙어요. 겹치는 시간이 없는 경계는 자동으로 절단돼요.
          </p>

          {dates.length === 0 && (
            <div className="rounded-ctl bg-paper px-4 py-8 text-center text-[13px] text-mute">
              내보낼 갠연 예약이 없어요.
            </div>
          )}

          {dates.map((dateKey) => (
            <DateSection
              key={dateKey}
              dateKey={dateKey}
              model={model}
              comp={comp}
              overrides={overrides}
              onToggleBoundary={onToggleBoundary}
              onReset={() => resetDate(dateKey)}
            />
          ))}

          {/* TSV 행 미리보기 — comp.rows 그대로 */}
          <h3 className="mb-2 mt-6 text-[13px] font-bold text-ink">
            복사될 내용 ({comp.rows.length}행)
          </h3>
          <div className="overflow-x-auto rounded-ctl bg-paper">
            <table className="w-full min-w-[560px] border-collapse text-[12px]">
              <thead>
                <tr className="text-left text-[11px] text-mute">
                  <th className="px-3 py-2 font-semibold">날짜</th>
                  <th className="px-2 py-2 font-semibold">시작</th>
                  <th className="px-2 py-2 font-semibold">종료</th>
                  <th className="px-2 py-2 font-semibold">곡명</th>
                  <th className="px-2 py-2 font-semibold">연습실</th>
                  <th className="px-2 py-2 font-semibold">참여부원</th>
                </tr>
              </thead>
              <tbody>
                {comp.rows.map((r, i) => (
                  <tr key={i} className="border-t border-line bg-card/60">
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-body">
                      {exportDateString(r.dateKey, model.startDate)}
                    </td>
                    <td className="px-2 py-2 tabular-nums text-body">
                      {fmtHM(r.startHour * 60)}
                    </td>
                    <td className="px-2 py-2 tabular-nums text-body">
                      {fmtHM(r.endHour * 60)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-body">갠연</td>
                    <td className="px-2 py-2 text-faint" />
                    <td className="px-2 py-2 leading-relaxed text-body">
                      {r.membersStr}
                    </td>
                  </tr>
                ))}
                {comp.rows.length === 0 && (
                  <tr className="border-t border-line">
                    <td colSpan={6} className="px-3 py-6 text-center text-mute">
                      생성되는 행이 없어요.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-end gap-2 bg-paper px-5 py-3">
          <button
            type="button"
            onClick={() => void copy()}
            className="h-11 rounded-full bg-accent px-6 text-[14px] font-semibold text-white transition hover:bg-accent-deep active:scale-95 active:bg-accent-deep"
          >
            복사
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-full bg-card px-5 text-[14px] font-medium text-body shadow-subtle transition hover:bg-line active:scale-95"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

/** 날짜 1개 섹션 — 제목 + 자동값 초기화 + 시간축 막대. */
const DateSection: FC<{
  dateKey: string
  model: ScheduleModel
  comp: ExportComputation
  overrides: ReadonlyMap<string, BoundaryState>
  onToggleBoundary: (b: ExportBoundary) => void
  onReset: () => void
}> = ({ dateKey, model, comp, overrides, onToggleBoundary, onReset }) => {
  const runs = comp.runs.get(dateKey) ?? []
  const dayBoundaries = comp.boundaries.filter((b) => b.dateKey === dateKey)
  const d = model.dateByKey.get(dateKey)
  const [mm, dd] = dateKey.split('/')
  const title = `${mm}월 ${dd}일${d ? ` (${WEEKDAYS[d.getDay()]})` : ''}`
  // 이 날짜에 override key 가 하나라도 있으면(내부 경계가 아니게 된 stale 포함)
  // 초기화 버튼 활성화
  const hasOverride = [...overrides.keys()].some((k) =>
    k.startsWith(`${dateKey}|`),
  )

  const hourCount = model.endHour - model.startHour
  const pctOfHour = (h: number) => ((h - model.startHour) / hourCount) * 100

  // sub-block: run 을 절단 경계에서 자른 조각 (행이 안 만들어진 블록도 표시)
  const blocks: Array<[number, number]> = []
  for (const [h0, h1] of runs) {
    const cuts = dayBoundaries
      .filter((b) => b.hour > h0 && b.hour < h1 && b.effective === 'cut')
      .map((b) => b.hour)
    const edges = [h0, ...cuts, h1]
    for (let i = 0; i < edges.length - 1; i++) blocks.push([edges[i], edges[i + 1]])
  }

  return (
    <section className="mb-4">
      <div className="mb-1 flex min-h-[44px] items-center gap-2">
        <h3 className="text-[14px] font-bold tracking-tight text-ink">{title}</h3>
        <button
          type="button"
          onClick={onReset}
          disabled={!hasOverride}
          className="ml-auto h-9 rounded-full bg-paper px-3 text-[12px] font-medium text-body transition hover:bg-line active:scale-95 disabled:opacity-40"
        >
          자동값으로 초기화
        </button>
      </div>

      {/* 시간축 막대 — 그리드와 같은 퍼센트 배치 */}
      <div className="rounded-ctl bg-paper px-3 pb-1 pt-2">
        <div className="relative h-12">
          {/* 축 기준선 */}
          <div
            aria-hidden
            className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line-strong"
          />
          {/* sub-block 막대 (교대 색) — 범위 숫자는 아래 시각 라벨이 담당 */}
          {blocks.map(([b0, b1], i) => (
            <div
              key={`bk-${b0}`}
              aria-hidden
              className={`absolute top-1/2 h-8 -translate-y-1/2 rounded-[7px] ${
                i % 2 === 0 ? 'bg-accent' : 'bg-accent-deep'
              }`}
              style={{
                left: `calc(${pctOfHour(b0)}% + 1px)`,
                width: `max(2px, calc(${((b1 - b0) / hourCount) * 100}% - 2px))`,
              }}
            />
          ))}
          {/* 경계 토글 핸들 — 터치 타깃 44px, hover 없이도 전부 조작 가능 */}
          {dayBoundaries.map((b) => (
            <button
              key={`bd-${b.hour}`}
              type="button"
              onClick={() => onToggleBoundary(b)}
              aria-pressed={b.effective === 'cut'}
              aria-label={
                `${title} ${b.hour}시 경계 — 현재 ${
                  b.effective === 'cut' ? '절단' : '연결'
                }` +
                (b.overridden ? ' (수동)' : ' (자동)') +
                ', 탭해서 전환'
              }
              title={`${b.hour}시 경계: ${
                b.effective === 'cut' ? '절단 → 탭하면 연결' : '연결 → 탭하면 절단'
              }`}
              className="absolute top-1/2 z-[2] flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
              style={{ left: `${pctOfHour(b.hour)}%` }}
            >
              <span
                className={`relative flex h-7 w-7 items-center justify-center rounded-full shadow-standard ring-1 transition active:scale-90 ${
                  b.effective === 'cut'
                    ? 'bg-card text-body ring-line-strong'
                    : 'bg-accent-soft text-accent ring-accent'
                }`}
              >
                {b.effective === 'cut' ? (
                  <ScissorsIcon className="h-3.5 w-3.5" />
                ) : (
                  <LinkIcon className="h-3.5 w-3.5" />
                )}
                {b.overridden && (
                  <span
                    aria-hidden
                    className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-card"
                  />
                )}
              </span>
            </button>
          ))}
        </div>
        {/* 시각 라벨 — run 시작/끝 + 경계 */}
        <div className="relative h-4">
          {[
            ...new Set(
              runs.flatMap(([h0, h1]) => [h0, h1]).concat(
                dayBoundaries.map((b) => b.hour),
              ),
            ),
          ].map((h) => (
            <span
              key={`hl-${h}`}
              className="absolute -translate-x-1/2 text-[10px] font-medium tabular-nums text-mute"
              style={{ left: `${pctOfHour(h)}%` }}
            >
              {h}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

export default ExportPreview
