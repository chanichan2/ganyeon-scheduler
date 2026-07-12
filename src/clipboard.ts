/** 클립보드 복사 — navigator.clipboard 실패 시 textarea 폴백. (app.js 포팅) */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      /* 폴백으로 진행 */
    }
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    /* 실패 시 false */
  }
  document.body.removeChild(ta)
  return ok
}
