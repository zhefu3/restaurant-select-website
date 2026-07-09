import { NextResponse } from "next/server";
import { applyProposedAction } from "@/lib/agent-actions";
import type { ProposedAction } from "@/lib/chat-agent";

export const dynamic = "force-dynamic";

/**
 * 执行 Agent 提议、用户已点确认的写操作。body: { action: ProposedAction }
 * demo 模式下这是 POST，会被中间件直接 403。
 */
export async function POST(req: Request) {
  let body: { action?: ProposedAction };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const action = body.action;
  if (!action || typeof action !== "object" || !("kind" in action)) {
    return NextResponse.json({ error: "缺少 action" }, { status: 400 });
  }
  if (!("restaurantId" in action) || !action.restaurantId) {
    return NextResponse.json({ error: "缺少 restaurantId" }, { status: 400 });
  }

  try {
    await applyProposedAction(action);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/agent/act failed:", err);
    return NextResponse.json(
      { error: "操作失败", detail: String(err) },
      { status: 500 },
    );
  }
}
