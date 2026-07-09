/**
 * 菜系标签与归类。
 *
 * Google Places 的原始类型有 80+ 种、且很碎（日料被拆成 japanese/sushi/ramen…），
 * 直接做筛选下拉会乱。策略：
 *   - 卡片/地图上显示**细分**标签（cuisineLabel，保留"拉面""台湾菜"这种精度）
 *   - 筛选下拉用**大类**（cuisineGroup，把 80+ 压成 ~16 个），干净可用
 */

const LABELS: Record<string, string> = {
  chinese_restaurant: "中餐",
  taiwanese_restaurant: "台湾菜",
  hot_pot_restaurant: "火锅",
  dumpling_restaurant: "饺子/点心",
  dim_sum_restaurant: "点心",
  cantonese_restaurant: "粤菜",
  sichuan_restaurant: "川菜",
  mongolian_barbecue_restaurant: "蒙古烤肉",
  japanese_restaurant: "日料",
  sushi_restaurant: "寿司",
  ramen_restaurant: "拉面",
  japanese_izakaya_restaurant: "居酒屋",
  korean_restaurant: "韩餐",
  korean_barbecue_restaurant: "韩式烤肉",
  thai_restaurant: "泰餐",
  vietnamese_restaurant: "越南菜",
  indonesian_restaurant: "印尼菜",
  filipino_restaurant: "菲律宾菜",
  burmese_restaurant: "缅甸菜",
  malaysian_restaurant: "马来西亚菜",
  singaporean_restaurant: "新加坡菜",
  asian_fusion_restaurant: "亚洲融合",
  indian_restaurant: "印度菜",
  south_indian_restaurant: "南印度菜",
  north_indian_restaurant: "北印度菜",
  pakistani_restaurant: "巴基斯坦菜",
  halal_restaurant: "清真",
  afghani_restaurant: "阿富汗菜",
  mexican_restaurant: "墨西哥菜",
  taco_restaurant: "塔可",
  latin_american_restaurant: "拉美菜",
  peruvian_restaurant: "秘鲁菜",
  colombian_restaurant: "哥伦比亚菜",
  brazilian_restaurant: "巴西菜",
  american_restaurant: "美式",
  hamburger_restaurant: "汉堡",
  barbecue_restaurant: "烧烤/BBQ",
  steak_house: "牛排",
  diner: "美式餐馆",
  californian_restaurant: "加州菜",
  chicken_restaurant: "炸鸡",
  hot_dog_restaurant: "热狗",
  cajun_restaurant: "卡真菜",
  hawaiian_restaurant: "夏威夷菜",
  bar_and_grill: "酒吧餐厅",
  soul_food_restaurant: "南方菜",
  italian_restaurant: "意餐",
  pizza_restaurant: "披萨",
  pizza_delivery: "披萨",
  french_restaurant: "法餐",
  spanish_restaurant: "西班牙菜",
  greek_restaurant: "希腊菜",
  portuguese_restaurant: "葡萄牙菜",
  german_restaurant: "德国菜",
  mediterranean_restaurant: "地中海菜",
  tapas_restaurant: "西班牙小食",
  bistro: "小酒馆",
  middle_eastern_restaurant: "中东菜",
  turkish_restaurant: "土耳其菜",
  persian_restaurant: "波斯菜",
  israeli_restaurant: "以色列菜",
  lebanese_restaurant: "黎巴嫩菜",
  ethiopian_restaurant: "埃塞俄比亚菜",
  seafood_restaurant: "海鲜",
  oyster_bar_restaurant: "生蚝吧",
  cafe: "咖啡馆",
  coffee_shop: "咖啡",
  bakery: "烘焙",
  dessert_restaurant: "甜点",
  donut_shop: "甜甜圈",
  bagel_shop: "贝果",
  ice_cream_shop: "冰淇淋",
  juice_shop: "果汁",
  tea_house: "茶饮",
  pastry_shop: "糕点",
  chocolate_shop: "巧克力",
  fast_food_restaurant: "快餐",
  sandwich_shop: "三明治",
  deli: "熟食",
  food_court: "美食广场",
  meal_takeaway: "外带",
  meal_delivery: "外送",
  breakfast_restaurant: "早餐",
  brunch_restaurant: "早午餐",
  cafeteria: "食堂",
  bar: "酒吧",
  cocktail_bar: "鸡尾酒吧",
  wine_bar: "红酒吧",
  sports_bar: "运动酒吧",
  brewery: "精酿",
  beer_garden: "啤酒花园",
  pub: "酒馆",
  vegetarian_restaurant: "素食",
  vegan_restaurant: "纯素",
  salad_restaurant: "沙拉",
  fine_dining_restaurant: "精致料理",
  restaurant: "餐厅",
  point_of_interest: "其他",
  food: "美食",
};

