/**
 * 一次性区域发现（populate，非 cron）。
 *
 * 流程（大纲四.A）：
 *   1. 区域外接矩形撒网格 → 只留区域内的网格点。
 *   2. 每点调 Google Places Nearby(type=restaurant)。
 *   3. 过滤 rating≥4.3 且 reviews≥300；按 reviews×rating 排序。
 *   4. 按 place_id 去重，写入 restaurants(source=google)。
 *
 * 结果入库缓存；重复的 place_id 用 onConflictDoUpdate 刷新评分，不重复插入。
 * 成本由 google-places → api-usage 熔断兜底（$180 硬上限）。
 */

import { db } from "@/db";
import { restaurants } from "@/db/schema";
import { regionGridPoints, isInRegion } from "@/lib/geo";
import { restaurantConfig } from "@/lib/config";
import {
  nearbyRestaurants,
  isRealRestaurant,
  type PlaceResult,
} from "@/lib/google-places";
import { CostCapExceededError } from "@/lib/api-usage";

export interface DiscoverReport {
  gridPoints: number;
  rawResults: number;
  uniquePlaces: number;
  passedFilter: number;
  inserted: number;
  capHit: boolean;
}

export interface DiscoverOptions {
  /** 只跑前 N 个网格点（调试/省钱用）。 */
  limitPoints?: number;
  /** 进度回调。 */
  onProgress?: (done: number, total: number) => void;
}

export async function discoverRestaurants(
  opts: DiscoverOptions = {},
): Promise<DiscoverReport> {
  const { minRating, minReviewCount, nearbySearchRadiusMeters } =
    restaurantConfig;

  let points = regionGridPoints();
  if (opts.limitPoints) points = points.slice(0, opts.limitPoints);

  const byPlaceId = new Map<string, PlaceResult>();
  let rawResults = 0;
  let capHit = false;

  for (let i = 0; i < points.length; i++) {
    try {
      const results = await nearbyRestaurants(points[i], nearbySearchRadiusMeters);
      rawResults += results.length;
      for (const r of results) {
        if (r.placeId) byPlaceId.set(r.placeId, r); // 去重
      }
    } catch (err) {
      if (err instanceof CostCapExceededError) {
        console.warn(`\n⚠️  ${err.message}\n提前停止发现，已收集的结果照常入库。`);
        capHit = true;
        break;
      }
      throw err;
    }
    opts.onProgress?.(i + 1, points.length);
  }

  const unique = [...byPlaceId.values()];

  // 过滤：真餐厅（排除商场/影院等）+ 达标 + 落在区域内。
  const passed = unique.filter((r) => {
    if (!isRealRestaurant(r)) return false;
    if (r.rating == null || r.reviewCount == null) return false;
    if (r.rating < minRating) return false;
    if (r.reviewCount < minReviewCount) return false;
    return isInRegion({ lat: r.lat, lng: r.lng });
  });

  // 复合分排序（reviews × rating）。
  passed.sort(
    (a, b) => b.reviewCount! * b.rating! - a.reviewCount! * a.rating!,
  );

  let inserted = 0;
  for (const r of passed) {
    const res = await db
      .insert(restaurants)
      .values({
        placeId: r.placeId,
        name: r.name,
        cuisine: r.cuisine,
        lat: r.lat,
        lng: r.lng,
        rating: r.rating,
        reviewCount: r.reviewCount,
        priceLevel: r.priceLevel,
        source: "google",
        inRegion: true,
        address: r.address,
      })
      .onConflictDoUpdate({
        target: restaurants.placeId,
        set: {
          rating: r.rating,
          reviewCount: r.reviewCount,
          priceLevel: r.priceLevel,
          address: r.address,
        },
      });
    inserted += res.rowsAffected ?? 0;
  }

  return {
    gridPoints: points.length,
    rawResults,
    uniquePlaces: unique.length,
    passedFilter: passed.length,
    inserted,
    capHit,
  };
}
