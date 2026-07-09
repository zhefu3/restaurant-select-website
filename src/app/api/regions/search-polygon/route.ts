import { NextResponse } from "next/server";
import { searchPolygon, type PolygonSearchInput } from "@/lib/travel";
import { CostCapExceededError } from "@/lib/api-usage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 多边形圈选搜索（②B）。body: PolygonSearchInput（points ≥3） */
export async function POST(req: Request) {
  let body: PolygonSearchInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }
  if (!Array.isArray(body.points) || body.points.length < 3) {
    return NextResponse.json(
      { error: "至少画 3 个点圈出一片区域" },
      { status: 400 },
    );
  }

  try {
    const result = await searchPolygon(body);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof CostCapExceededError) {
      return NextResponse.json(
        { error: "本月圈选搜索预算已用完（$5）", capped: true },
        { status: 429 },
      );
    }
    console.error("POST /api/regions/search-polygon failed:", err);
    return NextResponse.json(
      { error: "搜索失败", detail: String(err) },
      { status: 500 },
    );
  }
}
