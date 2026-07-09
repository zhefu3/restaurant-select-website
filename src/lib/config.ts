/**
 * Athroics 全局配置（单用户）。
 *
 * 本轮只用到餐厅相关字段；后续模块（CS2 / 电影 / 音乐剧 / 提醒 / 简报）
 * 的占位字段先留在这里，方便以后扩展而不改架构。
 *
 * 说明：这些是「默认值 / 代码内配置」。运行期偏好会 seed 进 `config` 表
 * （见 scripts/seed-config.ts），需要改锚点/阈值时改这里再重新 seed 即可。
 */

export interface Anchor {
  key: "A" | "B" | "C";
  label: string;
  lat: number;
  lng: number;
}

/** 三个搜索锚点。坐标为近似值，可按需微调。 */
export const ANCHORS: Anchor[] = [
  { key: "A", label: "斯坦福校园", lat: 37.4275, lng: -122.1697 },
  { key: "B", label: "圣何塞机场 (SJC)", lat: 37.3639, lng: -121.9289 },
  // 4344 Stone Canyon Dr, San Jose, CA 95136（近似坐标，可校准）
  { key: "C", label: "家", lat: 37.2505, lng: -121.8446 },
];

export const restaurantConfig = {
  /** 每个锚点圆的半径（公里）。区域 = △ABC ∪ 三个半径圆。 */
  anchorRadiusKm: 10,

  /** 网格采样间距（公里），Places Nearby 每个网格点撒一次网。 */
  gridSpacingKm: 2.5,

  /** 过滤阈值：低于任一项的餐厅不入库。(2026-07-08 放宽 4.3/300→4.0/100，纳入宝藏小店) */
  minRating: 4.0,
  minReviewCount: 100,

  /** Google Places Nearby 每次调用的搜索半径（米）。约等于网格半间距。 */
  nearbySearchRadiusMeters: 1800,
};

export const costConfig = {
  /** Google Places 月度花费硬熔断（美元）。 */
  googlePlacesMonthlyCapUsd: Number(
    process.env.GOOGLE_PLACES_MONTHLY_CAP_USD ?? 180,
  ),
  /** Anthropic（对话 Agent + 提取）月度软上限（美元）。 */
  anthropicMonthlyCapUsd: Number(process.env.ANTHROPIC_MONTHLY_CAP_USD ?? 20),
  /** 地图多边形圈选搜索的月度硬熔断（美元）。单独一条预算，防圈选烧钱。 */
  areaSearchMonthlyCapUsd: Number(process.env.AREA_SEARCH_MONTHLY_CAP_USD ?? 5),
};

// ── 后续模块占位（本轮不用）─────────────────────────────
export const futureModules = {
  briefing: {
    pushTimePT: null as string | null, // 例："10:00"
    telegramEnabled: false,
  },
  cs2: {
    trackedTeams: [] as string[], // 例：["Falcons", "Vitality", "Spirit"]
  },
  movies: { region: "US" },
  musicals: { city: "San Jose" },
};

export function getHomeAnchor(): Anchor {
  const home = ANCHORS.find((a) => a.key === "C");
  if (!home) throw new Error("Home anchor (C) not configured");
  return home;
}
