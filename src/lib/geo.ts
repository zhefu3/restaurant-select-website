/**
 * 几何 / 地理工具：区域判定与网格采样。
 *
 * 区域定义（见大纲四.A）：
 *   region = 三角形 △ABC(内部) ∪ (以 A/B/C 为圆心、半径 R 的三个圆)
 * 判定：点落在三角形内 或 距任一锚点 ≤ R km 即算「在区域内」。
 */

import { ANCHORS, restaurantConfig, type Anchor } from "./config";

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

/** Haversine 距离（公里）。 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * 点是否在三角形内（含边）。用重心/叉积符号法。
 * 在这个尺度（~几十公里）上把经纬度当平面处理，误差可忽略。
 */
export function pointInTriangle(p: LatLng, t: [LatLng, LatLng, LatLng]): boolean {
  const [a, b, c] = t;
  const sign = (p1: LatLng, p2: LatLng, p3: LatLng) =>
    (p1.lng - p3.lng) * (p2.lat - p3.lat) -
    (p2.lng - p3.lng) * (p1.lat - p3.lat);

  const d1 = sign(p, a, b);
  const d2 = sign(p, b, c);
  const d3 = sign(p, c, a);

  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  // 全同号（或含 0）即在三角形内部或边上。
  return !(hasNeg && hasPos);
}

/** 点是否在任意多边形内（射线法）。这个尺度上把经纬度当平面。 */
export function pointInPolygon(p: LatLng, poly: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lng;
    const yi = poly[i].lat;
    const xj = poly[j].lng;
    const yj = poly[j].lat;
    const intersect =
      yi > p.lat !== yj > p.lat &&
      p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** 多边形的外接圆（质心 + 到最远顶点的距离）。用于「一次 Nearby 覆盖整片」。 */
export function polygonBoundingCircle(poly: LatLng[]): {
  center: LatLng;
  radiusMeters: number;
} {
  const center = {
    lat: poly.reduce((s, p) => s + p.lat, 0) / poly.length,
    lng: poly.reduce((s, p) => s + p.lng, 0) / poly.length,
  };
  const radiusKm = Math.max(...poly.map((p) => haversineKm(center, p)));
  return { center, radiusMeters: radiusKm * 1000 };
}

function anchorLatLng(): [LatLng, LatLng, LatLng] {
  const byKey = (k: Anchor["key"]) => {
    const a = ANCHORS.find((x) => x.key === k);
    if (!a) throw new Error(`Anchor ${k} not configured`);
    return { lat: a.lat, lng: a.lng };
  };
  return [byKey("A"), byKey("B"), byKey("C")];
}

/** 点是否落在搜索区域内（三角形 ∪ 三个半径圆）。 */
export function isInRegion(
  p: LatLng,
  radiusKm: number = restaurantConfig.anchorRadiusKm,
): boolean {
  const tri = anchorLatLng();
  if (pointInTriangle(p, tri)) return true;
  return ANCHORS.some((a) => haversineKm(p, { lat: a.lat, lng: a.lng }) <= radiusKm);
}

/** 区域外接矩形（含锚点半径外扩），用于撒网格。 */
export function regionBoundingBox(
  radiusKm: number = restaurantConfig.anchorRadiusKm,
): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const lats = ANCHORS.map((a) => a.lat);
  const lngs = ANCHORS.map((a) => a.lng);

  // 纬度 1 度 ≈ 111 km；经度按中心纬度收缩。
  const latPad = radiusKm / 111;
  const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const lngPad = radiusKm / (111 * Math.cos((centerLat * Math.PI) / 180));

  return {
    minLat: Math.min(...lats) - latPad,
    maxLat: Math.max(...lats) + latPad,
    minLng: Math.min(...lngs) - lngPad,
    maxLng: Math.max(...lngs) + lngPad,
  };
}

/**
 * 在外接矩形上撒网格，只保留落在区域内的点。
 * 返回用于 Places Nearby 的采样点列表。
 */
export function regionGridPoints(
  spacingKm: number = restaurantConfig.gridSpacingKm,
  radiusKm: number = restaurantConfig.anchorRadiusKm,
): LatLng[] {
  const box = regionBoundingBox(radiusKm);
  const centerLat = (box.minLat + box.maxLat) / 2;

  const latStep = spacingKm / 111;
  const lngStep = spacingKm / (111 * Math.cos((centerLat * Math.PI) / 180));

  const points: LatLng[] = [];
  for (let lat = box.minLat; lat <= box.maxLat; lat += latStep) {
    for (let lng = box.minLng; lng <= box.maxLng; lng += lngStep) {
      const p = { lat, lng };
      if (isInRegion(p, radiusKm)) points.push(p);
    }
  }
  return points;
}
