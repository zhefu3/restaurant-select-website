import { NextResponse } from "next/server";
import { getRecentConversation } from "@/lib/conversations";

export const dynamic = "force-dynamic";

/** 最近一段会话（含消息），供聊天窗打开时还原。没有则 { conversation: null }。 */
export async function GET() {
  try {
    const conv = await getRecentConversation();
    return NextResponse.json({ conversation: conv });
  } catch (err) {
    console.error("GET /api/conversations/recent failed:", err);
    return NextResponse.json({ conversation: null });
  }
}
