import { NextResponse } from "next/server";
import { getLists, createList, deleteList } from "@/lib/lists";

export const dynamic = "force-dynamic";

/** 所有清单 + 店数。 */
export async function GET() {
  try {
    return NextResponse.json({ lists: await getLists() });
  } catch (err) {
    return NextResponse.json(
      { error: "读取清单失败", detail: String(err) },
      { status: 500 },
    );
  }
}

/** 新建清单。body: { name, emoji? } */
export async function POST(req: Request) {
  try {
    const { name, emoji } = await req.json();
    if (!name?.trim())
      return NextResponse.json({ error: "清单名为空" }, { status: 400 });
    const id = await createList(name, emoji);
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return NextResponse.json(
      { error: "新建失败", detail: String(err) },
      { status: 500 },
    );
  }
}

/** 删除清单。body: { listId } */
export async function DELETE(req: Request) {
  try {
    const { listId } = await req.json();
    if (!listId)
      return NextResponse.json({ error: "缺少 listId" }, { status: 400 });
    await deleteList(Number(listId));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "删除失败", detail: String(err) },
      { status: 500 },
    );
  }
}
