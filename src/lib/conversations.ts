/**
 * 对话选餐 Agent 的会话持久化。
 * 只在 owner 模式写（demo 模式 /api/chat 是 POST，被中间件拦掉，走不到这里）。
 */

import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, chatMessages } from "@/db/schema";
import type { RestaurantView } from "./types";

export interface StoredMsg {
  role: "user" | "assistant";
  content: string;
  recommendations?: RestaurantView[];
}

/** 新建一段会话，title 取首条用户消息前 30 字。返回 id。 */
export async function createConversation(firstUserText: string): Promise<number> {
  const title = firstUserText.trim().slice(0, 30) || "新对话";
  const row = await db
    .insert(conversations)
    .values({ title })
    .returning({ id: conversations.id })
    .get();
  return row.id;
}

/** 往会话里追加一条消息。 */
export async function appendMessage(
  conversationId: number,
  role: "user" | "assistant",
  content: string,
  recommendations?: RestaurantView[],
): Promise<void> {
  await db.insert(chatMessages).values({
    conversationId,
    role,
    content,
    recommendations:
      recommendations && recommendations.length
        ? JSON.stringify(recommendations)
        : null,
  });
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

/** 取某会话的全部消息（按时间正序）。 */
export async function getMessages(conversationId: number): Promise<StoredMsg[]> {
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(chatMessages.id)
    .all();
  return rows.map((r) => ({
    role: r.role as "user" | "assistant",
    content: r.content,
    recommendations: r.recommendations
      ? (JSON.parse(r.recommendations) as RestaurantView[])
      : undefined,
  }));
}

/** 最近一段会话（含消息）；没有则返回 null。 */
export async function getRecentConversation(): Promise<{
  id: number;
  messages: StoredMsg[];
} | null> {
  const conv = await db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.updatedAt))
    .limit(1)
    .get();
  if (!conv) return null;
  return { id: conv.id, messages: await getMessages(conv.id) };
}
