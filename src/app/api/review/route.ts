import { NextResponse } from "next/server";
import { saveReview } from "@/lib/menu-review";

export const dynamic = "force-dynamic";

/** 写/改我的点评。body: { restaurantId, body } */
export async function POST(req: Request) {
  let body: { restaurantId?: number; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }
  if (!body.restaurantId || typeof body.body !== "string") {
    return NextResponse.json(
      { error: "需要 restaurantId 和 body" },
      { status: 400 },
    );
  }
  try {
    await saveReview(body.restaurantId, body.body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/review failed:", err);
    return NextResponse.json(
      { error: "保存失败", detail: String(err) },
      { status: 500 },
    );
  }
}
