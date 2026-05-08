// ===== 틈새 나들이 — App.jsx =====
// 의존성: React 18+
// index.html <head>에 아이콘 폰트 추가 필요:
// <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css" />

import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { useGeolocation, useNearbyEvents, useStationSearch } from './hooks/useNearbyEvents';
import { formatDistance } from './utils/geo';
import { generateDocent } from './services/claudeApi';

// ── 데이터 상수 ──────────────────────────────────────────

const MOODS = [
  { id: 'm1', value: '차분한',      label: '차분하게 쉬고 싶어',      sub: '전시 · 클래식 · 국악',    icon: 'ti-leaf'  },
  { id: 'm2', value: '활기찬',      label: '활기차게 즐기고 싶어',     sub: '콘서트 · 축제 · 뮤지컬',  icon: 'ti-flame' },
  { id: 'm3', value: '감성적인',    label: '감성에 젖고 싶어',         sub: '연극 · 무용 · 영화',      icon: 'ti-heart' },
  { id: 'm4', value: '호기심 있는', label: '색다른 걸 해보고 싶어',    sub: '교육 · 체험 · 전통',      icon: 'ti-bulb'  },
];

const THEMES = [
  { id: 't1', value: '전시',  label: '전시/미술',  icon: 'ti-palette'     },
  { id: 't2', value: '공연',  label: '공연',       icon: 'ti-music'       },
  { id: 't3', value: '축제',  label: '축제',       icon: 'ti-star'        },
  { id: 't4', value: '영화',  label: '영화',       icon: 'ti-movie'       },
  { id: 't5', value: '교육',  label: '교육/체험',  icon: 'ti-school'      },
  { id: 't6', value: 'all',   label: '상관없어요', icon: 'ti-layout-grid' },
];

const guessIcon = (codename) => {
  const c = String(codename ?? '');
  if (c.includes('전시')) return 'ti-palette';
  if (c.includes('축제')) return 'ti-star';
  if (c.includes('영화')) return 'ti-movie';
  if (c.includes('교육') || c.includes('체험')) return 'ti-school';
  if (c.includes('클래식') || c.includes('국악') || c.includes('콘서트') || c.includes('독주') || c.includes('뮤지컬') || c.includes('오페라') || c.includes('연극') || c.includes('무용')) {
    return 'ti-music';
  }
  return 'ti-calendar-event';
};

const getEventKey = (e) => e?.cultcode ?? e?.id ?? `${e?.title ?? ''}|${e?.place ?? ''}|${e?.date ?? ''}`;
const WIZARD_STATE_KEY = 'seoul-outing-wizard-state-v1';
const SCREEN_TO_PATH = {
  1: '/start',
  2: '/mood',
  3: '/theme',
  4: '/location',
  5: '/result',
  6: '/detail',
};
const PATH_TO_SCREEN = Object.fromEntries(
  Object.entries(SCREEN_TO_PATH).map(([k, v]) => [v, Number(k)])
);

const getScreenFromPath = () => {
  const path = window.location.pathname || '';
  return PATH_TO_SCREEN[path] ?? null;
};

const buildUrlForScreen = (screen) =>
  `${SCREEN_TO_PATH[screen] ?? SCREEN_TO_PATH[1]}${window.location.search}`;

const getInitialWizardState = () => {
  try {
    const raw = window.sessionStorage.getItem(WIZARD_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      screen: Number(parsed?.screen) || 1,
      selectedMood: parsed?.selectedMood ?? null,
      selectedThemes: Array.isArray(parsed?.selectedThemes) ? parsed.selectedThemes : [],
      selectedEvent: parsed?.selectedEvent ?? null,
      stationQuery: parsed?.stationQuery ?? '',
      userCoords: {
        lat: parsed?.userCoords?.lat ?? null,
        lon: parsed?.userCoords?.lon ?? null,
      },
      stationLabel: parsed?.stationLabel ?? '',
    };
  } catch {
    return null;
  }
};

// ── 공통 컴포넌트 ─────────────────────────────────────────

const Icon = ({ name, className = '', style = {} }) => (
  <i className={`ti ${name} ${className}`} aria-hidden="true" style={style} />
);

