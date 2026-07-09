import { NextResponse } from "next/server";
import { addVisit } from "@/lib/restaurants";

export const dynamic = "force-dynamic";

/** 记一次到访。body: { restaurantId, rating?(0-100), notes? }。不带 rating = 只标去过。 */
export async function POST(req: Request) {
  let body: { restaurantId?: number; rating?: number | null; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const { restaurantId, rating, notes } = body;
  if (!restaurantId) {
    return NextResponse.json({ error: "需要 restaurantId" }, { status: 400 });
  }
  if (rating != null && (rating < 0 || rating > 100)) {
    return NextResponse.json({ error: "rating 需在 0–100" }, { status: 400 });
  }

  try {
    await addVisit(restaurantId, rating ?? null, notes);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/visits failed:", err);
    return NextResponse.json(
      { error: "记录失败", detail: String(err) },
      { status: 500 },
    );
  }
}
