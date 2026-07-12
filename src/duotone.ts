/**
 * 곡 색 듀오톤 유도 — 데모의 duo() 규칙.
 *
 * songColors.ts 팔레트의 원색 hex 를 그대로 유지하되, 화면에서는
 * HSL 변환으로 유도한 3색을 사용한다:
 *   bg — 연한 배경 (lightness 94%, 채도 상한 88)
 *   tx — 진한 글자 (lightness 31%, 채도 상한 68)
 *   ed — 좌측 엣지 (원색 hex 그대로)
 * 타임라인 블록·리스트 칩·바텀시트 점이 모두 이 규칙 하나를 공유한다.
 */

export interface Duotone {
  /** 연한 배경색. */
  bg: string
  /** 진한 글자색. */
  tx: string
  /** 좌측 엣지 — 원색 hex. */
  ed: string
}

/** "#RRGGBB" → [hue 0~360, saturation 0~100, lightness 0~100]. */
export function hexToHSL(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (mx + mn) / 2
  if (mx !== mn) {
    const d = mx - mn
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
    h =
      mx === r
        ? (g - b) / d + (g < b ? 6 : 0)
        : mx === g
          ? (b - r) / d + 2
          : (r - g) / d + 4
    h /= 6
  }
  return [h * 360, s * 100, l * 100]
}

/** 원색 hex → 듀오톤. */
export function duo(hex: string): Duotone {
  const [h, s] = hexToHSL(hex)
  return {
    bg: `hsl(${h} ${Math.min(s, 88)}% 94%)`,
    tx: `hsl(${h} ${Math.min(s, 68)}% 31%)`,
    ed: hex,
  }
}
