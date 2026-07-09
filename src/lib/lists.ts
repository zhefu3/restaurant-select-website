/** 个人层：收藏夹/清单 + 自定义标签。全部纯本地库操作，零 API 成本。 */

import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { lists, listItems, restaurantTags } from "@/db/schema";

export interface ListSummary {
  id: number;
  name: string;
  emoji: string | null;
  count: number;
}

/** 所有清单 + 每个清单的店数。 */
export async function getLists(): Promise<ListSummary[]> {
  const rows = await db
    .select({
      id: lists.id,
      name: lists.name,
      emoji: lists.emoji,
      count: sql<number>`COUNT(${listItems.id})`,
    })
    .from(lists)
    .leftJoin(listItems, eq(listItems.listId, lists.id))
    .groupBy(lists.id)
    .orderBy(lists.sortOrder, lists.id)
    .all();
  return rows.map((r) => ({ ...r, count: Number(r.count) }));
}

export async function createList(
  name: string,
  emoji?: string | null,
): Promise<number> {
  const row = await db
    .insert(lists)
    .values({ name: name.trim(), emoji: emoji?.trim() || null })
    .returning({ id: lists.id })
    .get();
  return row.id;
}

export async function deleteList(listId: number): Promise<void> {
  await db.delete(lists).where(eq(lists.id, listId));
}

/** 把某店加入/移出某清单。 */
export async function setListMembership(
  listId: number,
  restaurantId: number,
  member: boolean,
): Promise<void> {
  if (member) {
    await db
      .insert(listItems)
      .values({ listId, restaurantId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(listItems)
      .where(
        and(
          eq(listItems.listId, listId),
          eq(listItems.restaurantId, restaurantId),
        ),
      );
  }
}

/** 某店所在的清单 id 列表。 */
export async function getRestaurantListIds(
  restaurantId: number,
): Promise<number[]> {
  const rows = await db
    .select({ listId: listItems.listId })
    .from(listItems)
    .where(eq(listItems.restaurantId, restaurantId))
    .all();
  return rows.map((r) => r.listId);
}

// ── 标签 ─────────────────────────────────────────────

export async function getRestaurantTags(
  restaurantId: number,
): Promise<string[]> {
  const rows = await db
    .select({ tag: restaurantTags.tag })
    .from(restaurantTags)
    .where(eq(restaurantTags.restaurantId, restaurantId))
    .all();
  return rows.map((r) => r.tag);
}

export async function addTag(
  restaurantId: number,
  tag: string,
): Promise<void> {
  const t = tag.trim();
  if (!t) return;
  await db
    .insert(restaurantTags)
    .values({ restaurantId, tag: t })
    .onConflictDoNothing();
}

export async function removeTag(
  restaurantId: number,
  tag: string,
): Promise<void> {
  await db
    .delete(restaurantTags)
    .where(
      and(
        eq(restaurantTags.restaurantId, restaurantId),
        eq(restaurantTags.tag, tag),
      ),
    );
}

/** 所有出现过的标签 + 使用次数（供筛选下拉）。 */
export async function getAllTags(): Promise<{ tag: string; count: number }[]> {
  const rows = await db
    .select({
      tag: restaurantTags.tag,
      count: sql<number>`COUNT(*)`,
    })
    .from(restaurantTags)
    .groupBy(restaurantTags.tag)
    .all();
  return rows
    .map((r) => ({ tag: r.tag, count: Number(r.count) }))
    .sort((a, b) => b.count - a.count);
}

// ── 列表富化：给 listRestaurants 用的整表映射 ───────────

export async function getListMembershipMap(): Promise<Map<number, number[]>> {
  const rows = await db
    .select({
      restaurantId: listItems.restaurantId,
      listId: listItems.listId,
    })
    .from(listItems)
    .all();
  const m = new Map<number, number[]>();
  for (const r of rows) {
    const a = m.get(r.restaurantId) ?? [];
    a.push(r.listId);
    m.set(r.restaurantId, a);
  }
  return m;
}

export async function getTagsMap(): Promise<Map<number, string[]>> {
  const rows = await db
    .select({
      restaurantId: restaurantTags.restaurantId,
      tag: restaurantTags.tag,
    })
    .from(restaurantTags)
    .all();
  const m = new Map<number, string[]>();
  for (const r of rows) {
    const a = m.get(r.restaurantId) ?? [];
    a.push(r.tag);
    m.set(r.restaurantId, a);
  }
  return m;
}
