/** Telegram bot：发消息 + 把 Agent 回复格式化成纯文本。 */

import "server-only";
import { googleMapsUrl } from "./types";
import type { ChatResult } from "./chat-agent";

const API = "https://api.telegram.org";

function botToken(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN 未配置");
  return t;
}

/** 给某个 chat 发一条消息。 */
export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
): Promise<void> {
  const res = await fetch(`${API}/bot${botToken()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    console.error("Telegram sendMessage 失败", res.status, await res.text());
  }
}

/** 把 Agent 的 {reply, recommendations} 拼成一条 Telegram 文本（含 Google Maps 链接）。 */
export function formatReply(r: ChatResult): string {
  let out = r.reply;
  if (r.recommendations.length) {
    out += "\n";
    for (const x of r.recommendations.slice(0, 6)) {
      const bits = [
        x.rating != null ? `⭐${x.rating}` : null,
        x.distanceKm != null ? `🏠${x.distanceKm.toFixed(1)}km` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      out += `\n\n🍽 ${x.name}${bits ? " · " + bits : ""}\n${googleMapsUrl(x)}`;
    }
  }
  return out;
}
