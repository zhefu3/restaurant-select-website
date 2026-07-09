/**
 * 「推荐点菜」服务端逻辑。
 *
 * 数据源（按优先级合并）：
 *   1. Google Place Details 的评论（≤5 条，$0.025/家，永久缓存到 dish_recs）
 *   2. 这家店关联的小红书帖子原文（免费，中文视角）
 *   3. 都没有 → 让 Claude 凭对知名店的了解给（严格防编造，宁空勿错）
 */

import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { dishes, dishRecs, restaurants, xhsCaptures } from "@/db/schema";
import { extractDishes, type ExtractedDish } from "./anthropic";
import { fetchPlaceReviews } from "./google-places";

export interface DishRecResult {
  dishes: ExtractedDish[];
  source: string;
  cached: boolean;
  /** 我自己的菜品记录（值得再点/避雷）。 */
  myDishes: { name: string; verdict: string; notes: string | null }[];
}

export async function getDishRecommendation(
  restaurantId: number,
): Promise<DishRecResult> {
  const myDishes = await db
    .select({
      name: dishes.name,
      verdict: dishes.verdict,
      notes: dishes.notes,
    })
    .from(dishes)
    .where(eq(dishes.restaurantId, restaurantId))
    .orderBy(desc(dishes.createdAt))
    .all();

  // 1) 缓存命中直接返回
  const cached = await db
    .select()
    .from(dishRecs)
    .where(eq(dishRecs.restaurantId, restaurantId))
    .get();
  if (cached) {
    return {
      dishes: JSON.parse(cached.dishesJson),
      source: cached.source,
      cached: true,
      myDishes,
    };
  }

  const r = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .get();
  if (!r) throw new Error(`餐厅 ${restaurantId} 不存在`);

  // 2) 组语料：Google 评论 + 小红书原文
  const texts: string[] = [];
  if (r.placeId) {
    try {
      texts.push(...(await fetchPlaceReviews(r.placeId)));
    } catch (err) {
      console.warn("拉取评论失败（继续用其他来源）:", err);
    }
  }
  const xhsRows = await db
    .select({ rawText: xhsCaptures.rawText })
    .from(xhsCaptures)
    .where(eq(xhsCaptures.restaurantId, restaurantId))
    .all();
  texts.push(...xhsRows.map((x) => x.rawText));

  const source = texts.length > 0 ? "reviews+xhs" : "claude_knowledge";
  const extracted = await extractDishes(r.name, r.address, texts);

  // 3) 入缓存（空结果也缓存，避免反复白花钱）
  await db.insert(dishRecs).values({
    restaurantId,
    dishesJson: JSON.stringify(extracted),
    source,
  });

  return { dishes: extracted, source, cached: false, myDishes };
}

/** 记一道菜。 */
export async function addDish(
  restaurantId: number,
  name: string,
  verdict: "again" | "ok" | "never",
  notes?: string,
): Promise<void> {
  await db.insert(dishes).values({ restaurantId, name, verdict, notes });
}
