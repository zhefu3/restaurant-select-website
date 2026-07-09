/** 服务端：餐厅查询（并入访问信息）+ 小红书解析入库。 */

import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  restaurants,
  restaurantXhs,
  restaurantPhotos,
  visits,
  xhsCaptures,
} from "@/db/schema";
import {
  extractRestaurants,
  extractRestaurantsFromImage,
  type ExtractedRestaurant,
  type ImageMediaType,
} from "./anthropic";
import {
  searchPlaceByText,
  isRealRestaurant,
  type PlaceResult,
} from "./google-places";
import { findXhsUrl, fetchXhsContent } from "./xhs-fetch";
import { getListMembershipMap, getTagsMap } from "./lists";
import { getHomeAnchor } from "./config";
import type {
  RestaurantSource,
  RestaurantView,
  VisitFilter,
  XhsPost,
} from "./types";

export interface ListFilters {
  visit?: VisitFilter; // all | want | visited
  source?: RestaurantSource; // 只看某来源
  regionId?: number; // 只看某地区
  includeNullRegion?: boolean; // 该地区查询是否也纳入 region_id 为空的旧数据（home 用）
  onlyHidden?: boolean; // 「黑名单」视图：只看被手动拉黑的
}

/** 列出餐厅，并聚合每家「是否去过」「我的最高评分」。 */
export async function listRestaurants(
  filters: ListFilters = {},
): Promise<RestaurantView[]> {
  const myRatingExpr = sql<number | null>`MAX(${visits.rating})`;
  const visitedExpr = sql<number>`COUNT(${visits.id})`;
  const hasXhsExpr = sql<number>`MAX(CASE WHEN ${restaurantXhs.id} IS NOT NULL THEN 1 ELSE 0 END)`;
  const hasPhotoExpr = sql<number>`MAX(CASE WHEN ${restaurantPhotos.id} IS NOT NULL AND ${restaurantPhotos.contentType} != 'none' THEN 1 ELSE 0 END)`;

  const rows = await db
    .select({
      id: restaurants.id,
      placeId: restaurants.placeId,
      name: restaurants.name,
      cuisine: restaurants.cuisine,
      lat: restaurants.lat,
      lng: restaurants.lng,
      rating: restaurants.rating,
      reviewCount: restaurants.reviewCount,
      priceLevel: restaurants.priceLevel,
      source: restaurants.source,
      regionId: restaurants.regionId,
      wantToEat: restaurants.wantToEat,
      hidden: restaurants.hidden,
      address: restaurants.address,
      addedAt: restaurants.addedAt,
      visitCount: visitedExpr,
      myRating: myRatingExpr,
      hasXhs: hasXhsExpr,
      hasPhoto: hasPhotoExpr,
    })
    .from(restaurants)
    .leftJoin(visits, eq(visits.restaurantId, restaurants.id))
    .leftJoin(restaurantXhs, eq(restaurantXhs.restaurantId, restaurants.id))
    .leftJoin(
      restaurantPhotos,
      eq(restaurantPhotos.restaurantId, restaurants.id),
    )
    .groupBy(restaurants.id)
    .all();

  let views: RestaurantView[] = rows.map((r) => ({
    id: r.id,
    placeId: r.placeId,
    name: r.name,
    cuisine: r.cuisine,
    lat: r.lat,
    lng: r.lng,
    rating: r.rating,
    reviewCount: r.reviewCount,
    priceLevel: r.priceLevel,
    source: r.source as RestaurantSource,
    regionId: r.regionId,
    wantToEat: r.wantToEat,
    address: r.address,
    addedAt: r.addedAt,
    visited: Number(r.visitCount) > 0,
    myRating: r.myRating ?? null,
    hasXhsNote: Number(r.hasXhs) > 0,
    hasPhoto: Number(r.hasPhoto) > 0,
    hidden: r.hidden,
  }));

  if (filters.regionId != null) {
    views = views.filter(
      (v) =>
        v.regionId === filters.regionId ||
        (filters.includeNullRegion && v.regionId == null),
    );
  }
  if (filters.source) views = views.filter((v) => v.source === filters.source);
  if (filters.visit === "want") views = views.filter((v) => v.wantToEat && !v.visited);
  if (filters.visit === "visited") views = views.filter((v) => v.visited);
  // 黑名单：默认排除被拉黑的；「黑名单」视图则只看被拉黑的。
  views = views.filter((v) => (filters.onlyHidden ? v.hidden : !v.hidden));

  // 个人层：附加每店所属清单 id + 标签（客户端按清单/标签筛选、卡片展示用）。
  const [listMap, tagsMap] = await Promise.all([
    getListMembershipMap(),
    getTagsMap(),
  ]);
  for (const v of views) {
    v.listIds = listMap.get(v.id);
    v.tags = tagsMap.get(v.id);
  }

  return views;
}

