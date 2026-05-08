// ── useNearbyEvents — 핵심 데이터 훅 (Kakao API 없는 버전) ──
//
// 흐름:
//   1) GPS 좌표 → station_latlen.csv에서 가장 가까운 역 찾기
//   2) 서울시 문화행사 JSON API 호출
//   3) 기분·테마 기반 codename 필터링
//   4) 오늘 이후 행사만 유지
//   5) 사용자 GPS 좌표 ↔ 행사 lat/lot Haversine 거리 계산
//   6) 가까운 순으로 정렬, 상위 10개 반환

import { useState, useEffect, useCallback } from 'react';
import { fetchAllCulturalEvents, fetchSubwayArrival, getLineName } from '../services/seoulApi';
import { getMatchingCodenames } from '../services/claudeApi';
import { sortByDistance } from '../utils/geo';
import { findNearestStations, getStationCoords } from '../utils/stations';

const todayStr = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');

// ── useNearbyEvents ───────────────────────────────────────

/**
 * @param {Object} options
 * @param {number|null} options.lat     - 사용자 위도 (GPS)
 * @param {number|null} options.lon     - 사용자 경도 (GPS)
 * @param {string}      options.mood    - 선택 기분
 * @param {string[]}    options.themes  - 선택 테마 배열
 * @param {boolean}     options.enabled - true일 때 fetch 시작
 */
export function useNearbyEvents({ lat, lon, mood, themes, enabled = false }) {
  const [events,  setEvents]  = useState([]);
  const [station, setStation] = useState(null);  // 가장 가까운 역 정보
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    if (!enabled || lat == null || lon == null) return;

    setLoading(true);
    setError(null);

    try {
      // 1. CSV에서 가장 가까운 역 찾기 (API 호출 없음)
      const [nearest] = findNearestStations(lat, lon, 1);
      setStation(nearest ?? null);

      // 2. 기분·테마 → 매핑 JSON → codename 필터 목록
      const codenames = getMatchingCodenames(mood, themes);

      // 3. 서울시 문화행사 전체 조회
      const all = await fetchAllCulturalEvents();

      const TODAY = todayStr();

      // 4. 필터링
      const filtered = all.filter((e) => {
        // 종료일 파싱 (end_date = Unix ms 또는 date 문자열에서 추출)
        let endStr = '';
        if (e.end_date) {
          endStr = new Date(e.end_date).toISOString().slice(0, 10).replace(/-/g, '');
        } else if (e.date?.includes('~')) {
          endStr = e.date.split('~')[1].replace(/[^0-9]/g, '');
        }

        const notEnded  = !endStr || endStr >= TODAY;
        const matchCode = codenames.includes(e.codename);
        const hasCoord  = e.lat && e.lot;

        return notEnded && matchCode && hasCoord;
      });

      // 5. 거리 계산 + 정렬 + 상위 10개
      const sorted = sortByDistance(filtered, lat, lon).slice(0, 10);
      setEvents(sorted);

    } catch (err) {
      setError(err.message ?? '데이터를 불러오지 못했어요.');
    } finally {
      setLoading(false);
    }
  }, [enabled, lat, lon, mood, themes]);

  useEffect(() => { load(); }, [load]);

  return { events, station, loading, error, reload: load };
}

// ── useGeolocation ────────────────────────────────────────

/**
 * 브라우저 GPS로 현재 위치 반환
 */
export function useGeolocation() {
  const [coords,  setCoords]  = useState({ lat: null, lon: null });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setError('이 브라우저는 위치 정보를 지원하지 않아요. 역명을 직접 입력해 주세요.');
      return;
    }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLoading(false);
      },
      (err) => {
        const code = err?.code;
        let detail;
        if (code === 1) {
          detail = '위치 접근 권한이 거부되었어요. 브라우저 주소창의 자물쇠(🔒) 아이콘 → 위치 → 허용으로 바꾼 뒤 다시 시도해 주세요.';
        } else if (code === 2) {
          detail = 'OS 위치 서비스가 꺼져 있어요. macOS: 시스템 설정 → 개인정보 보호 및 보안 → 위치 서비스를 켜고 브라우저를 허용해 주세요.';
        } else if (code === 3) {
          detail = '위치 요청이 시간 초과됐어요. 다시 시도해 주세요.';
        } else {
          detail = '위치를 가져오지 못했어요. 역명을 직접 입력해 주세요.';
        }
        setError(detail);
        setLoading(false);
      },
      {
        enableHighAccuracy: true,  // 정확한 GPS 우선 (Wi-Fi 보조 측위 포함)
        timeout: 10_000,
        maximumAge: 30_000,
      }
    );
  }, []);

  return { ...coords, loading, error, request };
}

// ── useStationSearch ──────────────────────────────────────

/**
 * 역명 텍스트 입력 → CSV에서 좌표 반환 (API 없음)
 * @param {string} query
 * @returns {{ coords: {lat,lon} | null, stationInfo, error }}
 */
export function useStationSearch(query) {
  const [result, setResult] = useState(null);
  const [error,  setError]  = useState(null);

  const search = useCallback((name) => {
    const found = getStationCoords(name);
    if (!found) {
      setError(`'${name}' 역을 찾지 못했어요.`);
      setResult(null);
    } else {
      setError(null);
      setResult(found); // { name, lat, lon, line, lineName }
    }
  }, []);

  useEffect(() => {
    if (query?.trim()) search(query.trim());
  }, [query, search]);

  return { result, error, search };
}

// ── useSubwayArrival ──────────────────────────────────────

/**
 * 실시간 지하철 도착 정보 (30초 갱신)
 * @param {string|null} stationName
 */
export function useSubwayArrival(stationName) {
  const [arrivals, setArrivals] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    if (!stationName) return;

    const load = async () => {
      setLoading(true);
      try {
        const raw = await fetchSubwayArrival(stationName);
        setArrivals(raw.map((a) => ({ ...a, lineName: getLineName(Number(a.subwayId)) })));
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [stationName]);

  return { arrivals, loading, error };
}
