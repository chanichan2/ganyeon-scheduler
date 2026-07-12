/**
 * 곡별 컬러 배정 — 4단계 팔레트.
 *
 *   Tier 1 (10): 곡이 10개 이하일 때만 쓰임. 색상환을 넓게 두른 핵심 10색.
 *   Tier 2 (5): 11~15곡일 때 추가 — Tier 1 hue 사이를 메우는 새 색 5.
 *   Tier 3 (5): 16~20곡일 때 추가 — 남은 gap 을 채우는 새 색 5.
 *   Tier 4 (5): 21~25곡일 때 추가 — 마지막 gap 을 채우는 새 색 5.
 *   25곡 초과 → 회색 #9CA3AF.
 *
 * 팔레트 톤: "뚜렷함과 파스텔의 사이"(candy/macaron). 명암 변주가 아니라 색상환
 * 전체에 hue 를 분산해 곡이 늘어도 "진한/연한 같은 색"이 아닌 서로 다른 색이 나옴.
 * UI accent(인디고 #3E4FD6, hue≈233°)와 안 겹치도록 파랑~보라 사이 대역(215~255°)은
 * 팔레트에서 비워 둠 — 어떤 곡도 조작 색으로 오인되지 않게.
 *
 * 곡 이름을 가나다순으로 정렬해 PALETTE 인덱스에 매핑하므로
 * 같은 데이터면 새로고침/세션 간에도 항상 같은 색.
 */

/** Tier 1 — 1~10곡 구간. 색상환을 고르게 두른 candy 핵심 10색. */
const TIER_1: readonly string[] = [
  '#F35E65', // 코랄레드
  '#65CF59', // 그린
  '#5AB8E7', // 스카이
  '#F2C231', // 옐로
  '#BC83D8', // 바이올렛
  '#F38749', // 오렌지
  '#33CCAD', // 틸민트
  '#E873B5', // 마젠타핑크
  '#A2C945', // 라임
  '#DA6CDA', // 퍼플
]

/** Tier 2 — 11~15곡 구간. Tier 1 hue 사이를 메우는 새 색. */
const TIER_2: readonly string[] = [
  '#ED775A', // 살몬
  '#DDDD3C', // 머스터드
  '#40BF6A', // 포레스트그린
  '#3AC9DF', // 시안
  '#A782DE', // 페리윙클
]

/** Tier 3 — 16~20곡 구간. 색상환의 남은 gap 을 채우는 새 색. */
const TIER_3: readonly string[] = [
  '#EEA03A', // 앰버오렌지
  '#78C445', // 옐로그린
  '#34B27F', // 딥틸
  '#E65681', // 로즈핑크
  '#AF53C6', // 딥바이올렛
]

/** Tier 4 — 21~25곡 구간. 마지막 gap 을 채우는 새 색(브라운 등 포함). */
const TIER_4: readonly string[] = [
  '#CC4C33', // 브릭테라코타
  '#AB7436', // 캐러멜브라운
  '#55A560', // 뮤티드세이지
  '#CF59BB', // 플럼
  '#318AD8', // 딥스카이블루
]

/** 4단계 합쳐 25개. 인덱스 그대로가 우선순위 순. */
const PALETTE: readonly string[] = [...TIER_1, ...TIER_2, ...TIER_3, ...TIER_4]

/** 25개 팔레트를 다 쓴 뒤(26번째 곡부터) 사용하는 회색. */
const OVERFLOW_COLOR = '#9CA3AF'

/** 호환용 default. 이름이 비어있는 비정상 케이스 대비. */
export const DEFAULT_SONG_COLOR = OVERFLOW_COLOR

/** 디버그/문서용 export — 팔레트 구성 노출. */
export const SONG_COLOR_TIERS = {
  tier1: TIER_1,
  tier2: TIER_2,
  tier3: TIER_3,
  tier4: TIER_4,
  overflow: OVERFLOW_COLOR,
} as const

/**
 * 곡 목록 → 곡명 → 색 매핑.
 *
 * 가나다순(localeCompare 'ko')으로 정렬한 뒤 PALETTE 인덱스에 매핑.
 * 같은 데이터면 항상 같은 결과 → 새로고침해도 색이 안 바뀜.
 *
 * 곡 수가 25를 초과하면 26번째 곡부터는 모두 OVERFLOW_COLOR(회색) 로 설정됨.
 */
export function buildSongColorMap(
  songs: Iterable<string>,
): Record<string, string> {
  const unique = Array.from(
    new Set(Array.from(songs, (s) => s.trim()).filter(Boolean)),
  )
  unique.sort((a, b) => a.localeCompare(b, 'ko'))
  const map: Record<string, string> = {}
  for (let i = 0; i < unique.length; i++) {
    map[unique[i]] = i < PALETTE.length ? PALETTE[i] : OVERFLOW_COLOR
  }
  return map
}

/**
 * 곡명 → hex.
 *
 * 호출자(App)는 미리 `buildSongColorMap` 으로 만든 맵을 `override` 로 넘긴다.
 * 맵이 없거나 곡이 맵에 없으면 회색으로 떨어짐 (안전한 폴백).
 */
export function songColor(
  name: string,
  override?: Record<string, string>,
): string {
  if (!name) return DEFAULT_SONG_COLOR
  if (override && override[name]) return override[name]
  return DEFAULT_SONG_COLOR
}