export interface XhsCandidate {
  captureId: number;
  extractedName: string;
  note: string | null;
  summary: string | null; // 博主评价摘要（识别所得，供前端预览）
  dishes: string[]; // 推荐菜
  places: PlaceResult[]; // Google 反查候选
}

export interface XhsIngestResult {
  candidates: XhsCandidate[];
  notice?: string; // 给前端的提示（如链接抓取失败）
  added?: number; // 大列表自动入库的家数（>0 时前端刷新列表）
}

// 一次识别出超过这么多家 → 判定为「大列表」，自动加首个匹配，不逐个确认。
const XHS_AUTO_MAX = 10;

/**
 * 小红书文本/链接 → （链接则先 best-effort 抓正文）→ 提取店名+评价 → Places 反查 → 落 pending 候选。
 * 返回候选给前端确认（多家或识别不清时列出让用户点选）；大列表自动入库。
 */
export async function ingestXhsText(rawText: string): Promise<XhsIngestResult> {
  let content = rawText;
  let sourceUrl: string | null = null;
  let fetchNotice: string | undefined;

  const url = findXhsUrl(rawText);
  if (url) {
    const fetched = await fetchXhsContent(url);
    sourceUrl = fetched.url || url;
    if (fetched.ok) {
      // 抓到的正文放前面，用户自己贴的文字补充在后。
      content = `${fetched.text}\n${rawText}`;
    } else {
      fetchNotice = "链接没抓到内容，尽力用你贴的文字识别。";
    }
  }

  const extracted = await extractRestaurants(content);
  const result = await finalizeIngest(extracted, rawText, sourceUrl, Boolean(url));
  // 自身没有提示时，才回退到「抓取失败」提示。
  if (!result.notice && fetchNotice) result.notice = fetchNotice;
  return result;
}

/** 小红书截图 → vision 提取店名+评价 → 同一条候选管道。 */
export async function ingestXhsImage(
  imageBase64: string,
  mediaType: ImageMediaType,
): Promise<XhsIngestResult> {
  const extracted = await extractRestaurantsFromImage(imageBase64, mediaType);
  const label = extracted.map((e) => e.name).join("、") || "(未识别)";
  return finalizeIngest(extracted, `[截图] ${label}`, null, false);
}

/**
 * 提取结果 → 决定走「逐个确认」还是「大列表自动入库」。
 * - 贴了链接却 0 家：给反爬提示。
 * - >XHS_AUTO_MAX 家：自动把每家 Places 最佳匹配加入「想去吃」，不逐个确认。
 * - 否则：落 pending 候选，返回给前端点选。
 */
