/**
 * 갠연 스케줄러 — Apps Script (새 스프레드시트 전용)
 *
 * ★ 이 파일은 레포에 보관하는 백업본입니다. 실제 동작은 새 스프레드시트에
 *   설치된 Apps Script 가 담당합니다. Apps Script 쪽을 수정하면 이 파일도
 *   같이 갱신해 두세요.
 *
 * ★ 주의: 기존 sonsesangscheduler(일정조사) Apps Script 와는 완전히 별개의
 *   새 배포입니다. 기존 배포/코드는 절대 수정하지 마세요.
 *
 * 설치 방법 (순서대로):
 *   1) 새 Google Spreadsheet 를 만든다.
 *   2) 탭(시트) 이름을 "연습일정" 으로 바꾸고, 1행에 헤더를 입력한다:
 *        날짜 | 시작 | 종료 | 곡명 | 연습실 | 참여부원
 *      (연습실 열은 비어 있어도 됩니다. 여기에 sonsesangscheduler 에서
 *       내보낸 팀연습 TSV 를 2행부터 붙여넣습니다.)
 *   3) 확장 프로그램 → Apps Script 를 연다.
 *   4) 기본 코드를 모두 지우고 이 파일 내용 전체를 복사해 붙여넣는다.
 *   5) 저장 (Ctrl+S / ⌘+S).
 *   6) 프로젝트 설정(⚙) → 스크립트 속성 → "ADMIN_TOKEN" 속성 추가.
 *      (값 = 관리자 비밀번호. 코드에는 절대 적지 않는다.
 *       미설정 시 모든 예약 변경이 거부된다 — 안전한 기본값.)
 *   7) 배포(Deploy) → 새 배포(New deployment) → 유형: 웹 앱(Web app)
 *      - 실행 계정: 나(Me)
 *      - 액세스 권한: 모든 사용자(Anyone)
 *      → 배포. 처음 한 번 권한 승인 필요.
 *   8) 발급된 웹앱 URL 을 사이트의 .env 의 VITE_GANYEON_API_URL 에 넣는다.
 *   9) 이후 코드를 수정하면: 배포 → 배포 관리 → 기존 배포 편집 →
 *      새 버전(New version) 선택 → 배포. (URL 이 유지됨)
 *
 * 데이터 저장:
 *   - 연습일정 탭: 팀연습 행 (읽기 전용으로만 사용)
 *   - 갠연 예약: 시트가 아니라 PropertiesService(스크립트 속성)에 저장.
 *     booking key 형식: "M/D|hour|부원이름" (예: "8/1|13|김민재")
 *     예약의 저장 단위는 클릭한 1시간 칸 — 유효 구간은 클라이언트가
 *     렌더링/내보내기 시점에 항상 재계산한다.
 */

// ─────────────────────────────────────────────
// 공통
// ─────────────────────────────────────────────

