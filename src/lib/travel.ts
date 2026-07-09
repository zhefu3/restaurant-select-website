/**
 * 旅行：实时查任意区域的餐厅，按「地区」分桶入库缓存。
 *
 * - 城市：Text Search "restaurants in <city>"
 * - 定点+半径：Nearby Search（圆形）
 * 查到的餐厅存进对应 region（source=travel），下次看同一地区直接读库、不再调 API。
 * 路线（route）功能在 travel-route.ts，依赖 Routes/Geocoding API。
 */

import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { regions, restaurants } from "@/db/schema";
import {
  nearbyRestaurants,
  searchRestaurantsByText,
  type PlaceResult,
} from "./google-places";
import { isRealRestaurant } from "./google-places";
import { pointInPolygon, polygonBoundingCircle } from "./geo";
import { assertUnderCap, recordUsage, PLACES_UNIT_COST } from "./api-usage";
import { costConfig } from "./config";

const MILE_IN_METERS = 1609.34;

export interface RegionSummary {
  id: number;
  name: string;
  kind: string;
  centerLat: number | null;
  centerLng: number | null;
  count: number;
  refreshedAt: Date | null;
  /** route 地区专用：编码 polyline + 距离/时长，供地图画线。 */
  route?: {
    polyline: string;
    from?: string;
    to?: string;
    distanceMiles?: number;
    durationMinutes?: number;
  } | null;
}

/** 列出所有地区 + 各自餐厅数（home 排最前，其余按新到旧）。 */
export async function listRegions(): Promise<RegionSummary[]> {
  const regs = await db
    .select()
    .from(regions)
    .orderBy(desc(regions.createdAt))
    .all();

  const parseRoute = (kind: string, meta: string | null) => {
    if (kind !== "route" || !meta) return null;
    try {
      const m = JSON.parse(meta);
      if (!m.polyline) return null;
      return {
        polyline: m.polyline as string,
        from: m.from,
        to: m.to,
        distanceMiles: m.distanceMiles,
        durationMinutes: m.durationMinutes,
      };
    } catch {
      return null;
    }
  };

  const counts = await db
    .select({ regionId: restaurants.regionId, c: sql<number>`count(*)` })
    .from(restaurants)
    .groupBy(restaurants.regionId)
    .all();
  const countMap = new Map<number | null, number>(
    counts.map((c) => [c.regionId, Number(c.c)]),
  );
  const nullCount = countMap.get(null) ?? 0; // 旧数据（region 为空）算进 home

  return regs
    .map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      centerLat: r.centerLat,
      centerLng: r.centerLng,
      refreshedAt: r.refreshedAt,
      count: (countMap.get(r.id) ?? 0) + (r.kind === "home" ? nullCount : 0),
      route: parseRoute(r.kind, r.meta),
    }))
    .sort((a, b) => (a.kind === "home" ? -1 : b.kind === "home" ? 1 : 0));
}

/** 把一批 Places 结果写进某地区（按 place_id 去重 upsert）。返回新增/更新数。 */
async function saveToRegion(
  regionId: number,
  places: PlaceResult[],
): Promise<number> {
  let n = 0;
  for (const p of places) {
    if (!p.placeId || p.lat == null || p.lng == null) continue;
    await db
      .insert(restaurants)
      .values({
        placeId: p.placeId,
        name: p.name,
        cuisine: p.cuisine,
        lat: p.lat,
        lng: p.lng,
        rating: p.rating,
        reviewCount: p.reviewCount,
        priceLevel: p.priceLevel,
        source: "travel",
        regionId,
        address: p.address,
      })
      .onConflictDoUpdate({
        target: restaurants.placeId,
        set: {
          rating: p.rating,
          reviewCount: p.reviewCount,
          priceLevel: p.priceLevel,
          address: p.address,
          // 注意：不改 regionId——已属于某地区（尤其南湾）的店不能被新搜索"抢走"
        },
      });
    n++;
  }
  return n;
}

export interface AreaSearchInput {
  mode: "city" | "point";
  /** city 模式：城市名/自由文本 */
  query?: string;
  /** point 模式：中心坐标 + 英里半径 */
  lat?: number;
  lng?: number;
  radiusMiles?: number;
  /** 地区名（不传则自动取 query 或坐标） */
  regionName?: string;
  /** 质量门槛（小城市可放宽），默认 4.0 / 100 */
  minRating?: number;
  minReviews?: number;
}

export interface AreaSearchResult {
  regionId: number | null; // 圈选全是已有店时为 null（未建地区）
  regionName: string;
  saved: number;
  found?: number; // 圈选：这片达标总数（含已在别处的）
  centerLat: number | null;
  centerLng: number | null;
}

/**
 * 查一片区域并存进（新建或复用）地区。
 * 同名地区复用，避免每次搜都建新的。
 */