async function finalizeIngest(
  extracted: ExtractedRestaurant[],
  rawText: string,
  sourceUrl: string | null,
  fromUrl: boolean,
): Promise<XhsIngestResult> {
  if (extracted.length === 0) {
    return {
      candidates: [],
      notice: fromUrl
        ? "链接没能识别到餐厅（小红书反爬，公开摘要抓取有限）。请在 App 里复制帖子文字，或截图贴进来。"
        : undefined,
    };
  }

  if (extracted.length > XHS_AUTO_MAX) {
    const { added, missed } = await autoResolveMany(extracted, rawText, sourceUrl);
    const tail = missed > 0 ? `（${missed} 家没在 Google 查到）` : "";
    return {
      candidates: [],
      notice: `帖子提到 ${extracted.length} 家，已自动加入 ${added} 家到「想去吃」${tail}。可在列表里逐家查看/调整。`,
      added,
    };
  }

  const candidates = await resolveExtracted(extracted, rawText, sourceUrl);
  return { candidates };
}

/** 大列表：每家取 Places 最佳匹配，直接入库 + 存小红书摘要，不逐个确认。 */
async function autoResolveMany(
  extracted: ExtractedRestaurant[],
  rawText: string,
  sourceUrl: string | null,
): Promise<{ added: number; missed: number }> {
  const home = getHomeAnchor();
  let added = 0;
  let missed = 0;

  for (const item of extracted) {
    const query = item.cityHint ? `${item.name} ${item.cityHint}` : item.name;
    const places = await searchPlaceByText(query, {
      lat: home.lat,
      lng: home.lng,
    });
    // 优先「真餐厅」，否则退回第一条。
    const place = places.find(isRealRestaurant) ?? places[0];
    if (!place) {
      missed++;
      continue;
    }

    const restaurantId = await insertXhsRestaurant(place);
    await db.insert(xhsCaptures).values({
      rawText,
      extractedName: item.name,
      summary: item.summary,
      dishesJson: item.dishes.length ? JSON.stringify(item.dishes) : null,
      sourceUrl,
      restaurantId,
      resolvedPlaceId: place.placeId,
      status: "resolved",
    });
    await attachXhsPost(restaurantId, item.summary, item.dishes, sourceUrl);
    added++;
  }

  return { added, missed };
}

async function resolveExtracted(
  extracted: ExtractedRestaurant[],
  rawText: string,
  sourceUrl: string | null,
): Promise<XhsCandidate[]> {
  const home = getHomeAnchor();
  const candidates: XhsCandidate[] = [];

  for (const item of extracted) {
    const query = item.cityHint ? `${item.name} ${item.cityHint}` : item.name;
    const places = await searchPlaceByText(query, {
      lat: home.lat,
      lng: home.lng,
    });

    const capture = await db
      .insert(xhsCaptures)
      .values({
        rawText,
        extractedName: item.name,
        summary: item.summary,
        dishesJson: item.dishes.length ? JSON.stringify(item.dishes) : null,
        sourceUrl,
        status: "pending",
      })
      .returning({ id: xhsCaptures.id })
      .get();

    candidates.push({
      captureId: capture.id,
      extractedName: item.name,
      note: item.note,
      summary: item.summary,
      dishes: item.dishes,
      places,
    });
  }

  return candidates;
}

/** 把一个 Places 结果作为 xhs 来源入库（想去吃）；已存在则只置 wantToEat。 */
async function insertXhsRestaurant(place: PlaceResult): Promise<number> {
  const inserted = await db
    .insert(restaurants)
    .values({
      placeId: place.placeId,
      name: place.name,
      cuisine: place.cuisine,
      lat: place.lat,
      lng: place.lng,
      rating: place.rating,
      reviewCount: place.reviewCount,
      priceLevel: place.priceLevel,
      source: "xhs",
      wantToEat: true,
      address: place.address,
    })
    .onConflictDoUpdate({
      target: restaurants.placeId,
      set: { wantToEat: true },
    })
    .returning({ id: restaurants.id })
    .get();
  return inserted.id;
}

