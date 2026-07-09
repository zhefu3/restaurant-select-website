/** 菜单（AI 归纳+翻译）与我的文字点评：存取。 */

import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { restaurantMenus, restaurantReviews } from "@/db/schema";
import { extractMenu, type ImageMediaType, type MenuSection } from "./anthropic";
import { getXhsPosts } from "./restaurants";
import {
  getLists,
  getRestaurantListIds,
  getRestaurantTags,
  type ListSummary,
} from "./lists";
import type { XhsPost } from "./types";

export interface RestaurantExtra {
  menu: { sections: MenuSection[]; source: string } | null;
  review: string | null;
  xhsPosts: XhsPost[]; // 小红书笔记沉淀（评价摘要 + 推荐菜）
  allLists: ListSummary[]; // 全部清单（弹窗里勾选收藏）
  listIds: number[]; // 本店所属清单
  tags: string[]; // 本店标签
}

/** 一次取出某店的菜单 + 我的点评 + 小红书笔记（弹窗打开时调）。 */
export async function getRestaurantExtra(
  restaurantId: number,
): Promise<RestaurantExtra> {
  const menuRow = await db
    .select()
    .from(restaurantMenus)
    .where(eq(restaurantMenus.restaurantId, restaurantId))
    .get();
  const reviewRow = await db
    .select()
    .from(restaurantReviews)
    .where(eq(restaurantReviews.restaurantId, restaurantId))
    .get();
  const xhsPosts = await getXhsPosts(restaurantId);
  const [allLists, listIds, tags] = await Promise.all([
    getLists(),
    getRestaurantListIds(restaurantId),
    getRestaurantTags(restaurantId),
  ]);

  return {
    menu: menuRow
      ? { sections: JSON.parse(menuRow.sectionsJson), source: menuRow.source }
      : null,
    review: reviewRow?.body ?? null,
    xhsPosts,
    allLists,
    listIds,
    tags,
  };
}

/** 上传菜单（照片或文字）→ AI 归纳翻译 → 覆盖存储，返回结构化菜单。 */
export async function saveMenu(
  restaurantId: number,
  input: { text?: string; imageBase64?: string; mediaType?: ImageMediaType },
): Promise<MenuSection[]> {
  const sections = await extractMenu(input);
  if (sections.length === 0) return [];
  const source = input.imageBase64 ? "photo" : "text";
  await db
    .insert(restaurantMenus)
    .values({
      restaurantId,
      sectionsJson: JSON.stringify(sections),
      source,
    })
    .onConflictDoUpdate({
      target: restaurantMenus.restaurantId,
      set: {
        sectionsJson: JSON.stringify(sections),
        source,
        updatedAt: new Date(),
      },
    });
  return sections;
}

/** 写/改我的点评（空字符串 = 删除）。 */
export async function saveReview(
  restaurantId: number,
  body: string,
): Promise<void> {
  const trimmed = body.trim();
  if (!trimmed) {
    await db
      .delete(restaurantReviews)
      .where(eq(restaurantReviews.restaurantId, restaurantId));
    return;
  }
  await db
    .insert(restaurantReviews)
    .values({ restaurantId, body: trimmed })
    .onConflictDoUpdate({
      target: restaurantReviews.restaurantId,
      set: { body: trimmed, updatedAt: new Date() },
    });
}
