import { NextResponse } from "next/server";
import {
  streamChatAgent,
  assertChatBudget,
  type ChatTurnInput,
} from "@/lib/chat-agent";
import {
  createConversation,
  appendMessage,
} from "@/lib/conversations";
import { CostCapExceededError } from "@/lib/api-usage";
import type { RestaurantView } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 对话选餐 Agent（流式）。body: { messages, enableWrites?, conversationId? }
 * 返回 NDJSON 流：每行一个事件（conversation/delta/status/recommendations/action/done）。
 * 预算超限在开流前返回 429 JSON。会话写库只在 owner 模式发生（demo 的 POST 已被中间件拦）。
 */
export async function POST(req: Request) {
  let body: {
    messages?: ChatTurnInput[];
    enableWrites?: boolean;
    conversationId?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages 为空" }, { status: 400 });
  }

  // 开流前先查预算：超了就用 429 明确告诉前端（开流后只能发 200）。
  try {
    await assertChatBudget();
  } catch (err) {
    if (err instanceof CostCapExceededError) {
      return NextResponse.json(
        { error: err.message, capped: true },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: "预检失败", detail: String(err) },
      { status: 500 },
    );
  }

  const lastUser = messages[messages.length - 1];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      // 会话持久化（尽力而为，失败不影响聊天）
      let convId = body.conversationId ?? null;
      try {
        if (convId == null) convId = await createConversation(lastUser.content);
        if (lastUser.role === "user")
          await appendMessage(convId, "user", lastUser.content);
        send({ type: "conversation", id: convId });
      } catch (e) {
        console.error("persist user msg failed:", e);
        convId = null; // 后面就不再尝试写库
      }

      let reply = "";
      let recs: RestaurantView[] = [];
      try {
        for await (const ev of streamChatAgent(messages, {
          enableWrites: Boolean(body.enableWrites),
        })) {
          if (ev.type === "done") reply = ev.reply;
          else if (ev.type === "recommendations") recs = ev.items;
          send(ev);
        }
      } catch (err) {
        console.error("stream chat failed:", err);
        send({ type: "error", message: String(err) });
      }

      // 存 assistant 回复
      if (convId != null && reply) {
        try {
          await appendMessage(convId, "assistant", reply, recs);
        } catch (e) {
          console.error("persist assistant msg failed:", e);
        }
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
