import { NextResponse } from "next/server";
import { searchRoute, type RouteSearchInput } from "@/lib/travel-route";
import { CostCapExceededError } from "@/lib/api-usage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 沿路线找餐厅：起点/终点地名 → 真实驾车路线 → 沿途餐厅入库。body: { from, to } */
export async function POST(req: Request) {
  let body: RouteSearchInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  if (!body.from?.trim() || !body.to?.trim()) {
    return NextResponse.json({ error: "需要 from 和 to" }, { status: 400 });
  }

  try {
    const result = await searchRoute(body);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof CostCapExceededError) {
      return NextResponse.json({ error: err.message, capped: true }, { status: 429 });
    }
    console.error("POST /api/regions/search-route failed:", err);
    return NextResponse.json(
      { error: "路线搜索失败", detail: String(err) },
      { status: 500 },
    );
  }
}
