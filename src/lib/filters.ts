/** 客户端筛选：搜索、城市、价格、距离、隐藏连锁。全部基于已加载数据，零 API 成本。 */

import { cuisineGroup, cuisineLabel } from "./cuisine";
import type { RestaurantView } from "./types";

export interface ClientFilters {
  search: string;
  cuisines: string[]; // 选中的菜系大类名；空 = 全部菜系（多选）
  city: string; // "all" 或城市名
  prices: number[]; // 选中的价位(1-4)；空 = 不限
  maxDistanceKm: number | null; // null = 不限
  hideChains: boolean;
  list: number | null; // 个人层：只看某收藏夹/清单
  tag: string | null; // 个人层：只看带某标签的
  mood: string | null; // 场景：约会/聚餐/一人食…（启发式）
}

export const emptyClientFilters: ClientFilters = {
  search: "",
  cuisines: [],
  city: "all",
  prices: [],
  maxDistanceKm: null,
  hideChains: false,
  list: null,
  tag: null,
  mood: null,
};

/** 「适合场景」预设（借鉴 The Infatuation 的 perfect-for，启发式映射，零成本）。 */
export const MOODS: { key: string; emoji: string; label: string }[] = [
  { key: "date", emoji: "💕", label: "约会" },
  { key: "group", emoji: "👨‍👩‍👧", label: "聚餐" },
  { key: "solo", emoji: "🧍", label: "一人食" },
  { key: "family", emoji: "👵", label: "带爸妈" },
  { key: "gem", emoji: "💎", label: "高分宝藏" },
  { key: "cheap", emoji: "💰", label: "便宜大碗" },
];

/** 某店是否符合某场景（用菜系大类 + 价位 + 评分 + 评论数启发式判断）。 */
export function matchesMood(r: RestaurantView, mood: string): boolean {
  const g = cuisineGroup(r.cuisine);
  const rating = r.rating ?? 0;
  const price = r.priceLevel;
  const reviews = r.reviewCount ?? 0;
  switch (mood) {
    case "date":
      return (
        rating >= 4.5 &&
        (price ?? 0) >= 2 &&
        ["日料", "意/欧陆", "海鲜", "美式", "中东"].includes(g)
      );
    case "group":
      return ["中餐", "韩餐", "东南亚", "美式"].includes(g);
    case "solo":
      return (
        ["快餐/简餐", "日料", "咖啡/甜点/烘焙"].includes(g) &&
        (price == null || price <= 2)
      );
    case "family":
      return ["中餐", "海鲜", "南亚/印度"].includes(g) && rating >= 4.4;
    case "gem":
      return rating >= 4.6 && reviews > 0 && reviews < 800;
    case "cheap":
      return price != null && price <= 1 && rating >= 4.3;
    default:
      return true;
  }
}

/** 从地址解析城市。地址形如 "377 Santana Row #1090, San Jose, CA 95128, USA"。 */
export function extractCity(address: string | null): string | null {
  if (!address) return null;
  const m = address.match(/,\s*([^,]+),\s*[A-Z]{2}\s*\d{5}/);
  return m ? m[1].trim() : null;
}

export interface CityOption {
  value: string;
  count: number;
}

/** 统计出现的城市，按数量降序。 */
export function collectCities(list: RestaurantView[]): CityOption[] {
  const counts = new Map<string, number>();
  for (const r of list) {
    const c = extractCity(r.address);
    if (!c) continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

/** 名字出现 ≥ threshold 次的判定为连锁店。 */
export function detectChains(
  list: RestaurantView[],
  threshold = 3,
): Set<string> {
  const counts = new Map<string, number>();
  for (const r of list) counts.set(r.name, (counts.get(r.name) ?? 0) + 1);
  return new Set(
    [...counts.entries()].filter(([, c]) => c >= threshold).map(([n]) => n),
  );
}

/** 应用全部客户端筛选（不排序）。 */
export function applyClientFilters(
  list: RestaurantView[],
  f: ClientFilters,
  chains: Set<string>,
): RestaurantView[] {
  const q = f.search.trim().toLowerCase();
  return list.filter((r) => {
    if (q) {
      // 搜索匹配店名 + 地址 + 菜系标签（大类和细分），所以搜「拉面」「火锅」也能命中。
      const hay = `${r.name} ${r.address ?? ""} ${cuisineLabel(r.cuisine)} ${cuisineGroup(r.cuisine)}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (
      f.cuisines &&
      f.cuisines.length > 0 &&
      !f.cuisines.includes(cuisineGroup(r.cuisine))
    ) {
      return false;
    }
    if (f.city !== "all" && extractCity(r.address) !== f.city) return false;
    if (f.prices.length > 0) {
      if (r.priceLevel == null || !f.prices.includes(r.priceLevel)) return false;
    }
    if (f.maxDistanceKm != null) {
      if (r.distanceKm == null || r.distanceKm > f.maxDistanceKm) return false;
    }
    if (f.hideChains && chains.has(r.name)) return false;
    if (f.list != null && !(r.listIds ?? []).includes(f.list)) return false;
    if (f.tag != null && !(r.tags ?? []).includes(f.tag)) return false;
    if (f.mood != null && !matchesMood(r, f.mood)) return false;
    return true;
  });
}
