/** 客户端推荐/距离工具：让这个应用比 Google Maps 更懂"我"。 */

import { haversineKm } from "./geo";
import { getHomeAnchor } from "./config";
import type { RestaurantView } from "./types";

/** 给每家餐厅附加到某参考点的距离（公里）。无坐标的保持 undefined。 */
export function withDistanceFrom(
  list: RestaurantView[],
  center: { lat: number; lng: number },
): RestaurantView[] {
  return list.map((r) => {
    if (r.lat == null || r.lng == null) return r;
    return {
      ...r,
      distanceKm: haversineKm(center, { lat: r.lat, lng: r.lng }),
    };
  });
}

/** 到家(C)的距离——home 地区用。 */
export function withDistanceFromHome(list: RestaurantView[]): RestaurantView[] {
  const home = getHomeAnchor();
  return withDistanceFrom(list, { lat: home.lat, lng: home.lng });
}

/** 给每家餐厅附加到「我的实时位置」的距离（定位后用）。 */
export function withDistanceFromMe(
  list: RestaurantView[],
  me: { lat: number; lng: number },
): RestaurantView[] {
  return list.map((r) => {
    if (r.lat == null || r.lng == null) return r;
    return {
      ...r,
      distanceFromMeKm: haversineKm(me, { lat: r.lat, lng: r.lng }),
    };
  });
}

/**
 * 「帮我选」：从候选里挑一家。
 * 加权 = 评分越高、离家越近越可能被选中；已去过的降权（鼓励尝新）。
 * 用加权随机，所以每次点结果会变，但总体偏向"高分又顺路"的店。
 */
export function pickForMe(list: RestaurantView[]): RestaurantView | null {
  const pool = list.filter((r) => r.lat != null && r.lng != null);
  if (pool.length === 0) return null;

  const weighted = pool.map((r) => {
    const rating = r.rating ?? 4.3;
    const dist = r.distanceKm ?? 15;
    // 距离衰减：5km 内几乎不衰减，越远越低。
    const proximity = 1 / (1 + dist / 5);
    // 评分放大：4.3→约1，4.8→约2.7，指数拉开差距。
    const quality = Math.exp((rating - 4.3) * 2);
    const noveltyPenalty = r.visited ? 0.4 : 1;
    return { r, w: proximity * quality * noveltyPenalty };
  });

  const total = weighted.reduce((s, x) => s + x.w, 0);
  let roll = Math.random() * total;
  for (const { r, w } of weighted) {
    roll -= w;
    if (roll <= 0) return r;
  }
  return weighted[weighted.length - 1].r;
}
