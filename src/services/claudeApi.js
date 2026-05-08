// ── Claude API — AI 도슨트 스크립트 생성 ─────────────────
//
// ⚠️  API 키는 절대 프론트엔드에 노출하면 안 됩니다.
//     반드시 백엔드(Express / Next.js API Route)에서 호출하세요.
//
// 아래 코드는 두 가지 방식을 모두 제공합니다:
//   A) 백엔드 프록시 경유 (권장, /api/docent 엔드포인트)
//   B) 직접 호출 예시 (백엔드 코드 참고용, 프론트에서 사용 금지)

// ── A) 프론트엔드: 백엔드 프록시 호출 ───────────────────

/**
 * AI 도슨트 스크립트 생성 요청
 * @param {Object} params
 * @param {string} params.mood       - 사용자 기분 (예: '차분한')
 * @param {string[]} params.themes   - 선택한 테마 (예: ['전시', '공연'])
 * @param {Object}  params.event     - 행사 객체 (title, codename, place, date, is_free 등)
 * @param {string}  params.station   - 출발 역명
 * @param {number}  params.distanceKm - 직선 거리 (km)
 * @returns {Promise<string>} 도슨트 스크립트 텍스트
 */
export async function generateDocent({ mood, themes, event, station, distanceKm }) {
  const res = await fetch('/api/docent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mood, themes, event, station, distanceKm }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? '도슨트 생성 실패');
  }

  const data = await res.json();
  return data.docent ?? data.response; // string
}

// ── B) 백엔드 참고 코드 (Express / Next.js) ──────────────
//
// 아래 코드를 server/routes/docent.js 또는 pages/api/docent.js에 붙여 쓰세요.
//
// import Anthropic from '@anthropic-ai/sdk';
//
// const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
//
// export async function POST(req) {
//   const { mood, themes, event, station, distanceKm } = await req.json();
//
//   const prompt = buildDocentPrompt({ mood, themes, event, station, distanceKm });
//
//   const message = await client.messages.create({
//     model: 'claude-haiku-4-5-20251001',   // 빠르고 저렴한 모델로 충분
//     max_tokens: 300,
//     messages: [{ role: 'user', content: prompt }],
//   });
//
//   return Response.json({ docent: message.content[0].text });
// }

// ── 프롬프트 빌더 (프론트/백엔드 공용) ──────────────────

/**
 * 도슨트 스크립트 생성 프롬프트
 * 짧고 자연스러운 한국어 추천 문구 (3~4문장)를 요청합니다.
 */
export function buildDocentPrompt({ mood, themes, event, station, distanceKm }) {
  const feeInfo = event.is_free === '무료' ? '무료 행사' : `입장료 ${event.use_fee ?? ''}`;
  const distStr = distanceKm < 2
    ? `약 ${Math.round(distanceKm * 1000)}m`
    : `약 ${distanceKm.toFixed(1)}km`;

  return `당신은 서울 문화 큐레이터입니다. 아래 정보를 바탕으로 자연스럽고 따뜻한 한국어로 문화행사 추천 안내 문구를 3~4문장으로 작성하세요.

조건:
- 사용자 기분: ${mood}
- 현재 위치 역: ${station}
- 행사명: ${event.title}
- 장소: ${event.place} (${event.guname ?? ''})
- 분류: ${event.codename}
- 날짜: ${event.date ?? ''}
- 요금: ${feeInfo}
- 직선 거리: ${distStr}

요구사항:
- 사용자의 기분(${mood})과 연결되는 감성적인 첫 문장으로 시작
- 이동 정보(거리/교통)를 자연스럽게 포함
- 행사의 매력 포인트를 1~2문장으로 설명
- 친근하고 따뜻한 말투 (존댓말)
- 200자 이내

추천 문구:`;
}

// ── 기분/테마 → codename 매핑 (필터링용) ────────────────

import mapping from '../data/seoul_culture_mapping_llm.json';

/**
 * 사용자 선택 기분·테마에 맞는 codename 목록 반환
 * @param {string}   mood   - 예: '차분한'
 * @param {string[]} themes - 예: ['전시', '공연']
 * @returns {string[]} codename 배열
 */
export function getMatchingCodenames(mood, themes) {
  const isAll = themes.includes('all') || themes.length === 0;

  // 테마 → parent group → codenames
  const PARENT_MAP = {
    전시: ['전시/미술'],
    공연: ['뮤지컬/오페라', '클래식', '연극', '무용', '국악', '콘서트', '독주/독창회'],
    축제: ['축제-문화/예술', '축제-전통/역사', '축제-자연/경관', '축제-시민화합', '축제-관광/체육', '축제-기타'],
    영화: ['영화'],
    교육: ['교육/체험'],
  };

  const themeCodenames = isAll
    ? Object.keys(mapping)
    : themes.flatMap((t) => PARENT_MAP[t] ?? []);

  // 기분이 매핑에 있는 codename과 교집합
  const moodMatched = Object.entries(mapping)
    .filter(([, v]) => v.moods.includes(mood))
    .map(([k]) => k);

  // 교집합 (테마 필터 없으면 기분 기준만)
  const candidates = isAll
    ? moodMatched
    : themeCodenames.filter((c) => moodMatched.includes(c));

  // 교집합이 비면 테마 codenames 전체를 fallback
  return candidates.length > 0 ? candidates : themeCodenames;
}
