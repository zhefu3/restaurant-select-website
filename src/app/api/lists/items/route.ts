import { NextResponse } from "next/server";
import { setListMembership } from "@/lib/lists";

export const dynamic = "force-dynamic";

/** 把某店加入/移出某清单。body: { listId, restaurantId, member } */
export async function POST(req: Request) {
  try {
    const { listId, restaurantId, member } = await req.json();
    if (!listId || !restaurantId)
      return NextResponse.json(
        { error: "缺少 listId 或 restaurantId" },
        { status: 400 },
      );
    await setListMembership(
      Number(listId),
      Number(restaurantId),
      Boolean(member),
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "操作失败", detail: String(err) },
      { status: 500 },
    );
  }
}
