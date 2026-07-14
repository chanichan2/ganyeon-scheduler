/**
 * 디자인 토큰 — sonsesang2026 (Toss 디자인 시스템 기반 튜닝 값) 유지.
 * 같은 값이 src/index.css 의 CSS 변수로도 선언되어 있음 (커스텀 CSS 클래스용).
 *
 * 규칙 요약:
 *  - accent(인디고 #3E4FD6)는 UI 조작·강조 + 갠연 오버레이 전용. 곡 색으로 쓰지 않는다.
 *  - unavail(#1B1D22)은 부원표의 "불가능 시간" 배경 — 완전 검정이 아닌 아주 살짝 연한 검정.
 *  - 구획은 1px 테두리 대신 면 색 차이(paper vs card) + subtle 그림자.
 *  - 간격은 4/8/12/16/24/32/48 스케일만 사용.
 */

/** @type {import('tailwindcss').Config} */
export default {
  // 모든 hover: 유틸리티를 @media (hover:hover) and (pointer:fine) 로 한정 —
  // 아이패드에서 첫 탭이 hover 상태 전환으로 소모되는 문제를 원천 차단.
  future: { hoverOnlyWhenSupported: true },
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F2F4F6', // 페이지 배경
        card: '#FFFFFF', // 카드/시트 면
        ink: '#191F28', // 타이틀
        body: '#4E5968', // 본문
        mute: '#8B95A1', // 캡션/보조
        faint: '#B0B8C1', // 플레이스홀더/비활성
        line: {
          DEFAULT: '#E5E8EB', // 기본 보더 (최소한만)
          strong: '#D1D6DB', // 강조 보더
        },
        grid: '#EDEFF2', // 격자선 — 꼭 필요한 선만 아주 옅게
        unavail: '#1B1D22', // 부원표 불가능 시간 배경 (완전 검정 아님)
        accent: {
          DEFAULT: '#3E4FD6', // 조작·강조 + 갠연 전용 인디고
          deep: '#3140B0', // hover/press
          soft: '#EEF0FC', // soft 배경
        },
        ok: '#03B26C', // 상태 — 성공
        warn: {
          DEFAULT: '#F59E0B', // 상태 — 대기/주의
          soft: '#FEF4E6', // 옅은 앰버 배경 (경고 패널)
          deep: '#B45309', // 앰버 배경 위 글자
        },
        danger: '#F04452', // 상태 — 위험
        sun: '#E0475C', // 일요일 글자 — 은은한 빨강
        sat: '#3D7BF5', // 토요일 글자 — 은은한 파랑
      },
      borderRadius: {
        sheet: '20px', // 바텀시트 상단
        card: '16px', // 카드/시트
        ctl: '12px', // 컨트롤/배너
        blk: '10px', // 블록/칩
      },
      boxShadow: {
        subtle: '0 1px 3px rgba(0,0,0,0.06)',
        standard: '0 2px 8px rgba(0,0,0,0.08)',
        elevated: '0 4px 12px rgba(0,0,0,0.12)',
      },
      fontFamily: {
        sans: [
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Apple SD Gothic Neo"',
          '"Noto Sans KR"',
          'system-ui',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
