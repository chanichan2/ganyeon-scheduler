import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchGanyeon, fetchSurvey } from './api'
import { parseBookingKey } from './bookingKey'
import { copyTextToClipboard } from './clipboard'
import { addDays, isSameDay, startOfDay } from './dateUtils'
import { buildGanyeonExportRows, buildTsv } from './export'
import {
  buildScheduleModel,
  computeBookingIssues,
  cumulativeMinutesByMember,
  type ScheduleModel,
} from './model'
import { buildSongColorMap } from './songColors'
import { useAdmin } from './useAdmin'
import { useBookings } from './useBookings'
import Header from './components/Header'
import MemberGrid from './components/MemberGrid'
import MonthPopup from './components/MonthPopup'
import WarningsPanel from './components/WarningsPanel'
import type { GanyeonPayload, SurveyPayload } from './types'

/** 자동 갱신 주기 — 5분. */
const POLL_MS = 5 * 60 * 1000
/** 오늘 판정 갱신 주기 — 30초. */
const TICK_MS = 30 * 1000
const EXPORT_LABEL_DEFAULT = '갠연 TSV 복사'

interface AppError {
  message: string
}

/**
 * 갠연(개인연습) 스케줄러 — 단일 일자 부원표 메인 앱.
 *
 * 데이터 소스는 정확히 두 개, 페이지 로드 시 병렬 fetch:
 *   GET ① 일정조사 Apps Script (읽기 전용) — settings/dates/availability
 *   GET ② 갠연 Apps Script — teamRows(연습일정 탭) + bookings(PropertiesService)
 *
 * 예약의 진실은 서버(PropertiesService)뿐 — 유효 구간은 렌더/내보내기 시점에
 * 항상 재계산한다. 관리자 모드에서만 칸 클릭으로 예약/취소.
 */
