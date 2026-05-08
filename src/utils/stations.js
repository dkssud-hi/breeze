// ── 지하철역 로컬 데이터 유틸 ────────────────────────────
// Kakao API 없이 station_latlen.csv 기반으로 동작

import STATIONS from '../data/stations.json';
import { haversine } from './geo';

const LINE_NAME = {
  1: '1호선', 2: '2호선', 3: '3호선', 4: '4호선',
  5: '5호선', 6: '6호선', 7: '7호선', 8: '8호선', 9: '9호선',
};

export const getLineName = (no) => LINE_NAME[no] ?? `${no}호선`;

/**
 * GPS 좌표에서 가장 가까운 역 반환
 * 환승역(같은 이름 여러 호선)은 가장 가까운 1개만 반환
 *
 * @param {number} lat
 * @param {number} lon
 * @param {number} topN - 반환할 역 개수 (기본 1)
 * @returns {Array<{name, lat, lon, line, lineName, distanceM}>}
 */
export function findNearestStations(lat, lon, topN = 1) {
  // 각 역까지 거리 계산
  const withDist = STATIONS.map((s) => ({
    ...s,
    lineName: getLineName(s.line),
    distanceM: Math.round(haversine(lat, lon, s.lat, s.lon) * 1000),
  }));

  // 거리 오름차순 정렬
  withDist.sort((a, b) => a.distanceM - b.distanceM);

  // 환승역 중복 제거: 같은 역명은 가장 가까운 것 하나만 유지
  const seen = new Set();
  const unique = [];
  for (const s of withDist) {
    const key = s.name;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(s);
    }
    if (unique.length >= topN) break;
  }

  return unique;
}

/**
 * 역명 텍스트로 역 검색 (부분 일치, 거리 정보 없음)
 * @param {string} query - 예: '홍대', '강남역'
 * @returns {Array}
 */
export function searchStationByName(query) {
  const q = query.replace(/역$/, '').trim(); // '역' 접미사 제거
  return STATIONS.filter((s) =>
    s.name.replace(/역$/, '').includes(q)
  );
}

/**
 * 역명으로 첫 번째 매칭 역의 좌표 반환
 * @returns {{ name, lat, lon, line, lineName } | null}
 */
export function getStationCoords(name) {
  const q = name.replace(/역$/, '').trim();
  const found = STATIONS.find((s) => s.name.replace(/역$/, '') === q)
    ?? STATIONS.find((s) => s.name.replace(/역$/, '').includes(q));
  if (!found) return null;
  return { ...found, lineName: getLineName(found.line) };
}

export { STATIONS };