/** 大类 → 该类包含的原始类型。用于筛选下拉。 */
const GROUPS: Record<string, string[]> = {
  中餐: [
    "chinese_restaurant",
    "taiwanese_restaurant",
    "hot_pot_restaurant",
    "cantonese_restaurant",
    "sichuan_restaurant",
    "dumpling_restaurant",
    "dim_sum_restaurant",
    "mongolian_barbecue_restaurant",
    "asian_grocery_store",
  ],
  日料: [
    "japanese_restaurant",
    "sushi_restaurant",
    "ramen_restaurant",
    "japanese_izakaya_restaurant",
  ],
  韩餐: ["korean_restaurant", "korean_barbecue_restaurant"],
  东南亚: [
    "thai_restaurant",
    "vietnamese_restaurant",
    "indonesian_restaurant",
    "filipino_restaurant",
    "burmese_restaurant",
    "malaysian_restaurant",
    "singaporean_restaurant",
    "asian_fusion_restaurant",
  ],
  "南亚/印度": [
    "indian_restaurant",
    "south_indian_restaurant",
    "north_indian_restaurant",
    "pakistani_restaurant",
    "halal_restaurant",
  ],
  "墨西哥/拉美": [
    "mexican_restaurant",
    "taco_restaurant",
    "latin_american_restaurant",
    "peruvian_restaurant",
    "colombian_restaurant",
    "brazilian_restaurant",
  ],
  美式: [
    "american_restaurant",
    "hamburger_restaurant",
    "barbecue_restaurant",
    "steak_house",
    "diner",
    "californian_restaurant",
    "chicken_restaurant",
    "hot_dog_restaurant",
    "cajun_restaurant",
    "hawaiian_restaurant",
    "bar_and_grill",
    "soul_food_restaurant",
  ],
  "意/欧陆": [
    "italian_restaurant",
    "pizza_restaurant",
    "pizza_delivery",
    "french_restaurant",
    "spanish_restaurant",
    "greek_restaurant",
    "portuguese_restaurant",
    "german_restaurant",
    "mediterranean_restaurant",
    "tapas_restaurant",
    "bistro",
  ],
  中东: [
    "middle_eastern_restaurant",
    "turkish_restaurant",
    "persian_restaurant",
    "israeli_restaurant",
    "lebanese_restaurant",
    "ethiopian_restaurant",
    "afghani_restaurant",
  ],
  海鲜: ["seafood_restaurant", "oyster_bar_restaurant"],
  "咖啡/甜点/烘焙": [
    "cafe",
    "coffee_shop",
    "bakery",
    "dessert_restaurant",
    "donut_shop",
    "bagel_shop",
    "ice_cream_shop",
    "juice_shop",
    "tea_house",
    "pastry_shop",
    "chocolate_shop",
  ],
  "快餐/简餐": [
    "fast_food_restaurant",
    "sandwich_shop",
    "deli",
    "food_court",
    "meal_takeaway",
    "meal_delivery",
  ],
  "早餐/早午餐": ["breakfast_restaurant", "brunch_restaurant", "cafeteria"],
  酒吧: [
    "bar",
    "cocktail_bar",
    "wine_bar",
    "sports_bar",
    "brewery",
    "beer_garden",
    "pub",
  ],
  素食: ["vegetarian_restaurant", "vegan_restaurant", "salad_restaurant"],
};

