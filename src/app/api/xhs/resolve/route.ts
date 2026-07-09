import { NextResponse } from "next/server";
import { resolveXhsCandidate, rejectXhsCandidate } from "@/lib/restaurants";
import type { PlaceResult } from "@/lib/google-places";

export const dynamic = "force-dynamic";

/**
 * 确认或拒绝一个小红书候选。
 * body: { captureId, action: "resolve"|"reject", place? }
 */
export async function POST(req: Request) {
  let body: {
    captureId?: number;
    action?: "resolve" | "reject";
    place?: PlaceResult;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  if (!body.captureId || !body.action) {
    return NextResponse.json(
      { error: "缺少 captureId 或 action" },
      { status: 400 },
    );
  }

  try {
    if (body.action === "reject") {
      await rejectXhsCandidate(body.captureId);
      return NextResponse.json({ ok: true });
    }

    if (!body.place) {
      return NextResponse.json(
        { error: "resolve 需要 place" },
        { status: 400 },
      );
    }
    const restaurantId = await resolveXhsCandidate(body.captureId, body.place);
    return NextResponse.json({ ok: true, restaurantId });
  } catch (err) {
    console.error("POST /api/xhs/resolve failed:", err);
    return NextResponse.json(
      { error: "处理失败", detail: String(err) },
      { status: 500 },
    );
  }
}
