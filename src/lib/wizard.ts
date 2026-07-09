/**
 * 「今晚吃什么」向导（纯客户端）。
 * 三个问题 → 确定性打分 → 3 家候选 + 每家的推荐理由。
 * 与「帮我选」的区别：这里是有意图的（用户表达了场合/口味/距离），结果确定不随机。
 */

import { cuisineGroup } from "./cuisine";
import type { RestaurantView } from "./types";

export type Vibe = "light" | "hearty" | "soup" | "any";
export type Party = "solo" | "date" | "group";

export interface WizardAnswers {
  vibe: Vibe;
  party: Party;
  maxKm: number; // 5 | 15 | 50
}

export const VIBE_OPTIONS: { value: Vibe; label: string }[] = [
  { value: "light", label: "清爽点 🥗" },
  { value: "hearty", label: "硬菜！🥩" },
  { value: "soup", label: "热汤热面 🍜" },
  { value: "any", label: "随便，看着办" },
];

export const PARTY_OPTIONS: { value: Party; label: string }[] = [
  { value: "solo", label: "就我一个 🧍" },
  { value: "date", label: "两个人 💑" },
  { value: "group", label: "一群人 👯" },
];

export const DISTANCE_OPTIONS: { value: number; label: string }[] = [
  { value: 5, label: "附近就好 (≤5km)" },
  { value: 15, label: "可以开车 (≤15km)" },
  { value: 50, label: "多远都行" },
];

/** 各口味倾向加权的菜系大类。 */
const VIBE_GROUPS: Record<Vibe, string[]> = {
  light: ["日料", "东南亚", "素食", "海鲜", "地中海菜"],
  hearty: ["美式", "墨西哥/拉美", "南亚/印度", "中东", "韩餐"],
  soup: ["日料", "中餐", "东南亚"],
  any: [],
};

const PARTY_GROUPS: Record<Party, string[]> = {
  solo: ["日料", "快餐/简餐", "东南亚", "咖啡/甜点/烘焙"],
  date: ["意/欧陆", "日料", "海鲜"],
  group: ["中餐", "韩餐", "美式", "墨西哥/拉美"],
};

export interface WizardPick {
  restaurant: RestaurantView;
  reasons: string[];
}

export function wizardPick(
  list: RestaurantView[],
  ans: WizardAnswers,
): WizardPick[] {
  let pool = list.filter(
    (r) =>
      r.lat != null &&
      r.lng != null &&
      r.distanceKm != null &&
      r.distanceKm <= ans.maxKm,
  );
  // 范围内太少就放宽一档，别让向导空手而归。
  if (pool.length < 3) {
    pool = list.filter(
      (r) => r.distanceKm != null && r.distanceKm <= ans.maxKm * 2,
    );
  }

  const scored = pool.map((r) => {
    const g = cuisineGroup(r.cuisine);
    const reasons: string[] = [];
    let score = 0;

    // 质量
    if (r.rating != null) {
      score += (r.rating - 4.3) * 40;
      if (r.rating >= 4.6) reasons.push(`⭐${r.rating} 高分`);
    }
    // 距离（越近越好，按用户容忍度归一）
    if (r.distanceKm != null) {
      score += (1 - r.distanceKm / ans.maxKm) * 15;
      if (r.distanceKm <= 3) reasons.push(`离家仅 ${r.distanceKm.toFixed(1)}km`);
    }
    // 口味匹配
    if (VIBE_GROUPS[ans.vibe].includes(g)) {
      score += 25;
      reasons.push("正合你想吃的类型");
    }
    // 场合匹配
    if (PARTY_GROUPS[ans.party].includes(g)) {
      score += 12;
      if (ans.party === "group") reasons.push("适合一群人");
      if (ans.party === "date") reasons.push("适合两个人");
    }
    // 尝新：没去过加分；想去吃清单大加分
    if (!r.visited) {
      score += 10;
      if (r.wantToEat) {
        score += 20;
        reasons.push("在你的「想去吃」清单里");
      } else {
        reasons.push("你还没去过");
      }
    } else if (r.myRating != null && r.myRating >= 80) {
      score += 8;
      reasons.push(`你上次打了 ${r.myRating} 分`);
    }
    // 合口味指数
    if (r.tasteScore != null && r.tasteScore >= 65) {
      score += (r.tasteScore - 50) / 2;
      reasons.push("合你口味");
    }

    return { restaurant: r, reasons, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ restaurant, reasons }) => ({
      restaurant,
      reasons: reasons.slice(0, 3),
    }));
}