function App() {
  const surveyUrl = import.meta.env.VITE_SURVEY_API_URL as string | undefined
  const ganyeonUrl = import.meta.env.VITE_GANYEON_API_URL as string | undefined

  const [survey, setSurvey] = useState<SurveyPayload | null>(null)
  const [ganyeon, setGanyeon] = useState<GanyeonPayload | null>(null)
  const [error, setError] = useState<AppError | null>(null)
  const [loading, setLoading] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const [now, setNow] = useState(() => new Date())
  const today = useMemo(() => startOfDay(now), [now])
  /** 사용자가 고른 날짜 — null 이면 자동(오늘, 기간 밖이면 첫 조사일). */
  const [pickedDate, setPickedDate] = useState<Date | null>(null)
  const [monthOpen, setMonthOpen] = useState(false)

  // 토스트 (예약 저장 실패/안내)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)
  const showToast = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 5000)
  }, [])

  // 관리자 모드 + 예약 동기화
  const admin = useAdmin(ganyeonUrl)
  const handleUnauthorized = useCallback(() => {
    admin.handleUnauthorized()
    showToast(
      '관리자 인증이 만료되었거나 비밀번호가 변경되었어요. 다시 로그인해 주세요.',
    )
  }, [admin, showToast])
  const { bookings, syncFromServer, toggle } = useBookings({
    apiUrl: ganyeonUrl,
    tokenRef: admin.tokenRef,
    onError: showToast,
    onUnauthorized: handleUnauthorized,
  })

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), TICK_MS)
    return () => window.clearInterval(id)
  }, [])

  // 데이터 로드 — 두 소스 병렬 fetch
  const inFlight = useRef(false)
  const load = useCallback(async () => {
    if (inFlight.current) return
    if (!surveyUrl || !ganyeonUrl) {
      setError({
        message:
          '환경변수 VITE_SURVEY_API_URL / VITE_GANYEON_API_URL 이 설정되지 않았어요. .env.example 을 참고해 .env 를 만들어주세요.',
      })
      return
    }
    inFlight.current = true
    setLoading(true)
    try {
      const [surveyData, ganyeonData] = await Promise.all([
        fetchSurvey(surveyUrl),
        fetchGanyeon(ganyeonUrl),
      ])
      setSurvey(surveyData)
      setGanyeon(ganyeonData)
      syncFromServer(ganyeonData.bookings ?? [])
      setError(null)
      setUpdatedAt(new Date())
    } catch (e) {
      setError({
        message:
          e instanceof Error
            ? e.message
            : '데이터를 불러오지 못했어요. 잠시 후 다시 시도하세요.',
      })
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }, [surveyUrl, ganyeonUrl, syncFromServer])

  useEffect(() => {
    const runLoad = () => {
      void load()
    }
    const initialId = window.setTimeout(runLoad, 0)
    const intervalId = window.setInterval(runLoad, POLL_MS)
    return () => {
      window.clearTimeout(initialId)
      window.clearInterval(intervalId)
    }
  }, [load])

  // 모델 조립 — settings 이상 등 치명 오류는 fatal 로 분리
  const { model, fatal } = useMemo((): {
    model: ScheduleModel | null
    fatal: string | null
  } => {
    if (!survey || !ganyeon) return { model: null, fatal: null }
    try {
      return { model: buildScheduleModel(survey, ganyeon), fatal: null }
    } catch (e) {
      return {
        model: null,
        fatal: e instanceof Error ? e.message : String(e),
      }
    }
  }, [survey, ganyeon])

  // 선택된 날짜 — 직접 고르기 전에는 오늘, 오늘이 조사 기간 밖이면 첫 조사일
  const selDate = useMemo(() => {
    if (pickedDate) return pickedDate
    if (model) {
      const dates = [...model.dateByKey.values()]
      if (dates.length > 0 && !dates.some((d) => isSameDay(d, today))) {
        return dates[0]
      }
    }
    return today
  }, [pickedDate, model, today])

  // 예약 의존 파생값
  const bookingIssues = useMemo(
    () =>
      model
        ? computeBookingIssues(model, bookings)
        : { warnings: [], staleKeys: new Set<string>() },
    [model, bookings],
  )
  const cumMinutes = useMemo(
    () =>
      model ? cumulativeMinutesByMember(model, bookings) : new Map<string, number>(),
    [model, bookings],
  )
  const allWarnings = useMemo(
    () => (model ? [...model.warnings, ...bookingIssues.warnings] : []),
    [model, bookingIssues],
  )

  /** 곡 → 원색 hex (팀연습 오버레이). 갠연은 곡 색 배정에서 제외(인디고 전용). */
  const songColorMap = useMemo(() => {
    if (!model) return {}
    const songs: string[] = []
    for (const days of model.days.values()) {
      for (const md of days) for (const p of md.practices) songs.push(p.song)
    }
    return buildSongColorMap(songs)
  }, [model])

  /** 자정 ms → 그날 갠연 예약 칸 수 (주간 스트립/월 달력 캡션). */
  const countByDay = useMemo(() => {
    const m = new Map<number, number>()
    if (!model) return m
    for (const key of bookings) {
      const ref = parseBookingKey(key)
      if (!ref) continue
      const d = model.dateByKey.get(ref.dateKey)
      if (!d) continue
      m.set(d.getTime(), (m.get(d.getTime()) ?? 0) + 1)
    }
    return m
  }, [model, bookings])

  /** 선택된 날짜의 조사 날짜 키 — 기간 밖이면 null. */
  const selDateKey = useMemo(() => {
    if (!model) return null
    for (const [key, d] of model.dateByKey) {
      if (isSameDay(d, selDate)) return key
    }
    return null
  }, [model, selDate])

  const goto = useCallback((d: Date) => {
    setPickedDate(startOfDay(d))
  }, [])

  // PC 키보드 단축키 — ←/→ 로 이전/다음 날짜. input 등 편집 요소 포커스 중이거나
  // 월 달력 팝업이 열려 있으면 무시.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (monthOpen || e.defaultPrevented) return
      const t = e.target
      if (
        t instanceof HTMLElement &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      ) {
        return
      }
      e.preventDefault()
      goto(addDays(selDate, e.key === 'ArrowLeft' ? -1 : 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selDate, monthOpen, goto])

  // 관리자 로그인 — sonsesangscheduler 와 동일하게 비밀번호 프롬프트 + verify POST
  const adminLogin = useCallback(async () => {
    const pw = window.prompt('관리자 비밀번호를 입력하세요.')
    if (pw == null || pw === '') return
    const err = await admin.login(pw)
    if (err) showToast(err)
  }, [admin, showToast])

  // 칸 클릭 — 예약/취소 토글 (관리자 전용, 클릭 가능 여부는 MemberGrid 가 판정)
  const onToggle = useCallback(
    (key: string) => {
      if (!admin.isAdmin) return
      toggle(key)
    },
    [admin.isAdmin, toggle],
  )

  // TSV 내보내기 (관리자 전용, 클립보드 복사)
  const [exportLabel, setExportLabel] = useState(EXPORT_LABEL_DEFAULT)
  const [exportBusy, setExportBusy] = useState(false)
  const exportTsv = useCallback(async () => {
    if (!admin.isAdmin || !model) return
    if (bookings.size === 0) {
      showToast('내보낼 갠연 예약이 없어요. 칸을 클릭해 먼저 예약해 주세요.')
      return
    }
    const { rows, skipped } = buildGanyeonExportRows(bookings, {
      dateKeys: model.dateKeys,
      startHour: model.startHour,
      endHour: model.endHour,
      roster: model.rosterSet,
      availOf: model.availOf,
      teamRangesOf: model.teamRangesOf,
    })
    if (rows.length === 0) {
      showToast(
        `내보낼 수 있는 예약이 없어요 (현재 데이터와 맞지 않는 예약 ${skipped}건 — 경고 패널 참고).`,
      )
      return
    }
    const tsv = buildTsv(rows, model.startDate)
    const ok = await copyTextToClipboard(tsv)
    if (!ok) {
      showToast('클립보드 복사에 실패했어요. 브라우저 권한을 확인해 주세요.')
      return
    }
    if (skipped > 0) {
      showToast(
        `현재 데이터와 매칭되지 않아 제외된 예약 ${skipped}건이 있어요 (경고 패널 참고).`,
      )
    }
    setExportLabel(`복사 완료 ✓ ${rows.length}행`)
    setExportBusy(true)
    window.setTimeout(() => {
      setExportLabel(EXPORT_LABEL_DEFAULT)
      setExportBusy(false)
    }, 2000)
  }, [admin.isAdmin, model, bookings, showToast])

  const dayMembers = model && selDateKey ? model.days.get(selDateKey) : null

  return (
    <div className="relative mx-auto flex h-[100dvh] max-w-[1680px] flex-col overflow-hidden bg-paper shadow-standard">
      <Header
        selDate={selDate}
        today={today}
        countByDay={countByDay}
        loading={loading}
        updatedAt={updatedAt}
        isAdmin={admin.isAdmin}
        exportLabel={exportLabel}
        exportBusy={exportBusy}
        onGoto={goto}
        onRefresh={load}
        onOpenMonth={() => setMonthOpen(true)}
        onAdminLogin={() => void adminLogin()}
        onAdminLogout={admin.logout}
        onExportTsv={() => void exportTsv()}
      />

      <main className="flex-1 touch-pan-y overflow-y-auto overscroll-y-contain px-4 pb-12 pt-4 [-webkit-overflow-scrolling:touch] md:px-6 lg:px-8">
        {error && !model && !fatal && (
          <ErrorView message={error.message} onRetry={() => void load()} />
        )}
        {fatal && <ErrorView message={fatal} onRetry={() => void load()} />}
        {error && model && (
          <div
            role="alert"
            className="mb-3 rounded-ctl bg-warn-soft px-4 py-3 text-[13px] leading-relaxed text-warn-deep"
          >
            새로고침에 실패했어요 — 마지막으로 불러온 데이터를 보여주고 있어요.
            ({error.message})
          </div>
        )}
        {!error && !model && !fatal && (
          <div className="pt-12 text-center text-[15px] text-mute">
            데이터를 불러오는 중…
          </div>
        )}

        {model && (
          <div className="day-anim" key={selDate.getTime()}>
            <WarningsPanel warnings={allWarnings} />
            {dayMembers && selDateKey ? (
              <MemberGrid
                startHour={model.startHour}
                endHour={model.endHour}
                dateKey={selDateKey}
                memberDays={dayMembers}
                bookings={bookings}
                staleKeys={bookingIssues.staleKeys}
                cumMinutes={cumMinutes}
                isAdmin={admin.isAdmin}
                songColors={songColorMap}
                onToggle={onToggle}
              />
            ) : (
              <div className="rounded-card bg-card px-4 py-10 text-center text-[13px] text-mute shadow-subtle">
                일정조사 기간 밖 날짜예요
                {model.dateKeys.length > 0 &&
                  ` (조사 기간: ${model.dateKeys[0]} ~ ${model.dateKeys[model.dateKeys.length - 1]})`}
              </div>
            )}
          </div>
        )}
      </main>

      {toast && (
        <div
          role="status"
          className="absolute bottom-6 left-1/2 z-50 w-max max-w-[85%] -translate-x-1/2 rounded-ctl bg-ink px-4 py-3 text-[13px] font-medium leading-relaxed text-white shadow-elevated lg:bottom-8 lg:left-auto lg:right-8 lg:max-w-[420px] lg:translate-x-0"
        >
          {toast}
        </div>
      )}

      <MonthPopup
        open={monthOpen}
        selDate={selDate}
        today={today}
        countByDay={countByDay}
        onSelect={(d) => {
          goto(d)
          setMonthOpen(false)
        }}
        onClose={() => setMonthOpen(false)}
      />
    </div>
  )
}

const ErrorView = ({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) => (
  <div role="alert" className="rounded-card bg-card p-6 shadow-subtle">
    <div className="mb-1 text-[17px] font-semibold tracking-tight text-ink">
      데이터를 불러오지 못했어요
    </div>
    <p className="text-[13px] leading-relaxed text-body">{message}</p>
    <button
      type="button"
      onClick={onRetry}
      className="mt-4 h-11 rounded-full bg-accent px-6 text-[15px] font-semibold text-white transition hover:bg-accent-deep active:scale-95 active:bg-accent-deep"
    >
      다시 시도
    </button>
  </div>
)

export default App