var TEAM_SHEET_NAME = '연습일정';
var BOOKINGS_PROP_KEY = 'ganyeon_bookings_v1';

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getBookings_() {
  var raw = PropertiesService.getScriptProperties().getProperty(BOOKINGS_PROP_KEY);
  if (!raw) return [];
  try {
    var arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function setBookings_(arr) {
  PropertiesService.getScriptProperties()
    .setProperty(BOOKINGS_PROP_KEY, JSON.stringify(arr));
}

/**
 * 관리자 토큰 검증. 토큰은 스크립트 속성 ADMIN_TOKEN 에만 저장한다
 * (코드에 하드코딩 금지). ADMIN_TOKEN 이 설정되어 있지 않으면 항상 false
 * → 모든 변경 액션 거부 (안전한 기본값).
 */
function isAuthorized_(body) {
  var stored = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  if (!stored) return false;
  return typeof body.token === 'string' && body.token === stored;
}

// ─────────────────────────────────────────────
// GET — 연습일정 탭 + 예약 목록
// ─────────────────────────────────────────────

/**
 * doGet: { ok: true, teamRows: string[][], bookings: string[] }
 *
 * teamRows 는 연습일정 탭을 getDisplayValues() 로 읽은 "문자열 그대로" —
 * 날짜가 Date 객체나 시리얼 숫자로 변질되는 것을 원천 차단하기 위함.
 * 헤더 행 포함 여부와 무관하게 전부 반환하고, 클라이언트가 첫 셀 "날짜"
 * 행을 건너뛴다.
 */
function doGet() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(TEAM_SHEET_NAME);
    if (!sheet) {
      return jsonOut_({
        ok: false,
        error: '시트 "' + TEAM_SHEET_NAME + '" 을(를) 찾을 수 없습니다. 탭 이름을 확인해 주세요.',
      });
    }
    var teamRows = [];
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow >= 1 && lastCol >= 1) {
      // 참여부원까지 최소 6열을 항상 포함 (연습실 열이 비어 있어도 동작)
      teamRows = sheet.getRange(1, 1, lastRow, Math.max(lastCol, 6)).getDisplayValues();
    }
    return jsonOut_({
      ok: true,
      generatedAt: new Date().toISOString(),
      teamRows: teamRows,
      bookings: getBookings_(),
    });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

// ─────────────────────────────────────────────
// POST — 예약 추가/삭제 + 토큰 검증
// ─────────────────────────────────────────────

/**
 * doPost — body 는 Content-Type: text/plain 의 JSON (preflight 회피).
 *
 * actions:
 *   verify — 토큰 유효성만 확인. { ok:true } 또는 { ok:false, error:"unauthorized" }
 *   add    — booking key 추가 (중복 무시)
 *   remove — booking key 삭제
 *   list   — 현재 예약 목록 조회 (토큰 불필요)
 *
 * 모든 변경 액션(add/remove)은 서버에서 스크립트 속성 ADMIN_TOKEN 과 대조 —
 * 불일치·누락·ADMIN_TOKEN 미설정이면 { ok:false, error:"unauthorized" }.
 * 변경 응답에는 항상 최신 bookings 배열이 포함된다.
 *
 * 동시성 보호: PropertiesService 는 read-modify-write 가 원자적이지 않아서
 * 두 관리자가 거의 동시에 다른 칸을 클릭하면 한쪽 변경이 사라질 수 있다.
 * ScriptLock 으로 쓰기를 직렬화.
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  var acquired = false;
  try {
    var body = JSON.parse(e.postData.contents);

    // 토큰 확인 전용 — 예약 데이터를 건드리지 않으므로 락 없이 즉시 응답.
    if (body.action === 'verify') {
      return isAuthorized_(body)
        ? jsonOut_({ ok: true })
        : jsonOut_({ ok: false, error: 'unauthorized' });
    }

    if (body.action === 'list') {
      return jsonOut_({ ok: true, bookings: getBookings_() });
    }

    // 변경 액션은 관리자 토큰 필수. 락을 잡기 전에 거부해 불필요한 대기를 피한다.
    var isMutation = body.action === 'add' || body.action === 'remove';
    if (!isMutation) {
      return jsonOut_({ ok: false, error: 'unknown action: ' + body.action });
    }
    if (!isAuthorized_(body)) {
      return jsonOut_({ ok: false, error: 'unauthorized' });
    }
    if (typeof body.key !== 'string' || body.key === '') {
      return jsonOut_({ ok: false, error: 'key 가 없습니다' });
    }

    // 최대 5초까지 락 대기. 실패 시 throw → 아래 catch 에서 에러 응답.
    lock.waitLock(5000);
    acquired = true;

    var bookings = getBookings_();
    if (body.action === 'add') {
      if (bookings.indexOf(body.key) === -1) bookings.push(body.key);
      setBookings_(bookings);
    } else {
      bookings = bookings.filter(function (k) { return k !== body.key; });
      setBookings_(bookings);
    }
    return jsonOut_({ ok: true, bookings: bookings });
  } catch (err) {
    return jsonOut_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    if (acquired) lock.releaseLock();
  }
}