export async function searchArea(
  input: AreaSearchInput,
): Promise<AreaSearchResult> {
  const minRating = input.minRating ?? 4.0;
  const minReviews = input.minReviews ?? 100;

  let raw: PlaceResult[];
  let centerLat: number | null = null;
  let centerLng: number | null = null;
  let regionName: string;
  let kind: "city" | "point";

  if (input.mode === "city") {
    const q = (input.query ?? "").trim();
    if (!q) throw new Error("city 模式需要 query");
    raw = await searchRestaurantsByText(`restaurants in ${q}`, 20);
    regionName = input.regionName ?? q;
    kind = "city";
    // 城市中心取结果均值（够用）
    const pts = raw.filter((r) => r.lat != null && r.lng != null);
    if (pts.length) {
      centerLat = pts.reduce((s, r) => s + r.lat, 0) / pts.length;
      centerLng = pts.reduce((s, r) => s + r.lng, 0) / pts.length;
    }
  } else {
    if (input.lat == null || input.lng == null)
      throw new Error("point 模式需要 lat/lng");
    const radiusMeters = Math.min(
      (input.radiusMiles ?? 10) * MILE_IN_METERS,
      50_000,
    );
    raw = await nearbyRestaurants({ lat: input.lat, lng: input.lng }, radiusMeters);
    regionName =
      input.regionName ??
      `定点 ${input.lat.toFixed(3)},${input.lng.toFixed(3)}`;
    kind = "point";
    centerLat = input.lat;
    centerLng = input.lng;
  }

  // 过滤：真餐厅 + 达标
  const passed = raw
    .filter(isRealRestaurant)
    .filter(
      (r) =>
        r.rating != null &&
        r.rating >= minRating &&
        r.reviewCount != null &&
        r.reviewCount >= minReviews,
    );

  // 复用同名地区，否则新建
  let region = await db
    .select()
    .from(regions)
    .where(eq(regions.name, regionName))
    .get();
  if (!region) {
    region = await db
      .insert(regions)
      .values({
        name: regionName,
        kind,
        centerLat,
        centerLng,
        meta: JSON.stringify(input),
        refreshedAt: new Date(),
      })
      .returning()
      .get();
  } else {
    await db
      .update(regions)
      .set({ refreshedAt: new Date(), centerLat, centerLng })
      .where(eq(regions.id, region.id));
  }

  const saved = await saveToRegion(region.id, passed);

  return {
    regionId: region.id,
    regionName,
    saved,
    centerLat,
    centerLng,
  };
}

export interface PolygonSearchInput {
  points: { lat: number; lng: number }[];
  regionName?: string;
  minRating?: number;
  minReviews?: number;
}

/**
 * 多边形圈选搜索（②B）：外接圆一次 Nearby → 本地 point-in-polygon 精筛 → 存进新地区。
 * 独立 $5/月 预算硬熔断（`area_search`），也计入 google_places 全局账。
 */
export async function searchPolygon(
  input: PolygonSearchInput,
): Promise<AreaSearchResult> {
  const poly = input.points;
  if (!poly || poly.length < 3) throw new Error("多边形至少要 3 个点");
  const minRating = input.minRating ?? 4.0;
  const minReviews = input.minReviews ?? 100;

  const { center, radiusMeters } = polygonBoundingCircle(poly);
  const radius = Math.min(radiusMeters, 50_000);

  // $5/月 圈选预算硬熔断（独立于全局 $180）。
  await assertUnderCap(
    "area_search",
    PLACES_UNIT_COST.nearbySearch,
    costConfig.areaSearchMonthlyCapUsd,
  );
  const raw = await nearbyRestaurants(center, radius); // 内部计入 google_places 全局账
  await recordUsage("area_search", PLACES_UNIT_COST.nearbySearch);

  const passed = raw
    .filter(isRealRestaurant)
    .filter(
      (r) =>
        r.lat != null &&
        r.lng != null &&
        pointInPolygon({ lat: r.lat, lng: r.lng }, poly),
    )
    .filter(
      (r) =>
        r.rating != null &&
        r.rating >= minRating &&
        r.reviewCount != null &&
        r.reviewCount >= minReviews,
    );

  const regionName =
    input.regionName ??
    `🔷 圈选 ${new Date().toLocaleString("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })}`;

  const region = await db
    .insert(regions)
    .values({
      name: regionName,
      kind: "point", // 复用 point：地图飞到外接圆中心
      centerLat: center.lat,
      centerLng: center.lng,
      meta: JSON.stringify({ polygon: poly }),
      refreshedAt: new Date(),
    })
    .returning()
    .get();

  await saveToRegion(region.id, passed);

  // 这片里达标的总数（含已在别处的）与新地区实际拿到的数（saveToRegion 不抢已有店）。
  const found = passed.length;
  const cntRow = await db
    .select({ c: sql<number>`count(*)` })
    .from(restaurants)
    .where(eq(restaurants.regionId, region.id))
    .get();
  const added = Number(cntRow?.c ?? 0);

  // 全是已有店（多在南湾）→ 删掉空地区，别留空 tab。
  if (added === 0) {
    await db.delete(regions).where(eq(regions.id, region.id));
    return {
      regionId: null,
      regionName,
      saved: 0,
      found,
      centerLat: center.lat,
      centerLng: center.lng,
    };
  }

  return {
    regionId: region.id,
    regionName,
    saved: added,
    found,
    centerLat: center.lat,
    centerLng: center.lng,
  };
}

/** 删除一个旅行地区（连带里面的餐厅）。home 不可删。 */
export async function deleteRegion(regionId: number): Promise<void> {
  const region = await db
    .select()
    .from(regions)
    .where(eq(regions.id, regionId))
    .get();
  if (!region) return;
  if (region.kind === "home") throw new Error("home 地区不可删除");
  await db.delete(restaurants).where(eq(restaurants.regionId, regionId));
  await db.delete(regions).where(eq(regions.id, regionId));
}
