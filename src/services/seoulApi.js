// ── 서울 열린데이터광장 API ───────────────────────────────
//
// ⚠️  Seoul API는 HTTP만 지원 → 브라우저에서 직접 호출 시 CORS/Mixed Content 오류 발생
// 해결책: vite.config.js proxy 설정 (개발 환경)
//
// vite.config.js:
//   '/seoul-api': { target: 'http://openapi.seoul.go.kr:8088', changeOrigin: true, rewrite: p => p.replace(/^\/seoul-api/, '') }
//   '/subway-api': { target: 'http://swopenAPI.seoul.go.kr', changeOrigin: true, rewrite: p => p.replace(/^\/subway-api/, '') }

const SEOUL_KEY  = import.meta.env.VITE_SEOUL_API_KEY;
const SUBWAY_KEY = import.meta.env.VITE_SUBWAY_API_KEY;

const LOCAL_JSON_PATH = '/events.json'; // public/ 폴더 기준

function normalizeEvent(e) {
  if (!e || typeof e !== 'object') return e;
  return {
    ...e,
    // 이미지 필드 (서울 API는 MAIN_IMG, 로컬은 main_img)
    main_img: e.main_img ?? e.MAIN_IMG ?? e.mainImg ?? e.mainImage ?? '',
  };
}

// ── 문화행사 전체 조회 ────────────────────────────────────
// API 키가 없으면 public/events.json 로컬 파일 사용

export async function fetchAllCulturalEvents() {
  if (!SEOUL_KEY) {
    const res = await fetch(LOCAL_JSON_PATH);
    if (!res.ok) throw new Error('로컬 JSON을 찾을 수 없어요. public/events.json을 확인하세요.');
    const json = await res.json();
    // 서울시 JSON 구조: { DATA: [...] } 또는 { culturalEventInfo: { row: [...] } }
    const rows = json.DATA ?? json?.culturalEventInfo?.row ?? [];
    return rows.map(normalizeEvent);
  }

  // API 키가 있으면 실제 API 호출 (페이지네이션)
  const PAGE_SIZE = 1000;
  const first = await _fetchPage({ start: 1, end: PAGE_SIZE });
  const total = first.total;
  let all = [...first.events].map(normalizeEvent);

  const pages = Math.ceil(total / PAGE_SIZE);
  for (let p = 2; p <= pages; p++) {
    const { events } = await _fetchPage({
      start: (p - 1) * PAGE_SIZE + 1,
      end: p * PAGE_SIZE,
    });
    all = all.concat(events.map(normalizeEvent));
  }
  return all;
}

async function _fetchPage({ start = 1, end = 1000, codename = '' } = {}) {
  const path = codename
    ? `/${SEOUL_KEY}/json/culturalEventInfo/${start}/${end}/${encodeURIComponent(codename)}/`
    : `/${SEOUL_KEY}/json/culturalEventInfo/${start}/${end}/`;

  const res = await fetch(`/seoul-api${path}`);
  if (!res.ok) throw new Error(`Seoul API 오류: ${res.status}`);

  const json = await res.json();
  const info = json.culturalEventInfo;
  if (info.RESULT.CODE !== 'INFO-000') {
    throw new Error(`Seoul API: ${info.RESULT.MESSAGE}`);
  }
  return { total: info.list_total_count, events: info.row };
}

// ── 지하철 실시간 도착 정보 ───────────────────────────────

/**
 * @param {string} stationName - 예: '홍대입구'
 * @returns {Promise<Array>}
 */
export async function fetchSubwayArrival(stationName) {
  if (!SUBWAY_KEY) {
    // 키가 없으면 실시간 기능은 비활성화 (앱은 계속 동작)
    return [];
  }
  const res = await fetch(
    `/subway-api/api/subway/${SUBWAY_KEY}/json/realtimeStationArrival/0/10/${encodeURIComponent(stationName)}`
  );
  if (!res.ok) throw new Error(`지하철 API 오류: ${res.status}`);

  const json = await res.json();
  if (json.errorMessage?.status !== 200) {
    throw new Error(`지하철 API: ${json.errorMessage?.message ?? '알 수 없는 오류'}`);
  }
  return json.realtimeArrivalList ?? [];
}

// ── 호선 이름 변환 ────────────────────────────────────────

const LINE_MAP = {
  1001: '1호선', 1002: '2호선', 1003: '3호선', 1004: '4호선',
  1005: '5호선', 1006: '6호선', 1007: '7호선', 1008: '8호선',
  1009: '9호선', 1061: '공항철도', 1063: '경의중앙선', 1065: '경춘선',
  1067: '경강선', 1075: '수인분당선', 1077: '신분당선',
};

export const getLineName = (subwayId) => LINE_MAP[subwayId] ?? `${subwayId}`;
