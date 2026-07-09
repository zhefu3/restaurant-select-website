import { NextResponse } from "next/server";
import { setHidden } from "@/lib/restaurants";

export const dynamic = "force-dynamic";

/** 拉黑/恢复某店。body: { restaurantId, hidden } */
export async function POST(req: Request) {
  try {
    const { restaurantId, hidden } = await req.json();
    if (!restaurantId)
      return NextResponse.json({ error: "缺少 restaurantId" }, { status: 400 });
    await setHidden(Number(restaurantId), Boolean(hidden));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "操作失败", detail: String(err) },
      { status: 500 },
    );
  }
}
