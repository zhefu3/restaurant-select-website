import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { demoBlocks, DEMO_MESSAGE } from "@/lib/demo";

/**
 * 只读演示硬闸：DEMO_MODE=1 时，拦掉写请求 + 会花钱的读请求，返回 403。
 * 这是「别人用我的 demo 不能烧我 API」的安全保证——不依赖前端有没有藏按钮。
 */
export function middleware(req: NextRequest) {
  if (
    process.env.DEMO_MODE === "1" &&
    demoBlocks(req.method, req.nextUrl.pathname)
  ) {
    return NextResponse.json(
      { error: "demo", demo: true, message: DEMO_MESSAGE },
      { status: 403 },
    );
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
