import { NextResponse } from "next/server";
import { getAllTags, addTag, removeTag } from "@/lib/lists";

export const dynamic = "force-dynamic";

/** 所有标签 + 次数。 */
export async function GET() {
  try {
    return NextResponse.json({ tags: await getAllTags() });
  } catch (err) {
    return NextResponse.json(
      { error: "读取标签失败", detail: String(err) },
      { status: 500 },
    );
  }
}

/** 给某店加标签。body: { restaurantId, tag } */
export async function POST(req: Request) {
  try {
    const { restaurantId, tag } = await req.json();
    if (!restaurantId || !tag?.trim())
      return NextResponse.json(
        { error: "缺少 restaurantId 或 tag" },
        { status: 400 },
      );
    await addTag(Number(restaurantId), tag);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "加标签失败", detail: String(err) },
      { status: 500 },
    );
  }
}

/** 移除某店的标签。body: { restaurantId, tag } */
export async function DELETE(req: Request) {
  try {
    const { restaurantId, tag } = await req.json();
    if (!restaurantId || !tag)
      return NextResponse.json(
        { error: "缺少 restaurantId 或 tag" },
        { status: 400 },
      );
    await removeTag(Number(restaurantId), tag);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "删标签失败", detail: String(err) },
      { status: 500 },
    );
  }
}
