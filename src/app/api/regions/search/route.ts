import { NextResponse } from "next/server";
import { searchArea, type AreaSearchInput } from "@/lib/travel";
import { CostCapExceededError } from "@/lib/api-usage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 实时查一片区域（城市或定点）并存进地区。body: AreaSearchInput */
export async function POST(req: Request) {
  let body: AreaSearchInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  if (body.mode !== "city" && body.mode !== "point") {
    return NextResponse.json({ error: "mode 必须是 city 或 point" }, { status: 400 });
  }

  try {
    const result = await searchArea(body);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof CostCapExceededError) {
      return NextResponse.json({ error: err.message, capped: true }, { status: 429 });
    }
    console.error("POST /api/regions/search failed:", err);
    return NextResponse.json(
      { error: "搜索失败", detail: String(err) },
      { status: 500 },
    );
  }
}
