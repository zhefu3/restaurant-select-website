/**
 * 「为你推荐」策展（借鉴 Beli 的 Recs / The Infatuation 的精选）。
 * 零成本、纯本地：把当前地区里「值得今天就去试」的店挑出来并给出上榜理由，
 * 把一条 986 行的平铺列表变成有引导的发现体验。
 */

import type { RestaurantView } from "./types";

export interface CuratedPick {
  r: RestaurantView;
  /** 上榜理由（展示在卡片角标）。 */
  reason: string;
  reasonKind: "want" | "xhs" | "taste" | "gem" | "near" | "top";
}

/** 单店打分：评分质量 × 距离邻近 × 各种个人信号加权。越高越靠前。 */
function scorePick(r: RestaurantView): number {
  const rating = r.rating ?? 4.2;
  const dist = r.distanceFromMeKm ?? r.distanceKm ?? 12;
  // 评分指数放大：4.2→~1，4.7→~2.7，把好店和普通店拉开。
  const quality = Math.exp((rating - 4.2) * 2);
  // 距离衰减：6km 内几乎不衰减，越远越低。
  const proximity = 1 / (1 + dist / 6);
  // 评论数可信度：评论越多越有把握（对数缓和，避免只偏向连锁）。
  const credibility = 1 + Math.log10(1 + (r.reviewCount ?? 0)) / 6;

  let boost = 1;
  if (r.wantToEat) boost *= 1.9; // 我明确想去的，优先
  if (r.hasXhsNote) boost *= 1.55; // 小红书种草过
  if (r.hasPhoto) boost *= 1.12; // 有真实照片，卡片更好看
  if (r.tasteScore != null) boost *= 0.7 + r.tasteScore / 100; // 合口味加权

  return quality * proximity * credibility * boost;
}

/** 给一家店选一个最有说服力的上榜理由。 */
function pickReason(r: RestaurantView): { reason: string; reasonKind: CuratedPick["reasonKind"] } {
  if (r.wantToEat) return { reason: "⭐ 你想去", reasonKind: "want" };
  if (r.hasXhsNote) return { reason: "📕 小红书种草", reasonKind: "xhs" };
  if (r.tasteScore != null && r.tasteScore >= 70)
    return { reason: `🎯 ${r.tasteScore} 合口味`, reasonKind: "taste" };
  if ((r.rating ?? 0) >= 4.6 && (r.reviewCount ?? 0) >= 400)
    return { reason: "💎 高分宝藏", reasonKind: "gem" };
  if ((r.distanceFromMeKm ?? r.distanceKm ?? 99) <= 3)
    return { reason: "📍 就在附近", reasonKind: "near" };
  return { reason: "🔥 值得一试", reasonKind: "top" };
}

/** 小巧的可复现随机数（mulberry32），用于「换一批」的确定性洗牌。 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 从候选里策展出 top N「为你推荐」。
 * 默认排除去过的（鼓励尝新）和评分过低的，保证是「新鲜好店」。
 * shuffle=0 时取分数最高的 N 家（稳定）；shuffle>0 时在高分候选池里按分数加权随机抽 N 家，
 * 用于「换一批」——每次换一批口味相近但不重样。
 */
export function curatePicks(
  list: RestaurantView[],
  limit = 8,
  shuffle = 0,
): CuratedPick[] {
  const scored = list
    .filter(
      (r) =>
        !r.visited &&
        r.lat != null &&
        r.lng != null &&
        // 有评分信号或明确想去的才进池，避免推没信息的空店
        ((r.rating ?? 0) >= 4.3 || r.wantToEat || r.hasXhsNote),
    )
    .map((r) => ({ r, s: scorePick(r) }))
    .sort((a, b) => b.s - a.s);

  let chosen: { r: RestaurantView }[];
  if (shuffle <= 0) {
    chosen = scored.slice(0, limit);
  } else {
    // 在 top(3N) 候选里按分数加权、不放回地抽 limit 家。
    const cand = scored.slice(0, Math.max(limit, limit * 3));
    const rand = rng(shuffle * 2654435761);
    const bag = cand.map((c) => ({ ...c }));
    chosen = [];
    while (chosen.length < limit && bag.length > 0) {
      const total = bag.reduce((sum, c) => sum + c.s, 0);
      let roll = rand() * total;
      let idx = 0;
      for (; idx < bag.length; idx++) {
        roll -= bag[idx].s;
        if (roll <= 0) break;
      }
      const picked = bag.splice(Math.min(idx, bag.length - 1), 1)[0];
      chosen.push(picked);
    }
  }
  return chosen.map(({ r }) => ({ r, ...pickReason(r) }));
}
