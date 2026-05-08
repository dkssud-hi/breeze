// ── 거리 계산 유틸 (Haversine 공식) ──────────────────────

/**
 * 두 좌표 사이의 직선 거리를 킬로미터로 반환
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} km
 */
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const toRad = (deg) => (deg * Math.PI) / 180;

/**
 * 이벤트 배열을 사용자 위치 기준으로 거리 순 정렬
 * @param {Array} events   - lat, lot 필드를 가진 행사 배열
 * @param {number} userLat
 * @param {number} userLon
 * @returns {Array} distanceKm 필드가 추가된 배열 (오름차순)
 */
export function sortByDistance(events, userLat, userLon) {
  return events
    .map((e) => ({
      ...e,
      distanceKm: haversine(
        userLat,
        userLon,
        parseFloat(e.lat),
        parseFloat(e.lot)
      ),
    }))
    .filter((e) => !isNaN(e.distanceKm))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/**
 * km → 도보/지하철 예상 시간 문자열 (UI 표시용)
 */
export function formatDistance(km) {
  if (km < 0.5) return `도보 ${Math.round(km * 1000 / 67)}분`;
  if (km < 2)   return `도보 ${Math.round(km * 1000 / 67)}분`;
  return `약 ${km.toFixed(1)}km`;
}
