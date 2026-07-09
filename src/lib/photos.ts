/** 餐厅照片：抓取(付费)→缓存入库，之后从库里读(免费)。 */

import "server-only";
import { and, eq, isNull, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { restaurantPhotos, restaurants } from "@/db/schema";
import { fetchPlacePhoto } from "./google-places";

// 没照片的店也插一条「哨兵」记录，标记已尝试，避免全量抓取时无限重抓、重复付费。
const NO_PHOTO = "none";

type CacheStatus = "added" | "none" | "exists";

/** 抓一家店的照片并缓存（已处理过则跳过）。 */
export async function cacheRestaurantPhoto(
  restaurantId: number,
  placeId: string,
): Promise<CacheStatus> {
  const existing = await db
    .select({ id: restaurantPhotos.id })
    .from(restaurantPhotos)
    .where(eq(restaurantPhotos.restaurantId, restaurantId))
    .get();
  if (existing) return "exists"; // 已处理过（有照片或哨兵），不重复付费

  const photo = await fetchPlacePhoto(placeId);
  await db
    .insert(restaurantPhotos)
    .values({
      restaurantId,
      data: photo?.base64 ?? "",
      contentType: photo?.contentType ?? NO_PHOTO,
    })
    .onConflictDoUpdate({
      target: restaurantPhotos.restaurantId,
      set: {
        data: photo?.base64 ?? "",
        contentType: photo?.contentType ?? NO_PHOTO,
      },
    });
  return photo ? "added" : "none";
}

/** 读缓存的照片（免费）。哨兵（无照片）返回 null。 */
export async function getRestaurantPhoto(
  restaurantId: number,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const row = await db
    .select()
    .from(restaurantPhotos)
    .where(eq(restaurantPhotos.restaurantId, restaurantId))
    .get();
  if (!row || row.contentType === NO_PHOTO || !row.data) return null;
  return { bytes: Buffer.from(row.data, "base64"), contentType: row.contentType };
}

/** 有 placeId 且尚未处理过照片的店（供批量抓取）。 */
export async function restaurantsNeedingPhoto(
  limit: number,
): Promise<{ id: number; placeId: string }[]> {
  const rows = await db
    .select({ id: restaurants.id, placeId: restaurants.placeId })
    .from(restaurants)
    .leftJoin(
      restaurantPhotos,
      eq(restaurantPhotos.restaurantId, restaurants.id),
    )
    .where(and(isNotNull(restaurants.placeId), isNull(restaurantPhotos.id)))
    .limit(limit)
    .all();
  return rows.filter(
    (r): r is { id: number; placeId: string } => Boolean(r.placeId),
  );
}

/** 还需处理照片的店数。 */
export async function countNeedingPhoto(): Promise<number> {
  const row = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(restaurants)
    .leftJoin(
      restaurantPhotos,
      eq(restaurantPhotos.restaurantId, restaurants.id),
    )
    .where(and(isNotNull(restaurants.placeId), isNull(restaurantPhotos.id)))
    .get();
  return row?.n ?? 0;
}

/** 批量抓取（带并发）。返回 {added, none, failed}。 */
export async function backfillPhotos(
  rows: { id: number; placeId: string }[],
  concurrency = 4,
): Promise<{ added: number; none: number; failed: number }> {
  let added = 0;
  let none = 0;
  let failed = 0;
  let idx = 0;
  async function worker() {
    while (idx < rows.length) {
      const r = rows[idx++];
      try {
        const status = await cacheRestaurantPhoto(r.id, r.placeId);
        if (status === "added") added++;
        else if (status === "none") none++;
      } catch (e) {
        console.error(`photo backfill failed for ${r.id}:`, e);
        failed++;
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, rows.length) }, worker),
  );
  return { added, none, failed };
}
