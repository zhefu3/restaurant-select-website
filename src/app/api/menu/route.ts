import { NextResponse } from "next/server";
import { saveMenu } from "@/lib/menu-review";
import type { ImageMediaType } from "@/lib/anthropic";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED: ImageMediaType[] = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

/** 上传菜单（照片或文字）→ AI 归纳翻译。body: { restaurantId, text? | imageBase64+mediaType } */
export async function POST(req: Request) {
  let body: {
    restaurantId?: number;
    text?: string;
    imageBase64?: string;
    mediaType?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  if (!body.restaurantId) {
    return NextResponse.json({ error: "缺少 restaurantId" }, { status: 400 });
  }
  if (body.imageBase64 && !ALLOWED.includes(body.mediaType as ImageMediaType)) {
    return NextResponse.json(
      { error: `不支持的图片类型：${body.mediaType}` },
      { status: 400 },
    );
  }
  if (!body.imageBase64 && !body.text?.trim()) {
    return NextResponse.json({ error: "需要 text 或图片" }, { status: 400 });
  }

  try {
    const sections = await saveMenu(body.restaurantId, {
      text: body.text,
      imageBase64: body.imageBase64,
      mediaType: body.mediaType as ImageMediaType | undefined,
    });
    if (sections.length === 0) {
      return NextResponse.json(
        { error: "没识别到菜品，换清晰点的图或贴文字试试。" },
        { status: 422 },
      );
    }
    return NextResponse.json({ sections });
  } catch (err) {
    console.error("POST /api/menu failed:", err);
    return NextResponse.json(
      { error: "菜单识别失败", detail: String(err) },
      { status: 500 },
    );
  }
}
