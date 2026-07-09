import { NextResponse } from "next/server";
import { runChatAgent } from "@/lib/chat-agent";
import { sendTelegramMessage, formatReply } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Telegram webhook：收到消息 → 跑选餐 Agent（复用 chat-agent）→ 回复。
 * 无状态（每条消息独立一问）。
 * 安全：注册 webhook 时设 secret_token，Telegram 会带在 header 里，这里校验。
 * 部署：需公网 HTTPS（Vercel）+ TELEGRAM_BOT_TOKEN；注册 webhook 见 README。
 */
export async function POST(req: Request) {
  // 校验来自 Telegram（注册 webhook 时设的 secret）。
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== secret) return new Response("forbidden", { status: 403 });
  }

  let update: {
    message?: { text?: string; chat?: { id?: number } };
  };
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const text = update.message?.text?.trim();
  const chatId = update.message?.chat?.id;
  // 非文本消息（贴纸/图片/加群事件等）直接忽略。
  if (!text || chatId == null) return NextResponse.json({ ok: true });

  try {
    if (text === "/start" || text === "/help") {
      await sendTelegramMessage(
        chatId,
        "👋 我是你的选餐助理。直接问我就行，比如：\n· 今晚想吃辣的，离家近的\n· 有什么高分日料\n· 推荐几家没去过的想去吃的店",
      );
      return NextResponse.json({ ok: true });
    }
    const result = await runChatAgent([{ role: "user", content: text }]);
    await sendTelegramMessage(chatId, formatReply(result));
  } catch (err) {
    console.error("telegram handler failed:", err);
    try {
      await sendTelegramMessage(chatId, "出错了，稍后再试～");
    } catch {
      /* 忽略 */
    }
  }
  // Telegram 只看 200；处理已在上面完成。
  return NextResponse.json({ ok: true });
}
