/** 客户端 / 服务端共享的数据形状（不含服务端依赖，可被 client component import）。 */

export type RestaurantSource = "google" | "xhs" | "manual" | "travel";
export type VisitFilter = "all" | "want" | "visited";

/** 地图/列表用的餐厅视图对象（已并入访问信息）。 */
export interface RestaurantView {
  id: number;
  placeId: string | null;
  name: string;
  cuisine: string | null;
  lat: number | null;
  lng: number | null;
  rating: number | null; // Google 评分
  reviewCount: number | null;
  priceLevel: number | null;
  source: RestaurantSource;
  regionId: number | null;
  wantToEat: boolean;
  address: string | null;
  visited: boolean;
  myRating: number | null; // 我打的最高分（0–100 分制）
  hasXhsNote: boolean; // 是否有小红书笔记沉淀（卡片上给 📕 标记）
  hasPhoto: boolean; // 是否有缓存的餐厅照片（列表缩略图用真实照片）
  hidden: boolean; // 是否被手动拉黑（黑名单）
  listIds?: number[]; // 所属收藏夹/清单 id（个人层，客户端筛选用）
  tags?: string[]; // 自定义标签（个人层，客户端筛选用）
  addedAt?: string | Date; // 入库时间（最近添加排序用）
  distanceKm?: number; // 到家(C)的距离，客户端计算后附加
  distanceFromMeKm?: number; // 到「我的实时位置」的距离（定位后附加）
  tasteScore?: number; // 合口味指数 0–100，客户端由口味画像计算
}

/** 一条小红书笔记对这家店的沉淀（博主评价摘要 + 推荐菜 + 原帖链接）。 */
export interface XhsPost {
  summary: string | null; // 博主怎么评这家店
  dishes: string[]; // 帖子里点名的推荐菜
  url: string | null; // 原帖链接（贴链接时才有）
  at: number; // 收藏时间戳（unix 秒）
}

/** ≥80 分 = 我的推荐 → 地图上金色高亮。 */
export function isRecommended(r: RestaurantView): boolean {
  return r.visited && (r.myRating ?? 0) >= 80;
}

/** ≤40 分默认在地图上隐藏（踩雷店）。 */
export function isLowRated(r: RestaurantView): boolean {
  return r.visited && r.myRating != null && r.myRating <= 40;
}

/**
 * 生成跳转 Google Maps 的链接（官方 Maps URLs API）。
 * 有 place_id 就用它直达那家店的信息页；否则退回按名字+地址搜索。
 */
export function googleMapsUrl(r: RestaurantView): string {
  const base = "https://www.google.com/maps/search/?api=1";
  const query = encodeURIComponent(
    [r.name, r.address].filter(Boolean).join(" "),
  );
  if (r.placeId) return `${base}&query=${query}&query_place_id=${r.placeId}`;
  return `${base}&query=${query}`;
}
