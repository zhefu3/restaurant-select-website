import { NextResponse } from "next/server";
import { listRestaurants } from "@/lib/restaurants";
import type { RestaurantSource, VisitFilter } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const visit = (searchParams.get("visit") ?? "all") as VisitFilter;
  const source = searchParams.get("source") as RestaurantSource | null;
  const regionParam = searchParams.get("regionId");
  const regionId = regionParam ? Number(regionParam) : undefined;
  // home 地区（isHome=1）连带纳入 region_id 为空的旧数据
  const includeNullRegion = searchParams.get("isHome") === "1";
  const onlyHidden = searchParams.get("onlyHidden") === "1";

  try {
    const data = await listRestaurants({
      visit,
      source: source ?? undefined,
      regionId,
      includeNullRegion,
      onlyHidden,
    });
    return NextResponse.json({ restaurants: data });
  } catch (err) {
    console.error("GET /api/restaurants failed:", err);
    return NextResponse.json(
      { error: "读取餐厅失败", detail: String(err) },
      { status: 500 },
    );
  }
}
