import { NextResponse } from "next/server";
import { getRestaurantExtra } from "@/lib/menu-review";

export const dynamic = "force-dynamic";

/** 取某店的菜单 + 我的点评。GET ?restaurantId= */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const restaurantId = Number(searchParams.get("restaurantId"));
  if (!restaurantId) {
    return NextResponse.json({ error: "缺少 restaurantId" }, { status: 400 });
  }
  try {
    const extra = await getRestaurantExtra(restaurantId);
    return NextResponse.json(extra);
  } catch (err) {
    console.error("GET /api/restaurant-extra failed:", err);
    return NextResponse.json(
      { error: "读取失败", detail: String(err) },
      { status: 500 },
    );
  }
}
