import { NextResponse } from "next/server";
import { setWantToEat } from "@/lib/restaurants";

export const dynamic = "force-dynamic";

/** 切换「想去吃」。body: { restaurantId, want: boolean } */
export async function POST(req: Request) {
  let body: { restaurantId?: number; want?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  if (!body.restaurantId || typeof body.want !== "boolean") {
    return NextResponse.json(
      { error: "需要 restaurantId 和 want" },
      { status: 400 },
    );
  }

  try {
    await setWantToEat(body.restaurantId, body.want);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/wishlist failed:", err);
    return NextResponse.json(
      { error: "操作失败", detail: String(err) },
      { status: 500 },
    );
  }
}
