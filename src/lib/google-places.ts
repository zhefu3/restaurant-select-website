/**
 * Google Places API 封装（Places API — 新版 v1）。
 *
 * 两个用途：
 *   1) discover 脚本：Nearby Search 撒网发现餐厅。
 *   2) 小红书流程：Text Search 按店名反查评分/地址/坐标。
 *
 * 每次付费调用都过 api-usage 的熔断与记账。
 */

import {
  assertUnderCap,
  recordUsage,
  PLACES_UNIT_COST,
  type PlacesOp,
} from "./api-usage";
import type { LatLng } from "./geo";

const PLACES_API = "google_places";
const BASE = "https://places.googleapis.com/v1";
const REQUEST_TIMEOUT_MS = 15_000;

export interface PlaceResult {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  rating: number | null;
  reviewCount: number | null;
  priceLevel: number | null;
  cuisine: string | null;
  address: string | null;
  types: string[];
}

/**
 * 应排除的 place 类型：商场/影院/超市等常被 Google 打上 "restaurant" 标签，
 * 但不是我们想要的餐厅。商场里真正的餐厅不会带这些类型，所以安全。
 */
const EXCLUDED_TYPES = new Set([
  "shopping_mall",
  "department_store",
  "supermarket",
  "grocery_store",
  "movie_theater",
  "gas_station",
  "convenience_store",
  "lodging",
  "hotel",
  "stadium",
  "amusement_park",
  "tourist_attraction",
  // 归类时发现的漏网非餐饮场所（有餐厅标签但本质不是吃饭的地方）。
  // 注意：banquet_hall / event_venue 不列入——很多真餐厅（如做宴席的牛排馆）
  // 会带这个标签，一刀切会误删。
  "ice_skating_rink",
  "sports_complex",
  "summer_camp_organizer",
]);

/** 是否是「真餐厅」（类型里不含商场/影院等排除项）。 */
export function isRealRestaurant(p: PlaceResult): boolean {
  return !p.types.some((t) => EXCLUDED_TYPES.has(t));
}

function apiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY 未配置");
  return key;
}

/** 新版 Places 的 priceLevel 是枚举字符串，映射成 0–4。 */
function mapPriceLevel(level?: string): number | null {
  const map: Record<string, number> = {
    PRICE_LEVEL_FREE: 0,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  return level && level in map ? map[level] : null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toResult(p: any): PlaceResult {
  return {
    placeId: p.id,
    name: p.displayName?.text ?? p.name ?? "(未知)",
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    rating: p.rating ?? null,
    reviewCount: p.userRatingCount ?? null,
    priceLevel: mapPriceLevel(p.priceLevel),
    cuisine: Array.isArray(p.types)
      ? p.types.find((t: string) => t !== "restaurant" && t !== "food") ?? null
      : null,
    address: p.formattedAddress ?? null,
    types: Array.isArray(p.types) ? p.types : [],
  };
}

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.types",
  "places.formattedAddress",
].join(",");

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 计费包装：先过熔断，调用成功后记账。 */
async function billed<T>(op: PlacesOp, fn: () => Promise<T>): Promise<T> {
  const cost = PLACES_UNIT_COST[op];
  await assertUnderCap(PLACES_API, cost);
  const result = await fn();
  await recordUsage(PLACES_API, cost, 1);
  return result;
}

/**
 * Nearby Search：以某点为圆心搜餐厅。
 * @param center 圆心
 * @param radiusMeters 半径（米）
 */
export async function nearbyRestaurants(
  center: LatLng,
  radiusMeters: number,
): Promise<PlaceResult[]> {
  return billed("nearbySearch", async () => {
    const res = await fetchWithTimeout(`${BASE}/places:searchNearby`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey(),
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        includedTypes: ["restaurant"],
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: { latitude: center.lat, longitude: center.lng },
            radius: radiusMeters,
          },
        },
        rankPreference: "POPULARITY",
      }),
    });

    if (!res.ok) {
      throw new Error(`Places Nearby 失败 ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    return (data.places ?? []).map(toResult);
  });
}

/**
 * 拉某家店的用户评论文本（最多 5 条，Google 限制）。
 * 用于「推荐点菜」：从评论里挖被反复夸的菜。结果应缓存（dish_recs），别重复调。
 */
export async function fetchPlaceReviews(placeId: string): Promise<string[]> {
  return billed("placeDetailsReviews", async () => {
    const res = await fetchWithTimeout(`${BASE}/places/${placeId}`, {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": apiKey(),
        "X-Goog-FieldMask": "reviews",
      },
    });
    if (!res.ok) {
      throw new Error(`Place Details 失败 ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    return (data.reviews ?? [])
      .map((r: any) => r.text?.text as string | undefined)
      .filter((t: string | undefined): t is string => Boolean(t));
  });
}

