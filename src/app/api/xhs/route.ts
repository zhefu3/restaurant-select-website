import { NextResponse } from "next/server";
import { ingestXhsText, ingestXhsImage } from "@/lib/restaurants";
import type { ImageMediaType } from "@/lib/anthropic";

export const dynamic = "force-dynamic";

const ALLOWED_MEDIA: ImageMediaType[] = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

/**
 * 粘贴框提交：文本或截图 → 提取店名 → Places 反查 → 返回候选让前端确认。
 * body: { text } 或 { imageBase64, mediaType }
 */
export async function POST(req: Request) {
  let body: { text?: string; imageBase64?: string; mediaType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  try {
    // 截图模式
    if (body.imageBase64) {
      const mediaType = body.mediaType as ImageMediaType;
      if (!ALLOWED_MEDIA.includes(mediaType)) {
        return NextResponse.json(
          { error: `不支持的图片类型：${body.mediaType}` },
          { status: 400 },
        );
      }
      const result = await ingestXhsImage(body.imageBase64, mediaType);
      return NextResponse.json(result);
    }

    // 文本 / 链接模式
    const text = body.text?.trim();
    if (!text) {
      return NextResponse.json({ error: "文本为空" }, { status: 400 });
    }
    const result = await ingestXhsText(text);
    return NextResponse.json(result);
  } catch (err) {
    console.error("POST /api/xhs failed:", err);
    return NextResponse.json(
      { error: "提取失败", detail: String(err) },
      { status: 500 },
    );
  }
}