/** 有摘要或推荐菜时，才把这条笔记沉淀到店上。 */
async function attachXhsPost(
  restaurantId: number,
  summary: string | null,
  dishes: string[],
  url: string | null,
): Promise<void> {
  if (!summary && dishes.length === 0) return;
  await appendXhsPost(restaurantId, {
    summary: summary ?? null,
    dishes,
    url: url ?? null,
    at: Math.floor(Date.now() / 1000),
  });
}

/** 累积一条小红书笔记沉淀到某店（一店一份，最新在前）。 */
async function appendXhsPost(
  restaurantId: number,
  post: XhsPost,
): Promise<void> {
  const existing = await db
    .select({ postsJson: restaurantXhs.postsJson })
    .from(restaurantXhs)
    .where(eq(restaurantXhs.restaurantId, restaurantId))
    .get();
  const posts: XhsPost[] = existing ? JSON.parse(existing.postsJson) : [];
  posts.unshift(post);
  const postsJson = JSON.stringify(posts);
  await db
    .insert(restaurantXhs)
    .values({ restaurantId, postsJson })
    .onConflictDoUpdate({
      target: restaurantXhs.restaurantId,
      set: { postsJson, updatedAt: new Date() },
    });
}

/**
 * 用户点选确认某个候选 → 写入 restaurants(source=xhs, want_to_eat=true) + 标记 capture resolved，
 * 并把识别到的「评价摘要 + 推荐菜 + 原帖链接」累积到店上。
 */
export async function resolveXhsCandidate(
  captureId: number,
  place: PlaceResult,
): Promise<number> {
  const restaurantId = await insertXhsRestaurant(place);

  const capture = await db
    .select()
    .from(xhsCaptures)
    .where(eq(xhsCaptures.id, captureId))
    .get();

  await db
    .update(xhsCaptures)
    .set({
      restaurantId,
      resolvedPlaceId: place.placeId,
      status: "resolved",
    })
    .where(eq(xhsCaptures.id, captureId));

  if (capture) {
    const dishes: string[] = capture.dishesJson
      ? JSON.parse(capture.dishesJson)
      : [];
    await attachXhsPost(restaurantId, capture.summary, dishes, capture.sourceUrl);
  }

  return restaurantId;
}

/** 取某店的小红书笔记沉淀（弹窗展示用）。 */
export async function getXhsPosts(restaurantId: number): Promise<XhsPost[]> {
  const row = await db
    .select({ postsJson: restaurantXhs.postsJson })
    .from(restaurantXhs)
    .where(eq(restaurantXhs.restaurantId, restaurantId))
    .get();
  return row ? (JSON.parse(row.postsJson) as XhsPost[]) : [];
}

export async function rejectXhsCandidate(captureId: number): Promise<void> {
  await db
    .update(xhsCaptures)
    .set({ status: "rejected" })
    .where(and(eq(xhsCaptures.id, captureId)));
}

/** 记一次到访（评分可选，0–100 分制；不打分也算去过）。 */
export async function addVisit(
  restaurantId: number,
  rating?: number | null,
  notes?: string,
): Promise<void> {
  await db.insert(visits).values({
    restaurantId,
    rating: rating ?? null,
    visitType: "吃过",
    notes,
  });
  // 去过就不再是「想去吃」。
  await db
    .update(restaurants)
    .set({ wantToEat: false })
    .where(eq(restaurants.id, restaurantId));
}

/** 切换「想去吃」。 */
export async function setWantToEat(
  restaurantId: number,
  want: boolean,
): Promise<void> {
  await db
    .update(restaurants)
    .set({ wantToEat: want })
    .where(eq(restaurants.id, restaurantId));
}

/** 拉黑/恢复某店（黑名单）。拉黑时顺手取消「想去吃」。 */
export async function setHidden(
  restaurantId: number,
  hidden: boolean,
): Promise<void> {
  await db
    .update(restaurants)
    .set(hidden ? { hidden: true, wantToEat: false } : { hidden: false })
    .where(eq(restaurants.id, restaurantId));
}
