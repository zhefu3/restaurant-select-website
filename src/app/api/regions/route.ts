import { NextResponse } from "next/server";
import { listRegions, deleteRegion } from "@/lib/travel";

export const dynamic = "force-dynamic";

/** 列出所有地区 + 餐厅数。 */
export async function GET() {
  try {
    const regions = await listRegions();
    return NextResponse.json({ regions });
  } catch (err) {
    console.error("GET /api/regions failed:", err);
    return NextResponse.json(
      { error: "读取地区失败", detail: String(err) },
      { status: 500 },
    );
  }
}

/** 删除旅行地区。body: { regionId } */
export async function DELETE(req: Request) {
  let body: { regionId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }
  if (!body.regionId) {
    return NextResponse.json({ error: "缺少 regionId" }, { status: 400 });
  }
  try {
    await deleteRegion(body.regionId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "删除失败", detail: String(err) },
      { status: 400 },
    );
  }
}