const TopBar = () => (
  <header className="top-bar">
    <div className="top-bar-inner">
      <span className="top-bar-logo">
        <Icon name="ti-map-pin" style={{ verticalAlign: '-3px', marginRight: 6 }} />
        서울 틈새 나들이
      </span>
    </div>
  </header>
);

const BackButton = ({ onClick, label = '이전' }) => (
  <button className="btn-back" onClick={onClick}>
    <Icon name="ti-arrow-left" /> {label}
  </button>
);

const ProgressBar = ({ current, total = 3 }) => (
  <div className="progress-bar" aria-label={`${total}단계 중 ${current}단계`}>
    {Array.from({ length: total }, (_, i) => (
      <div key={i} className={`progress-dot ${i < current ? 'active' : ''}`} />
    ))}
  </div>
);

const Tag = ({ label, variant = 'green' }) => (
  <span className={`tag tag-${variant}`}>{label}</span>
);

const resolveEventImageUrl = (src) => {
  const raw = String(src ?? '').trim();
  if (!raw) return '';
  const httpsUrl = raw.replace(/^http:\/\//i, 'https://');

  try {
    const parsed = new URL(httpsUrl);
    // 개발 환경에서는 외부 이미지 서버를 프록시로 우회해서 차단 이슈를 줄인다.
    if (import.meta.env.DEV && parsed.hostname === 'culture.seoul.go.kr') {
      return `/culture-image${parsed.pathname}${parsed.search}`;
    }
  } catch {
    // URL 파싱 실패 시 원본 값 사용
  }

  return httpsUrl;
};

const EventImage = ({ src, alt, fallbackIcon, large = false }) => {
  const [failed, setFailed] = useState(false);

  const url = resolveEventImageUrl(src);
  const shouldShowImg = Boolean(url) && !failed;

  useEffect(() => {
    setFailed(false);
  }, [url]);

  return (
    <div className={`event-img ${large ? 'large' : ''}`}>
      {shouldShowImg ? (
        <img
          src={url}
          alt={alt ?? ''}
          loading="lazy"
          decoding="async"
          onLoad={() => setFailed(false)}
          onError={() => setFailed(true)}
        />
      ) : (
        <Icon name={fallbackIcon} style={large ? { fontSize: 38 } : {}} />
      )}
    </div>
  );
};

// ── 화면 컴포넌트 ─────────────────────────────────────────

/** 화면 1: 랜딩 */
const LandingScreen = ({ onNext }) => (
  <div className="gap-col gap-18" style={{ paddingTop: '1.5rem' }}>
    <div className="hero-icon" aria-hidden="true">
      <Icon name="ti-map-pin" />
    </div>

    <div>
      <p className="accent-label">서울 틈새 나들이</p>
      <h1 className="hero-title">
        지금 이 순간,<br />당신의 틈새를 채워드려요
      </h1>
      <p className="hero-desc">
        바쁜 일상 속 짧은 여유 — 실시간 지하철과 서울 문화행사를 연결해
        지금 바로 갈 수 있는 문화 휴식을 찾아드립니다.
      </p>
    </div>

    <div className="hero-chips">
      <span><Icon name="ti-train" style={{ verticalAlign: '-2px', marginRight: 3 }} />실시간 지하철</span>
      <span><Icon name="ti-calendar-event" style={{ verticalAlign: '-2px', marginRight: 3 }} />3,924개 행사</span>
      <span><Icon name="ti-sparkles" style={{ verticalAlign: '-2px', marginRight: 3 }} />AI 추천</span>
    </div>

    <button className="btn-primary" onClick={onNext} style={{ marginTop: 4 }}>
      시작하기 <Icon name="ti-arrow-right" />
    </button>
  </div>
);

/** 화면 2: 기분 선택 */
const MoodScreen = ({ selectedMood, onSelectMood, onNext, onBack }) => (
  <div className="gap-col gap-18">
    <div className="mt-pt">
      <BackButton onClick={onBack} label="처음으로" />
    </div>

    <div>
      <ProgressBar current={1} />
      <p className="step-label">1 / 3</p>
      <h2 className="screen-title">지금 기분이 어때요?</h2>
    </div>

    <div className="mood-grid" role="group" aria-label="기분 선택">
      {MOODS.map(({ id, value, label, sub, icon }) => (
        <button
          key={id}
          className={`mood-card ${selectedMood === value ? 'selected' : ''}`}
          onClick={() => onSelectMood(value)}
        >
          <Icon name={icon} className="mood-card-icon" />
          <p className="mood-card-label">{label}</p>
          <p className="mood-card-sub">{sub}</p>
        </button>
      ))}
    </div>

    <button className="btn-primary" onClick={onNext} disabled={!selectedMood}>
      다음 <Icon name="ti-arrow-right" />
    </button>
  </div>
);

/** 화면 3: 테마 선택 */
const ThemeScreen = ({ selectedThemes, onToggleTheme, onNext, onBack }) => (
  <div className="gap-col gap-18">
    <div className="mt-pt">
      <BackButton onClick={onBack} />
    </div>

    <div>
      <ProgressBar current={2} />
      <p className="step-label">2 / 3</p>
      <h2 className="screen-title">어떤 행사가 좋아요?</h2>
      <p style={{ fontSize: 12, color: '#aaa', marginTop: 3 }}>여러 개 골라도 돼요</p>
    </div>

    <div className="theme-pills" role="group" aria-label="테마 선택">
      {THEMES.map(({ id, value, label, icon }) => (
        <button
          key={id}
          className={`theme-pill ${selectedThemes.includes(value) ? 'selected' : ''}`}
          onClick={() => onToggleTheme(value)}
        >
          <Icon name={icon} />
          {label}
        </button>
      ))}
    </div>

    <button className="btn-primary" onClick={onNext} disabled={selectedThemes.length === 0}>
      다음 <Icon name="ti-arrow-right" />
    </button>
  </div>
);

/** 화면 4: 위치 확인 */
const LocationScreen = ({
  stationQuery,
  onSelectGps,
  onSelectStation,
  onBack,
  geoLoading,
  geoError,
  stationError,
}) => {
  const [station, setStation] = useState('');

  useEffect(() => {
    setStation(stationQuery ?? '');
  }, [stationQuery]);

  return (
    <div className="gap-col gap-18">
      <div className="mt-pt">
        <BackButton onClick={onBack} />
      </div>

      <div>
        <ProgressBar current={3} />
        <p className="step-label">3 / 3</p>
        <h2 className="screen-title">지금 어디 계세요?</h2>
        <p style={{ fontSize: 12, color: '#aaa', marginTop: 3 }}>가까운 지하철역 기준으로 찾아드려요</p>
      </div>

      <div className="gap-col gap-10">
        <div
          className={`loc-row${geoLoading ? ' loading' : ''}`}
          onClick={!geoLoading ? onSelectGps : undefined}
          role="button"
          tabIndex={0}
          aria-busy={geoLoading}
          onKeyDown={(e) => !geoLoading && e.key === 'Enter' && onSelectGps()}
        >
          <div className="loc-icon">
            {geoLoading
              ? <Icon name="ti-loader-2" className="spin" />
              : <Icon name="ti-gps" />
            }
          </div>
          <div style={{ flex: 1 }}>
            <p className="loc-title">현재 위치 사용하기</p>
            <p className="loc-sub">
              {geoLoading ? 'GPS로 위치 확인 중…' : 'GPS로 가장 가까운 역을 찾아요'}
            </p>
          </div>
          {!geoLoading && <Icon name="ti-chevron-right" style={{ color: '#bbb', fontSize: 18 }} />}
        </div>

        {geoError && (
          <div className="geo-error-box">
            <Icon name="ti-alert-circle" style={{ flexShrink: 0, marginTop: 1 }} />
            <p>{geoError}</p>
          </div>
        )}

        <hr className="divider" />
        <p style={{ fontSize: 12, color: '#aaa', textAlign: 'center' }}>또는 역명 직접 입력</p>

        <div className="station-row">
          <input
            type="text"
            placeholder="예) 홍대입구, 강남"
            value={station}
            onChange={(e) => setStation(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && station && onSelectStation(station)}
          />
          <button
            className="btn-primary"
            style={{ width: 'auto', padding: '0 16px', fontSize: 13 }}
            onClick={() => onSelectStation(station)}
            disabled={!station}
          >
            검색
          </button>
        </div>
        {stationError && (
          <p style={{ fontSize: 12, color: '#ffb4b4', marginTop: 6, textAlign: 'center' }}>
            {stationError}
          </p>
        )}
      </div>
    </div>
  );
};

/** 화면 5: 추천 결과 */
const ResultScreen = ({ mood, themes, events, stationLabel, loading, error, onSelectEvent, onReset, onBack }) => (
  <div className="gap-col gap-18">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 }}>
      <BackButton onClick={onBack} />
      <button className="btn-back" onClick={onReset}>다시 선택</button>
    </div>

    <div>
      <p style={{ fontSize: 12, color: '#aaa', marginBottom: 5 }}>
        <Icon name="ti-map-pin" style={{ verticalAlign: '-2px' }} /> {stationLabel ? `${stationLabel} 기준` : '내 주변 기준'}
      </p>
      <h2 className="screen-title" style={{ marginBottom: 8 }}>지금 바로 갈 수 있어요</h2>
      <div className="result-tags">
        {mood && <Tag label={mood} />}
        {themes[0] && <Tag label={themes[0] === 'all' ? '전체' : themes[0]} />}
      </div>
    </div>

    <div className="event-list">
      {loading && (
        <p style={{ fontSize: 13, color: '#aaa', textAlign: 'center', padding: '10px 0' }}>
          추천을 만들고 있어요…
        </p>
      )}
      {error && (
        <p style={{ fontSize: 13, color: '#ffb4b4', textAlign: 'center', padding: '10px 0' }}>
          {error}
        </p>
      )}
      {!loading && !error && (!events || events.length === 0) && (
        <p style={{ fontSize: 13, color: '#aaa', textAlign: 'center', padding: '10px 0' }}>
          조건에 맞는 행사를 찾지 못했어요. 테마를 ‘상관없어요’로 바꾸거나 다른 위치로 시도해 보세요.
        </p>
      )}
      {(events ?? []).map((event) => {
        const icon = event.icon ?? guessIcon(event.codename);
        const feeLabel = event.is_free === '무료' ? '무료' : (event.use_fee ?? '유료');
        const distLabel = typeof event.distanceKm === 'number' ? formatDistance(event.distanceKm) : null;
        return (
          <div key={getEventKey(event)} className="event-card" onClick={() => onSelectEvent({ ...event, icon })}>
            <EventImage
              src={event.main_img}
              alt={event.title}
              fallbackIcon={icon}
            />
            <div className="event-body">
              <div className="event-tags">
                <Tag label={event.codename} />
                <Tag label={feeLabel} variant="neutral" />
              </div>
              <p className="event-title">{event.title}</p>
              <p className="event-meta">
                <Icon name="ti-train" />
                {distLabel ? `${distLabel} · ` : ''}
                {event.place}
              </p>
              <p className="event-date">{event.date} · {event.guname}</p>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

/** 화면 6: 행사 상세 + AI 도슨트 */
const DetailScreen = ({ event, mood, themes, stationLabel, onBack }) => {
  const [docent, setDocent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!event) return;
      setLoading(true);
      setError(null);
      try {
        const text = await generateDocent({
          mood,
          themes,
          event,
          station: stationLabel ?? '',
          distanceKm: event.distanceKm ?? 0,
        });
        if (!cancelled) setDocent(text);
      } catch (e) {
        if (!cancelled) setError(e?.message ?? '도슨트를 불러오지 못했어요.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [event, mood, stationLabel, themes]);

  const feeLabel = event?.is_free === '무료' ? '무료' : (event?.use_fee ?? '유료');

  return (
    <div className="gap-col gap-18">
    <div className="mt-pt">
      <BackButton onClick={onBack} label="목록으로" />
    </div>

    <EventImage
      src={event?.main_img}
      alt={event?.title}
      fallbackIcon={event?.icon ?? guessIcon(event?.codename)}
      large
    />

    <div>
      <div className="event-tags" style={{ marginBottom: 8 }}>
        <Tag label={event.codename} />
        <Tag label={feeLabel} variant="neutral" />
      </div>
      <h2 style={{ fontSize: 17, fontWeight: 500, lineHeight: 1.4, marginBottom: 10 }}>
        {event.title}
      </h2>
      <div className="detail-info">
        <p><Icon name="ti-map-pin" style={{ verticalAlign: '-2px' }} /> {event.place}</p>
        <p><Icon name="ti-calendar" style={{ verticalAlign: '-2px' }} /> {event.date}</p>
        <p>
          <Icon name="ti-train" style={{ verticalAlign: '-2px' }} /> {stationLabel ? `${stationLabel} → ` : ''}
          {event.guname}
          {typeof event.distanceKm === 'number' ? ` · ${formatDistance(event.distanceKm)}` : ''}
        </p>
      </div>
    </div>

    <hr className="divider" />

    <div className="docent-box">
      <p className="docent-label">
        <Icon name="ti-sparkles" style={{ fontSize: 13 }} /> AI 도슨트
      </p>
      <p className="docent-text">
        {loading && '도슨트가 설명을 준비 중이에요…'}
        {!loading && error && `(${error})`}
        {!loading && !error && (docent || '도슨트 문구를 생성하지 못했어요.')}
      </p>
    </div>

    <div className="gap-col gap-8" style={{ paddingBottom: 4 }}>
      <button className="btn-primary" onClick={() => window.open(event.hmpg_addr, '_blank')}>
        문화포털에서 자세히 보기 <Icon name="ti-external-link" />
      </button>
      <button className="btn-ghost" onClick={onBack}>
        다른 행사 보기
      </button>
    </div>
    </div>
  );
};

// ── 메인 앱 ───────────────────────────────────────────────

export default function App() {
  const initialState = useMemo(() => getInitialWizardState(), []);
  const initialScreenFromPath = useMemo(() => getScreenFromPath(), []);
  const isRootEntry = useMemo(() => window.location.pathname === '/', []);
  const hasPushedInitialHistory = useRef(false);
  const isNavigatingHistory = useRef(false);
  const suppressLocationAutoAdvance = useRef(false);
  const [screen, setScreen]               = useState(
    isRootEntry ? 1 : (initialScreenFromPath ?? initialState?.screen ?? 1)
  );
  const [selectedMood, setSelectedMood]   = useState(initialState?.selectedMood ?? null);
  const [selectedThemes, setSelectedThemes] = useState(initialState?.selectedThemes ?? []);
  const [selectedEvent, setSelectedEvent] = useState(initialState?.selectedEvent ?? null);
  const [stationQuery, setStationQuery] = useState(initialState?.stationQuery ?? '');
  const [userCoords, setUserCoords] = useState(initialState?.userCoords ?? { lat: null, lon: null });
  const [stationLabel, setStationLabel] = useState(initialState?.stationLabel ?? '');

  const geo = useGeolocation();
  const stationSearch = useStationSearch(stationQuery);

  const { events, station, loading, error } = useNearbyEvents({
    lat: userCoords.lat,
    lon: userCoords.lon,
    mood: selectedMood,
    themes: selectedThemes,
    enabled: screen === 5 && Boolean(selectedMood) && selectedThemes.length > 0 && userCoords.lat != null && userCoords.lon != null,
  });

  useEffect(() => {
    if (station?.name) setStationLabel(station.name);
  }, [station]);

  useEffect(() => {
    window.sessionStorage.setItem(WIZARD_STATE_KEY, JSON.stringify({
      screen,
      selectedMood,
      selectedThemes,
      selectedEvent,
      stationQuery,
      userCoords,
      stationLabel,
    }));
  }, [screen, selectedMood, selectedThemes, selectedEvent, stationQuery, userCoords, stationLabel]);

  useEffect(() => {
    // 새로고침 후에도 현재 단계가 유지되도록 현재 화면 정보를 history state에 반영
    if (isRootEntry) {
      setScreen(1);
    }
    window.history.replaceState({ screen }, '', buildUrlForScreen(screen));
  }, []);

  useEffect(() => {
    const onPopState = (e) => {
      const nextScreen = Number(e.state?.screen) || getScreenFromPath();
      if (Number.isFinite(nextScreen) && nextScreen >= 1 && nextScreen <= 6) {
        isNavigatingHistory.current = true;
        // 뒤로/앞으로로 location 화면에 도착한 경우, 자동으로 result로 재점프하지 않도록 잠시 막는다.
        suppressLocationAutoAdvance.current = nextScreen === 4;
        setScreen(nextScreen);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!hasPushedInitialHistory.current) {
      hasPushedInitialHistory.current = true;
      return;
    }
    if (isNavigatingHistory.current) {
      isNavigatingHistory.current = false;
      return;
    }
    window.history.pushState({ screen }, '', buildUrlForScreen(screen));
  }, [screen]);

  const goBack = () => window.history.back();

  const resolvedStationError = useMemo(() => {
    return stationQuery?.trim() ? (stationSearch.error ?? null) : null;
  }, [stationQuery, stationSearch.error]);

  const handleToggleTheme = (value) => {
    if (value === 'all') {
      setSelectedThemes(['all']);
      return;
    }
    setSelectedThemes((prev) => {
      const without = prev.filter((v) => v !== 'all');
      return without.includes(value)
        ? without.filter((v) => v !== value)
        : [...without, value];
    });
  };

  const handleReset = () => {
    setSelectedMood(null);
    setSelectedThemes([]);
    setSelectedEvent(null);
    setUserCoords({ lat: null, lon: null });
    setStationLabel('');
    setStationQuery('');
    setScreen(2);
  };

  const handleSelectGps = () => {
    suppressLocationAutoAdvance.current = false;
    // 기존 역 검색 상태가 남아 있으면 GPS보다 먼저 자동 전환될 수 있어 초기화한다.
    setStationQuery('');
    setStationLabel('');
    geo.request();
  };

  useEffect(() => {
    if (screen !== 4) return;
    if (suppressLocationAutoAdvance.current) return;
    if (geo.lat == null || geo.lon == null) return;
    setUserCoords({ lat: geo.lat, lon: geo.lon });
    setStationLabel('');
    setScreen(5);
  }, [geo.lat, geo.lon, screen]);

  const handleSelectStation = (name) => {
    const q = String(name ?? '').trim();
    suppressLocationAutoAdvance.current = false;
    setStationQuery(q);
    if (q) setStationLabel(q.endsWith('역') ? q : `${q}역`);
  };

  useEffect(() => {
    if (screen !== 4) return;
    if (suppressLocationAutoAdvance.current) return;
    if (!stationQuery?.trim()) return;
    if (!stationSearch.result) return;
    setUserCoords({ lat: stationSearch.result.lat, lon: stationSearch.result.lon });
    setStationLabel(`${stationSearch.result.name}${stationSearch.result.name?.endsWith('역') ? '' : '역'}`);
    setScreen(5);
  }, [screen, stationQuery, stationSearch.result]);

  const renderScreen = () => {
    switch (screen) {
      case 1: return <LandingScreen onNext={() => setScreen(2)} />;
      case 2: return (
        <MoodScreen
          selectedMood={selectedMood}
          onSelectMood={setSelectedMood}
          onNext={() => setScreen(3)}
          onBack={goBack}
        />
      );
      case 3: return (
        <ThemeScreen
          selectedThemes={selectedThemes}
          onToggleTheme={handleToggleTheme}
          onNext={() => setScreen(4)}
          onBack={goBack}
        />
      );
      case 4: return (
        <LocationScreen
          stationQuery={stationQuery}
          onSelectGps={handleSelectGps}
          onSelectStation={handleSelectStation}
          onBack={goBack}
          geoLoading={geo.loading}
          geoError={geo.error}
          stationError={resolvedStationError}
        />
      );
      case 5: return (
        <ResultScreen
          mood={selectedMood}
          themes={selectedThemes}
          events={events}
          stationLabel={stationLabel || (station?.name ? `${station.name}${station.name?.endsWith('역') ? '' : '역'}` : '')}
          loading={loading}
          error={error}
          onSelectEvent={(event) => { setSelectedEvent(event); setScreen(6); }}
          onReset={handleReset}
          onBack={goBack}
        />
      );
      case 6: return (
        <DetailScreen
          event={selectedEvent}
          mood={selectedMood}
          themes={selectedThemes}
          stationLabel={stationLabel || (station?.name ? `${station.name}${station.name?.endsWith('역') ? '' : '역'}` : '')}
          onBack={goBack}
        />
      );
      default: return null;
    }
  };

  return (
    <div className="page">
      <TopBar />
      <main className="app-inner">
        {renderScreen()}
      </main>
    </div>
  );
}