const OTHER_GROUP = "其他";

// 反查表：原始类型 → 大类。
const TYPE_TO_GROUP: Record<string, string> = {};
for (const [group, types] of Object.entries(GROUPS)) {
  for (const t of types) TYPE_TO_GROUP[t] = group;
}

/** 原始类型 → 细分中文标签；未知退回英文美化。 */
export function cuisineLabel(raw: string | null): string {
  if (!raw) return "未分类";
  if (LABELS[raw]) return LABELS[raw];
  return raw
    .replace(/_restaurant$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** 原始类型 → 大类（用于筛选）。归不进任何大类的进「其他」。 */
export function cuisineGroup(raw: string | null): string {
  if (!raw) return OTHER_GROUP;
  return TYPE_TO_GROUP[raw] ?? OTHER_GROUP;
}

/** 大类 → emoji（地图 marker 与列表缩略图共用）。 */
export const GROUP_EMOJI: Record<string, string> = {
  中餐: "🥟",
  日料: "🍣",
  韩餐: "🍖",
  东南亚: "🍜",
  "南亚/印度": "🍛",
  "墨西哥/拉美": "🌮",
  美式: "🍔",
  "意/欧陆": "🍕",
  中东: "🥙",
  海鲜: "🦞",
  "咖啡/甜点/烘焙": "☕",
  "快餐/简餐": "🥪",
  "早餐/早午餐": "🍳",
  酒吧: "🍺",
  素食: "🥗",
  其他: "🍽️",
};

/** 大类 → 主题色（列表缩略图渐变用）。 */
export const GROUP_COLOR: Record<string, string> = {
  中餐: "#ef4444",
  日料: "#f43f5e",
  韩餐: "#f97316",
  东南亚: "#14b8a6",
  "南亚/印度": "#f59e0b",
  "墨西哥/拉美": "#84cc16",
  美式: "#3b82f6",
  "意/欧陆": "#10b981",
  中东: "#8b5cf6",
  海鲜: "#06b6d4",
  "咖啡/甜点/烘焙": "#a855f7",
  "快餐/简餐": "#64748b",
  "早餐/早午餐": "#fbbf24",
  酒吧: "#6366f1",
  素食: "#22c55e",
  其他: "#94a3b8",
};

/** 少数细分类型的专属 emoji（比大类默认更贴切）。 */
const EMOJI_OVERRIDE: Record<string, string> = {
  mediterranean_restaurant: "🥙",
  greek_restaurant: "🥙",
  ramen_restaurant: "🍜",
  sushi_restaurant: "🍣",
  steak_house: "🥩",
  barbecue_restaurant: "🍖",
  bakery: "🥐",
  dessert_restaurant: "🍰",
  ice_cream_shop: "🍦",
  pizza_restaurant: "🍕",
  taco_restaurant: "🌮",
  chicken_restaurant: "🍗",
  breakfast_restaurant: "🍳",
  vietnamese_restaurant: "🍜",
  thai_restaurant: "🍤",
};

/** 原始类型 → 缩略图 emoji（先看专属，再退回大类）。 */
export function cuisineEmoji(raw: string | null): string {
  if (raw && EMOJI_OVERRIDE[raw]) return EMOJI_OVERRIDE[raw];
  return GROUP_EMOJI[cuisineGroup(raw)] ?? "🍽️";
}

/** 原始类型 → 缩略图主题色。 */
export function cuisineColor(raw: string | null): string {
  return GROUP_COLOR[cuisineGroup(raw)] ?? "#94a3b8";
}

export interface CuisineOption {
  value: string; // 大类名
  label: string;
  count: number;
}

/** 从餐厅集合统计各大类数量，按数量降序；「其他」永远排最后。 */
export function collectCuisineGroups(
  list: { cuisine: string | null }[],
): CuisineOption[] {
  const counts = new Map<string, number>();
  for (const r of list) {
    const g = cuisineGroup(r.cuisine);
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => {
      if (a.value === OTHER_GROUP) return 1;
      if (b.value === OTHER_GROUP) return -1;
      return b.count - a.count;
    });
}
