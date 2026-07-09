/**
 * 只读演示模式。
 *
 * 目标：把这个网站放到个人网站上做 demo，别人能自由浏览（地图/列表/筛选/看菜单点评/
 * 小红书笔记等**已缓存**的数据），但**不能触发任何花钱的 API 调用，也不能改我的数据**。
 *
 * 两道闸：
 *  1) 服务端硬闸（`middleware.ts` 用 `demoBlocks`）：`DEMO_MODE=1` 时拦掉所有写请求 +
 *     会花钱的读请求。这是安全保证，前端即使漏了某个按钮也烧不到钱。
 *  2) 前端软闸（`PUBLIC_DEMO`）：把花钱/写入的入口直接藏起来，demo 看着干净。
 */

// 会花钱的「读」接口（GET 但内部会调 Google/Anthropic）。其余 GET 都是纯查库，放行。
const PAID_GET_PREFIXES = [
  "/api/dishes/recommend", // Places reviews + Claude 挖招牌菜
  "/api/regions/search", // 覆盖 search 与 search-route：Places/Geocoding/Routes
];

/**
 * 只读演示下是否应拦截该请求。纯函数，便于单测。
 * 规则：非 GET（写操作）全拦；GET 里命中 PAID_GET_PREFIXES 的拦；其余放行。
 */
export function demoBlocks(method: string, pathname: string): boolean {
  if (!pathname.startsWith("/api/")) return false;
  if (method.toUpperCase() !== "GET") return true;
  return PAID_GET_PREFIXES.some((p) => pathname.startsWith(p));
}

/** 客户端：是否公开只读演示（构建期注入 `NEXT_PUBLIC_DEMO_MODE`）。 */
export const PUBLIC_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "1";

/** 被拦截时返回给前端的提示。 */
export const DEMO_MESSAGE =
  "🔒 只读演示：写入与会消耗 API 的功能已关闭，数据可自由浏览。";