/**
 * 取某家店的一张照片（Google Places Photo）。
 * 两步：Place Details 取 photos 字段拿到照片资源名 → Place Photo 取图片字节。
 * 都过熔断计费。返回 base64 + contentType，供上层缓存入库（永久，不重复付费）。
 */
export async function fetchPlacePhoto(
  placeId: string,
  maxPx = 400,
): Promise<{ base64: string; contentType: string } | null> {
  // 1) Place Details 取 photos
  const photoName = await billed("placeDetailsPhotos", async () => {
    const res = await fetchWithTimeout(`${BASE}/places/${placeId}`, {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": apiKey(),
        "X-Goog-FieldMask": "photos",
      },
    });
    if (!res.ok) throw new Error(`Place Details(photos) 失败 ${res.status}`);
    const data = await res.json();
    const first = Array.isArray(data.photos) ? data.photos[0] : null;
    return (first?.name as string | undefined) ?? null;
  });
  if (!photoName) return null;

  // 2) Place Photo 取图片字节（媒体接口会 302 到实际图片，fetch 自动跟随）
  return billed("placePhoto", async () => {
    const res = await fetchWithTimeout(
      `${BASE}/${photoName}/media?maxWidthPx=${maxPx}&maxHeightPx=${maxPx}`,
      { method: "GET", headers: { "X-Goog-Api-Key": apiKey() } },
    );
    if (!res.ok) throw new Error(`Place Photo 失败 ${res.status}`);
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    return { base64: buf.toString("base64"), contentType };
  });
}

/**
 * Text Search：按名字（可选 bias 到某片区域）查一家店。
 * 小红书流程用它把「店名」解析成带坐标/评分的 place。
 */
export async function searchPlaceByText(
  query: string,
  bias?: LatLng,
): Promise<PlaceResult[]> {
  return billed("textSearch", async () => {
    const body: Record<string, unknown> = {
      textQuery: query,
      includedType: "restaurant",
      maxResultCount: 5,
    };
    if (bias) {
      body.locationBias = {
        circle: {
          center: { latitude: bias.lat, longitude: bias.lng },
          radius: 30_000,
        },
      };
    }

    const res = await fetchWithTimeout(`${BASE}/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey(),
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Places Text 失败 ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    return (data.places ?? []).map(toResult);
  });
}

/**
 * 沿路线搜索：给一条编码 polyline，返回沿途餐厅（Places 官方 searchAlongRouteParameters）。
 */
export async function searchAlongRoute(
  encodedPolyline: string,
  maxResults = 20,
): Promise<PlaceResult[]> {
  return billed("textSearch", async () => {
    const res = await fetchWithTimeout(`${BASE}/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey(),
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: "restaurant",
        includedType: "restaurant",
        maxResultCount: Math.min(maxResults, 20),
        searchAlongRouteParameters: {
          polyline: { encodedPolyline },
        },
      }),
    });
    if (!res.ok) {
      throw new Error(`沿路线搜索失败 ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    return (data.places ?? []).map(toResult);
  });
}

/**
 * Text Search（旅行用）：按自由文本查一片区域的餐厅，返回多条。
 * 例：query="restaurants in Seattle" / "餐厅 near Pike Place Market"。
 */
export async function searchRestaurantsByText(
  query: string,
  maxResults = 20,
): Promise<PlaceResult[]> {
  return billed("textSearch", async () => {
    const res = await fetchWithTimeout(`${BASE}/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey(),
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: query,
        includedType: "restaurant",
        maxResultCount: Math.min(maxResults, 20),
      }),
    });
    if (!res.ok) {
      throw new Error(`Places Text 失败 ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    return (data.places ?? []).map(toResult);
  });
}
