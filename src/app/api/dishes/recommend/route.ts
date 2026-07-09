import { NextResponse } from "next/server";
import { getDishRecommendation } from "@/lib/dish-recs";

export const dynamic = "force-dynamic";

/**
 * 「吃什么好」：GET /api/dishes/recommend?restaurantId=1
 * 首次调用会拉 Google 评论 + Claude 提取（约 $0.03），之后走缓存免费。
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const restaurantId = Number(searchParams.get("restaurantId"));
  if (!restaurantId) {
    return NextResponse.json({ error: "缺少 restaurantId" }, { status: 400 });
  }

  try {
    const result = await getDishRecommendation(restaurantId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("GET /api/dishes/recommend failed:", err);
    return NextResponse.json(
      { error: "获取推荐失败", detail: String(err) },
      { status: 500 },
    );
  }
}
