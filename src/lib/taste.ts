/**
 * 口味画像（纯客户端计算，零成本）。
 *
 * 从「去过 + 我的评分」学习：我给哪些菜系大类打分高。
 * 然后给每家没去过的店算「合口味指数」(0–100)，作为排序维度。
 * 数据越多越准；少于 3 条记录时不启用（样本太小没意义）。
 */

import { cuisineGroup } from "./cuisine";
import type { RestaurantView } from "./types";

export interface TasteProfile {
  /** 菜系大类 → 我的平均评分 */
  groupAvg: Map<string, number>;
  overallAvg: number;
  sampleSize: number;
}

const MIN_SAMPLES = 3;

export function buildTasteProfile(
  list: RestaurantView[],
): TasteProfile | null {
  const rated = list.filter((r) => r.visited && r.myRating != null);
  if (rated.length < MIN_SAMPLES) return null;

  const sums = new Map<string, { total: number; n: number }>();
  let total = 0;
  for (const r of rated) {
    const g = cuisineGroup(r.cuisine);
    const s = sums.get(g) ?? { total: 0, n: 0 };
    s.total += r.myRating!;
    s.n += 1;
    sums.set(g, s);
    total += r.myRating!;
  }

  const groupAvg = new Map<string, number>();
  for (const [g, s] of sums) groupAvg.set(g, s.total / s.n);

  return {
    groupAvg,
    overallAvg: total / rated.length,
    sampleSize: rated.length,
  };
}

/**
 * 合口味指数 0–100。
 * 基础 50 分；该菜系我打分高于我的平均 → 加分；Google 评分高 → 加分；离家近 → 微加。
 * 我的打分是 0–100 分制：菜系均分每高于总均分 1 分 → +1。
 */
export function tasteScore(
  r: RestaurantView,
  profile: TasteProfile,
): number {
  let score = 50;

  const g = cuisineGroup(r.cuisine);
  const avg = profile.groupAvg.get(g);
  if (avg != null) {
    score += avg - profile.overallAvg; // 100 分制差值直接用
  }

  if (r.rating != null) score += (r.rating - 4.5) * 30; // 4.3→-6, 4.8→+9
  if (r.distanceKm != null) score += Math.max(0, 8 - r.distanceKm) * 0.8;

  return Math.round(Math.min(100, Math.max(0, score)));
}

/** 给列表批量附加 tasteScore。profile 为 null 时原样返回。 */
export function withTasteScores(
  list: RestaurantView[],
  profile: TasteProfile | null,
): RestaurantView[] {
  if (!profile) return list;
  return list.map((r) => ({ ...r, tasteScore: tasteScore(r, profile) }));
}
