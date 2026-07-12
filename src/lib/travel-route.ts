/**
 * 功能①：沿路线找餐厅。
 * 起点/终点(地名) → Geocoding 转坐标 → Routes API 算真实驾车路线(polyline)
 * → Places 沿路线搜索 → 存进一个「route」地区，polyline 存 region.meta 供地图画线。
 * 依赖 Geocoding API + Routes API（需在 Cloud 启用 + key 放行）。
 */

import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { regions, restaurants } from "@/db/schema";
import { searchAlongRoute, isRealRestaurant } from "./google-places";
import {
  assertUnderCap,
  recordUsage,
  PLACES_UNIT_COST,
} from "./api-usage";

const PLACES_API = "google_places";
const GEO_BASE = "https://maps.googleapis.com/maps/api/geocode/json";
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const TIMEOUT_MS = 15_000;

function apiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY 未配置");
  return key;
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface LatLng {
  lat: number;
  lng: number;
}

/** 地名/地址 → 坐标（Geocoding API）。 */
export async function geocode(query: string): Promise<LatLng> {
  await assertUnderCap(PLACES_API, PLACES_UNIT_COST.geocoding);
  const url = `${GEO_BASE}?address=${encodeURIComponent(query)}&key=${apiKey()}`;
  const res = await fetchWithTimeout(url, { method: "GET" });
  const data = await res.json();
  await recordUsage(PLACES_API, PLACES_UNIT_COST.geocoding, 1);
  if (data.status !== "OK" || !data.results?.length) {
    throw new Error(`地理编码失败「${query}」：${data.status} ${data.error_message ?? ""}`);
  }
  const loc = data.results[0].geometry.location;
  return { lat: loc.lat, lng: loc.lng };
}

export interface RouteInfo {
  encodedPolyline: string;
  distanceMeters: number;
  durationSeconds: number;
}

/** 两点 → 真实驾车路线（Routes API）。 */
export async function computeRoute(
  origin: LatLng,
  destination: LatLng,
): Promise<RouteInfo> {
  await assertUnderCap(PLACES_API, PLACES_UNIT_COST.computeRoutes);
  const res = await fetchWithTimeout(ROUTES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey(),
      "X-Goog-FieldMask":
        "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: {
        location: { latLng: { latitude: destination.lat, longitude: destination.lng } },
      },
      travelMode: "DRIVE",
    }),
  });
  const data = await res.json();
  await recordUsage(PLACES_API, PLACES_UNIT_COST.computeRoutes, 1);
  if (!res.ok || !data.routes?.length) {
    throw new Error(`算路线失败：${data.error?.message ?? res.status}`);
  }
  const r = data.routes[0];
  return {
    encodedPolyline: r.polyline.encodedPolyline,
    distanceMeters: r.distanceMeters,
    durationSeconds: Number(String(r.duration).replace("s", "")),
  };
}

export interface RouteSearchInput {
  from: string;
  to: string;
  regionName?: string;
  minRating?: number;
  minReviews?: number;
}

export interface RouteSearchResult {
  regionId: number;
  regionName: string;
  saved: number;
  distanceMiles: number;
  durationMinutes: number;
}

