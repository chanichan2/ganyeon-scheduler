import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchGanyeon, fetchSurvey } from './api'
import { addDays, isSameDay, startOfDay } from './dateUtils'
import type { ExportBoundary } from './export'
import {
  buildScheduleModel,
  computeBookingIssues,
  cumulativeMinutesByDate,
  cumulativeMinutesByMember,
  type ScheduleModel,
} from './model'
import {
  boundaryResetOps,
  boundaryToggleOps,
  splitServerKeys,
} from './overrides'
import { buildSongColorMap } from './songColors'
import { useAdmin } from './useAdmin'
import { useBookings } from './useBookings'
import ExportPreview from './components/ExportPreview'
import Header from './components/Header'
import MemberGrid from './components/MemberGrid'
import MonthPopup from './components/MonthPopup'
import WarningsPanel from './components/WarningsPanel'
import type { GanyeonPayload, SurveyPayload } from './types'

/** 자동 갱신 주기 — 5분. */
const POLL_MS = 5 * 60 * 1000
/** 오늘 판정 갱신 주기 — 30초. */
const TICK_MS = 30 * 1000

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
  const [exportOpen, setExportOpen] = useState(false)

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
  const {
    bookings: serverKeys,
    syncFromServer,
    toggle,
    applyKeyOps,
    hasPendingOps,
    getMutationSeq,
  } = useBookings({
    apiUrl: ganyeonUrl,
    tokenRef: admin.tokenRef,
    onError: showToast,
    onUnauthorized: handleUnauthorized,
  })

  // 서버 key 배열 → 예약 key / 경계 override 분리.
  // boundary| key 는 예약 파싱·경고 패널·화면 어디에도 흘러들지 않는다.
  const keySplit = useMemo(() => splitServerKeys(serverKeys), [serverKeys])
  const bookings = keySplit.bookings

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
    // 이 GET 이 시작된 시점의 변경 세대 — 응답이 도착했을 때 세대가 달라졌으면
    // (그 사이 사용자가 예약을 변경했으면) 낡은 스냅샷이므로 sync 를 건너뛴다.
    const seqAtStart = getMutationSeq()
    try {
      const [surveyData, ganyeonData] = await Promise.all([
        fetchSurvey(surveyUrl),
        fetchGanyeon(ganyeonUrl),
      ])
      setSurvey(surveyData)
      setGanyeon(ganyeonData)
      syncFromServer(ganyeonData.bookings ?? [], seqAtStart)
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
  }, [surveyUrl, ganyeonUrl, syncFromServer, getMutationSeq])

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
        : { warnings: [], deadKeys: new Set<string>() },
    [model, bookings],
  )
  const cumMinutes = useMemo(
    () =>
      model ? cumulativeMinutesByMember(model, bookings) : new Map<string, number>(),
    [model, bookings],
  )
  const allWarnings = useMemo(
    () =>
      model
        ? [...model.warnings, ...bookingIssues.warnings, ...keySplit.warnings]
        : [],
    [model, bookingIssues, keySplit],
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

  /** 자정 ms → 그날 유효 갠연 분 합계 (주간 스트립/월 달력 캡션).
   *  예약 칸 수가 아니라 유효 분 기준 — 부원표/누적 시간과 항상 같은 의미. */
  const minutesByDay = useMemo(() => {
    const m = new Map<number, number>()
    if (!model) return m
    for (const [dateKey, min] of cumulativeMinutesByDate(model, bookings)) {
      const d = model.dateByKey.get(dateKey)
      if (d) m.set(d.getTime(), min)
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
      if (monthOpen || exportOpen || e.defaultPrevented) return
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
  }, [selDate, monthOpen, exportOpen, goto])

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

  // TSV 내보내기 미리보기 (관리자 전용) — 복사는 모달 안에서.
  // 미확정 POST 가 남아 있으면 열지 않는다 — 화면과 서버가 아직 다를 수 있다.
  const openExport = useCallback(() => {
    if (!admin.isAdmin || !model) return
    if (hasPendingOps()) {
      showToast('저장 중인 변경이 있어요. 잠시 후 다시 시도해 주세요.')
      return
    }
    if (bookings.size === 0) {
      showToast('내보낼 갠연 예약이 없어요. 칸을 클릭해 먼저 예약해 주세요.')
      return
    }
    setExportOpen(true)
  }, [admin.isAdmin, model, hasPendingOps, bookings, showToast])

  // 경계 스위치 토글/초기화 — 서버 op 계산은 순수 함수(overrides.ts),
  // 낙관적 반영 + 직렬 POST + 실패 롤백은 useBookings 가 담당.
  const onToggleBoundary = useCallback(
    (b: ExportBoundary) => {
      applyKeyOps(
        boundaryToggleOps(serverKeys, b.dateKey, b.hour, b.auto, b.effective),
      )
    },
    [applyKeyOps, serverKeys],
  )
  const onResetDate = useCallback(
    (dateKey: string) => {
      applyKeyOps(boundaryResetOps(serverKeys, dateKey))
    },
    [applyKeyOps, serverKeys],
  )

  const dayMembers = model && selDateKey ? model.days.get(selDateKey) : null

  return (
    <div className="relative mx-auto flex h-[100dvh] max-w-[1680px] flex-col overflow-hidden bg-paper shadow-standard">
      <Header
        selDate={selDate}
        today={today}
        minutesByDay={minutesByDay}
        loading={loading}
        updatedAt={updatedAt}
        isAdmin={admin.isAdmin}
        onGoto={goto}
        onRefresh={load}
        onOpenMonth={() => setMonthOpen(true)}
        onAdminLogin={() => void adminLogin()}
        onAdminLogout={admin.logout}
        onOpenExport={openExport}
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
                deadKeys={bookingIssues.deadKeys}
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

      {model && (
        <ExportPreview
          open={exportOpen}
          model={model}
          bookings={bookings}
          overrides={keySplit.overrides}
          hasPendingOps={hasPendingOps}
          onToggleBoundary={onToggleBoundary}
          onResetDate={onResetDate}
          onToast={showToast}
          onClose={() => setExportOpen(false)}
        />
      )}

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
        minutesByDay={minutesByDay}
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
