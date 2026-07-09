import { NextResponse } from "next/server";
import { getDuelState, submitDuel } from "@/lib/duel";

export const dynamic = "force-dynamic";

/** 取下一组对决 + 当前排行榜。 */
export async function GET() {
  try {
    const state = await getDuelState();
    return NextResponse.json(state);
  } catch (err) {
    console.error("GET /api/duel failed:", err);
    return NextResponse.json(
      { error: "获取对决失败", detail: String(err) },
      { status: 500 },
    );
  }
}

/** 提交一次对决结果。body: { winnerId, loserId } */
export async function POST(req: Request) {
  let body: { winnerId?: number; loserId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  if (!body.winnerId || !body.loserId) {
    return NextResponse.json(
      { error: "需要 winnerId 和 loserId" },
      { status: 400 },
    );
  }

  try {
    await submitDuel(body.winnerId, body.loserId);
    const state = await getDuelState();
    return NextResponse.json(state);
  } catch (err) {
    console.error("POST /api/duel failed:", err);
    return NextResponse.json(
      { error: "提交失败", detail: String(err) },
      { status: 500 },
    );
  }
}