/** 端到端：地名→坐标→路线→沿途餐厅→存进 route 地区。 */
export async function searchRoute(
  input: RouteSearchInput,
): Promise<RouteSearchResult> {
  const minRating = input.minRating ?? 4.0;
  const minReviews = input.minReviews ?? 100;

  const [origin, dest] = await Promise.all([
    geocode(input.from),
    geocode(input.to),
  ]);
  const route = await computeRoute(origin, dest);
  const raw = await searchAlongRoute(route.encodedPolyline, 20);

  const passed = raw
    .filter(isRealRestaurant)
    .filter(
      (r) =>
        r.rating != null &&
        r.rating >= minRating &&
        r.reviewCount != null &&
        r.reviewCount >= minReviews,
    );

  const regionName = input.regionName ?? `${input.from} → ${input.to}`;
  const midLat = (origin.lat + dest.lat) / 2;
  const midLng = (origin.lng + dest.lng) / 2;
  const meta = {
    kind: "route",
    from: input.from,
    to: input.to,
    polyline: route.encodedPolyline,
    distanceMiles: Number((route.distanceMeters / 1609.34).toFixed(1)),
    durationMinutes: Math.round(route.durationSeconds / 60),
  };

  // 复用同名路线地区，否则新建
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
        kind: "route",
        centerLat: midLat,
        centerLng: midLng,
        meta: JSON.stringify(meta),
        refreshedAt: new Date(),
      })
      .returning()
      .get();
  } else {
    await db
      .update(regions)
      .set({ meta: JSON.stringify(meta), refreshedAt: new Date() })
      .where(eq(regions.id, region.id));
  }

  let saved = 0;
  for (const p of passed) {
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
        regionId: region.id,
        address: p.address,
      })
      .onConflictDoUpdate({
        target: restaurants.placeId,
        set: {
          rating: p.rating,
          reviewCount: p.reviewCount,
          priceLevel: p.priceLevel,
          address: p.address,
          // 不改 regionId——已属于某地区的店不被"抢走"
        },
      });
    saved++;
  }

  return {
    regionId: region.id,
    regionName,
    saved,
    distanceMiles: meta.distanceMiles,
    durationMinutes: meta.durationMinutes,
  };
}

// 与 travel.ts 一致：Agent 视为「已缓存」的新鲜期。
const AGENT_CACHE_DAYS = 30;

export interface AgentRouteResult {
  regionId: number | null;
  regionName: string;
  cached: boolean;
  budgetBlocked?: boolean;
  centerLat: number | null;
  centerLng: number | null;
  distanceMiles?: number;
  durationMinutes?: number;
}

/**
 * 聊天 Agent 专用「沿路线找餐厅」，缓存优先。
 * - 命中同名 route 地区 + N 天内刷新过 + 有店 → 读缓存不花钱。
 * - 未命中且 allowPaid → 调 searchRoute（Geocoding×2 + Routes + Places）花钱。
 * - 未命中且 !allowPaid → budgetBlocked=true。
 */
export async function searchRouteForAgent(
  from: string,
  to: string,
  opts: { allowPaid: boolean; minRating?: number; minReviews?: number },
): Promise<AgentRouteResult> {
  const regionName = `${from} → ${to}`;
  const existing = await db
    .select()
    .from(regions)
    .where(eq(regions.name, regionName))
    .get();
  if (existing) {
    const fresh =
      existing.refreshedAt != null &&
      Date.now() - new Date(existing.refreshedAt).getTime() <
        AGENT_CACHE_DAYS * 864e5;
    const cnt = await db
      .select({ c: sql<number>`count(*)` })
      .from(restaurants)
      .where(eq(restaurants.regionId, existing.id))
      .get();
    if (fresh && Number(cnt?.c ?? 0) > 0) {
      let distanceMiles: number | undefined;
      let durationMinutes: number | undefined;
      try {
        const m = JSON.parse(existing.meta ?? "{}");
        distanceMiles = m.distanceMiles;
        durationMinutes = m.durationMinutes;
      } catch {
        /* meta 坏了忽略 */
      }
      return {
        regionId: existing.id,
        regionName,
        cached: true,
        centerLat: existing.centerLat,
        centerLng: existing.centerLng,
        distanceMiles,
        durationMinutes,
      };
    }
  }

  if (!opts.allowPaid) {
    return {
      regionId: null,
      regionName,
      cached: false,
      budgetBlocked: true,
      centerLat: null,
      centerLng: null,
    };
  }

  const res = await searchRoute({
    from,
    to,
    minRating: opts.minRating,
    minReviews: opts.minReviews,
  });
  const reg = await db
    .select()
    .from(regions)
    .where(eq(regions.id, res.regionId))
    .get();
  return {
    regionId: res.regionId,
    regionName: res.regionName,
    cached: false,
    centerLat: reg?.centerLat ?? null,
    centerLng: reg?.centerLng ?? null,
    distanceMiles: res.distanceMiles,
    durationMinutes: res.durationMinutes,
  };
}
