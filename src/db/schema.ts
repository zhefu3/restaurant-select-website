/**
 * 数据库 schema（Drizzle + libSQL/Turso）。
 *
 * 本轮建 5 张表：config / restaurants / visits / xhs_captures / api_usage。
 * `visits` 结构与另一项目 Roadmarks 对齐，方便以后共享数据。
 * 其余模块（电竞/电影/…）的表以后再加，不在本轮。
 */

import { sql } from "drizzle-orm";
import {
  integer,
  real,
  sqliteTable,
  text,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/** 单用户偏好：锚点坐标、半径、网格间距、评分阈值等。key/value 存储便于扩展。 */
export const config = sqliteTable("config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(), // JSON 序列化
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * 地区：把餐厅按区域分桶，互不污染。
 * home = 你固定的南湾；city/point/route = 旅行时实时查出来的区域（缓存入库）。
 * 距离以 center 为参考点计算。
 */
export const regions = sqliteTable("regions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["home", "city", "point", "route"] })
    .notNull()
    .default("city"),
  centerLat: real("center_lat"),
  centerLng: real("center_lng"),
  meta: text("meta"), // JSON：查询参数（城市名/半径/起终点等），供刷新用
  refreshedAt: integer("refreshed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const restaurants = sqliteTable(
  "restaurants",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    placeId: text("place_id"), // Google place_id，xhs 未解析时可为空
    name: text("name").notNull(),
    cuisine: text("cuisine"),
    lat: real("lat"),
    lng: real("lng"),
    rating: real("rating"),
    reviewCount: integer("review_count"),
    priceLevel: integer("price_level"),
    source: text("source", { enum: ["google", "xhs", "manual", "travel"] }).notNull(),
    // 归属地区。null 视为 home（南湾），兼容旧数据。
    regionId: integer("region_id").references(() => regions.id, {
      onDelete: "set null",
    }),
    wantToEat: integer("want_to_eat", { mode: "boolean" })
      .notNull()
      .default(false),
    // 手动拉黑：从地图/列表隐藏，只在「黑名单」视图可见（可恢复）。
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
    inRegion: integer("in_region", { mode: "boolean" }).notNull().default(false),
    address: text("address"),
    addedAt: integer("added_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    placeIdIdx: uniqueIndex("restaurants_place_id_idx").on(t.placeId),
    regionIdx: index("restaurants_region_id_idx").on(t.regionId),
  }),
);

export const visits = sqliteTable(
  "visits",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    restaurantId: integer("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    rating: integer("rating"), // 1–5 星
    visitType: text("visit_type").notNull().default("吃过"),
    notes: text("notes"),
    visitedAt: integer("visited_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    restaurantIdx: index("visits_restaurant_id_idx").on(t.restaurantId),
  }),
);

export const xhsCaptures = sqliteTable("xhs_captures", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  restaurantId: integer("restaurant_id").references(() => restaurants.id, {
    onDelete: "set null",
  }),
  rawText: text("raw_text").notNull(),
  extractedName: text("extracted_name"),
  resolvedPlaceId: text("resolved_place_id"),
  // 提取时一并得到的「博主评价摘要」「推荐菜」「原帖链接」，确认时搬到店上。
  summary: text("summary"),
  dishesJson: text("dishes_json"), // JSON string[]
  sourceUrl: text("source_url"),
  status: text("status", { enum: ["pending", "resolved", "rejected"] })
    .notNull()
    .default("pending"),
  capturedAt: integer("captured_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * 某店的小红书笔记沉淀（一店一份，累积多帖）。
 * postsJson = [{ summary, dishes:string[], url:string|null, at:number }]，最新在前。
 */
export const restaurantXhs = sqliteTable("restaurant_xhs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  restaurantId: integer("restaurant_id")
    .notNull()
    .unique()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  postsJson: text("posts_json").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** 菜品级记录：某家店点过什么、值不值得再点。 */
export const dishes = sqliteTable(
  "dishes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    restaurantId: integer("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    visitId: integer("visit_id").references(() => visits.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    verdict: text("verdict", { enum: ["again", "ok", "never"] })
      .notNull()
      .default("ok"), // 值得再点 / 一般 / 避雷
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    dishRestaurantIdx: index("dishes_restaurant_id_idx").on(t.restaurantId),
  }),
);

/** 两两对决：Beli 式排位，比星级更能区分「都不错」的店。 */
export const duels = sqliteTable("duels", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  winnerId: integer("winner_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  loserId: integer("loser_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** 「推荐点菜」结果缓存：每家店只调一次 API，永久复用。 */
export const dishRecs = sqliteTable("dish_recs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  restaurantId: integer("restaurant_id")
    .notNull()
    .unique()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  dishesJson: text("dishes_json").notNull(), // [{name, mentions, quote}]
  source: text("source").notNull(), // reviews+xhs | claude_knowledge
  fetchedAt: integer("fetched_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** 餐厅菜单（AI 从照片/文字归纳+翻译，一店一份，最新覆盖）。 */
export const restaurantMenus = sqliteTable("restaurant_menus", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  restaurantId: integer("restaurant_id")
    .notNull()
    .unique()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  sectionsJson: text("sections_json").notNull(), // [{name, items:[{original,translated,price,note}]}]
  source: text("source").notNull(), // photo | text
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** 餐厅照片缓存（Google Places Photo，一店一份，抓过永久缓存不重复付费）。 */
export const restaurantPhotos = sqliteTable("restaurant_photos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  restaurantId: integer("restaurant_id")
    .notNull()
    .unique()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  data: text("data").notNull(), // base64
  contentType: text("content_type").notNull(),
  fetchedAt: integer("fetched_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** 我的文字点评（一店一份，可编辑）。 */
export const restaurantReviews = sqliteTable("restaurant_reviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  restaurantId: integer("restaurant_id")
    .notNull()
    .unique()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** 收藏夹/自定义清单（如「约会」「带爸妈」「深夜食堂」）。 */
export const lists = sqliteTable("lists", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  emoji: text("emoji"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** 清单 ↔ 餐厅（多对多：一家店可在多个清单）。 */
export const listItems = sqliteTable(
  "list_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    listId: integer("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    restaurantId: integer("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    addedAt: integer("added_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    uniq: uniqueIndex("list_items_uniq").on(t.listId, t.restaurantId),
  }),
);

/** 餐厅自定义标签（自由文本，如「有包厢」「停车方便」「排队久」）。 */
export const restaurantTags = sqliteTable(
  "restaurant_tags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    restaurantId: integer("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    uniq: uniqueIndex("restaurant_tags_uniq").on(t.restaurantId, t.tag),
  }),
);

export const apiUsage = sqliteTable(
  "api_usage",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    api: text("api").notNull(), // 例："google_places"
    month: text("month").notNull(), // "YYYY-MM"
    spend: real("spend").notNull().default(0),
    requestCount: integer("request_count").notNull().default(0),
  },
  (t) => ({
    apiMonthIdx: uniqueIndex("api_usage_api_month_idx").on(t.api, t.month),
  }),
);

/** 对话选餐 Agent 的一段会话。 */
export const conversations = sqliteTable("conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title"), // 取首条用户消息前几十字
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** 会话里的一条消息（recommendations 存 JSON，供重开时还原推荐卡）。 */
export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // "user" | "assistant"
    content: text("content").notNull(),
    recommendations: text("recommendations"), // JSON: RestaurantView[]（可空）
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    convIdx: index("chat_messages_conv_idx").on(t.conversationId),
  }),
);

export type Restaurant = typeof restaurants.$inferSelect;
export type NewRestaurant = typeof restaurants.$inferInsert;
export type Visit = typeof visits.$inferSelect;
export type XhsCapture = typeof xhsCaptures.$inferSelect;
export type Region = typeof regions.$inferSelect;
export type NewRegion = typeof regions.$inferInsert;
