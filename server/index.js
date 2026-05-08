import express from 'express';
import 'dotenv/config';

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.PORT ?? 3002);

app.use((req, res, next) => {
  // eslint-disable-next-line no-console
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

function buildDocentPrompt({ mood, themes, event, station, distanceKm }) {
  const feeInfo = event?.is_free === '무료' ? '무료 행사' : `입장료 ${event?.use_fee ?? ''}`.trim();
  const distStr =
    typeof distanceKm === 'number' && distanceKm < 2
      ? `약 ${Math.round(distanceKm * 1000)}m`
      : typeof distanceKm === 'number'
        ? `약 ${distanceKm.toFixed(1)}km`
        : '';

  return `당신은 서울 문화 큐레이터입니다. 아래 정보를 바탕으로 자연스럽고 따뜻한 한국어로 문화행사 추천 안내 문구를 3~4문장으로 작성하세요.

조건:
- 사용자 기분: ${mood ?? ''}
- 현재 위치 역: ${station ?? ''}
- 행사명: ${event?.title ?? ''}
- 장소: ${event?.place ?? ''} (${event?.guname ?? ''})
- 분류: ${event?.codename ?? ''}
- 날짜: ${event?.date ?? ''}
- 요금: ${feeInfo}
- 직선 거리: ${distStr}

요구사항:
- 사용자의 기분(${mood ?? ''})과 연결되는 감성적인 첫 문장으로 시작
- 이동 정보(거리/교통)를 자연스럽게 포함
- 행사의 매력 포인트를 1~2문장으로 설명
- 친근하고 따뜻한 말투 (존댓말)
- 200자 이내

추천 문구:`;
}

function buildNearbyPrompt({ lat, lon, mood, category }) {
  return `당신은 서울 문화 큐레이터입니다. 아래 사용자 상황을 바탕으로, 지금 바로 갈 수 있는 문화 나들이를 안내하는 문장을 한국어로 1~2문장 작성하세요.

입력:
- 사용자 좌표: lat=${lat}, lon=${lon}
- 기분: ${mood ?? ''}
- 원하는 분류: ${category ?? ''}

요구사항:
- "지금 2호선 ○○역 1번 출구로 나가시면…" 처럼 자연스럽게 시작 (역명은 정확하지 않아도 됨)
- 사용자의 기분(${mood ?? ''})을 위로/전환하는 톤
- 120자 이내
- 과장/확신 금지(정확한 실시간 정보인 척 하지 않기)

응답:`;
}

function makeFallbackNearbyResponse({ mood, category }) {
  const m = mood ?? '지금';
  const c = category ?? '문화';
  return `지금 2호선 근처 역에서 내려 천천히 걸어보세요. ${m} 기분엔 ${c} 한 편이 잘 맞아요—가까운 전시/공연부터 가볍게 들러보면 좋아요.`;
}

async function generateWithGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, text: '', reason: 'missing_api_key' };

  const modelCandidates = ['gemini-3.1-flash-lite'];

  // eslint-disable-next-line no-console
  console.log('----- [gemini prompt] start -----');
  // eslint-disable-next-line no-console
  console.log(prompt);
  // eslint-disable-next-line no-console
  console.log('----- [gemini prompt] end -----');

  let lastReason = 'unknown_error';
  for (const model of modelCandidates) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 300,
          temperature: 0.7,
        },
      }),
    });

    if (!res.ok) {
      let message = `Gemini API 오류: ${res.status}`;
      try {
        const err = await res.json();
        message = err?.error?.message ?? message;
      } catch {
        // ignore parse errors
      }
      lastReason = `[${model}] ${message}`;
      // eslint-disable-next-line no-console
      console.error('[gemini] model failed:', model, message);
      continue;
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (text) {
      // eslint-disable-next-line no-console
      console.log('[gemini] model selected:', model);
      return { ok: true, text, reason: '' };
    }
    lastReason = `[${model}] empty_response`;
  }

  return { ok: false, text: '', reason: lastReason };
}

/*
// ===== 이전 Claude 방식 (되돌리기용) =====
import Anthropic from '@anthropic-ai/sdk';

async function generateWithClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, text: '' };

  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL ?? 'claude-3-5-haiku-latest';
  const message = await client.messages.create({
    model,
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message?.content?.[0]?.text ?? '';
  return { ok: Boolean(text), text };
}
*/

app.post('/api/docent', async (req, res) => {
  try {
    const body = req.body ?? {};

    // ✅ 신규 스펙 호환: { lat, lon, mood, category } → { response }
    if (body.lat != null && body.lon != null && body.category) {
      const { lat, lon, mood, category } = body;
      const prompt = buildNearbyPrompt({ lat, lon, mood, category });

      const { ok, text, reason } = await generateWithGemini(prompt);
      if (!ok) {
        // eslint-disable-next-line no-console
        console.error('[recommend/docent:new-spec] gemini failed:', reason);
      }
      const response = ok ? text : makeFallbackNearbyResponse({ mood, category });

      // 기존/신규 클라이언트 모두 호환되게 두 필드 모두 내려줌
      return res.status(200).json({ response, docent: response });
    }

    // 기존 프론트 호환: { mood, themes, event, station, distanceKm } → { docent }
    const { mood, themes, event, station, distanceKm } = body;
    const prompt = buildDocentPrompt({ mood, themes, event, station, distanceKm });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      const dist =
        typeof distanceKm === 'number'
          ? (distanceKm < 2 ? `${Math.round(distanceKm * 1000)}m` : `${distanceKm.toFixed(1)}km`)
          : '';
      const fallback = `${mood ?? '오늘'} 기분에 ${event?.codename ?? '문화'} 한 스푼 더해볼까요? ${station ? `${station}에서 ` : ''}${dist ? `${dist} 정도 ` : ''}가면 ${event?.title ?? '이 행사'}가 기다리고 있어요. ${event?.is_free === '무료' ? '무료라 부담 없이' : '일정만 맞으면'} 들러보세요.`;
      return res.status(200).json({ docent: fallback, response: fallback });
    }

    const { ok, text, reason } = await generateWithGemini(prompt);
    if (!ok) {
      // eslint-disable-next-line no-console
      console.error('[docent] gemini failed:', reason, {
        mood,
        station,
        eventTitle: event?.title,
      });
      return res.status(502).json({ message: '도슨트 응답이 비어있어요.' });
    }

    return res.json({ docent: text, response: text });
  } catch (e) {
    return res.status(500).json({ message: e?.message ?? '서버 오류' });
  }
});

// 신규 스펙 전용 엔드포인트 (요청/응답을 사용자 예시와 동일하게 맞춤)
app.post('/api/recommend', async (req, res) => {
  try {
    const { lat, lon, mood, category } = req.body ?? {};
    if (lat == null || lon == null || !category) {
      return res.status(400).json({ message: 'lat, lon, category가 필요해요.' });
    }

    const prompt = buildNearbyPrompt({ lat, lon, mood, category });
    const { ok, text, reason } = await generateWithGemini(prompt);
    if (!ok) {
      // eslint-disable-next-line no-console
      console.error('[recommend] gemini failed:', reason, { mood, category, lat, lon });
    }
    const response = ok ? text : makeFallbackNearbyResponse({ mood, category });

    return res.json({ response });
  } catch (e) {
    return res.status(500).json({ message: e?.message ?? '서버 오류' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[docent-server] listening on http://localhost:${PORT}`);
});

