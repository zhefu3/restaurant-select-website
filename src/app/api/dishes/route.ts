import { NextResponse } from "next/server";
import { addDish } from "@/lib/dish-recs";

export const dynamic = "force-dynamic";

/** 记一道菜。body: { restaurantId, name, verdict: again|ok|never, notes? } */
export async function POST(req: Request) {
  let body: {
    restaurantId?: number;
    name?: string;
    verdict?: "again" | "ok" | "never";
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const { restaurantId, name, verdict } = body;
  if (!restaurantId || !name?.trim() || !verdict) {
    return NextResponse.json(
      { error: "需要 restaurantId、name、verdict" },
      { status: 400 },
    );
  }

  try {
    await addDish(restaurantId, name.trim(), verdict, body.notes);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/dishes failed:", err);
    return NextResponse.json(
      { error: "记录失败", detail: String(err) },
      { status: 500 },
    );
  }
}
