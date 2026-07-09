/**
 * `npm run discover` — 手动跑一次区域发现。
 *
 * 这是手动触发的一次性任务，**不是 cron**。想重刷时再手动跑。
 * 环境变量：GOOGLE_PLACES_API_KEY、（可选）TURSO_* 。
 *
 * 用法：
 *   npm run discover              # 跑全部区域网格点
 *   npm run discover -- --limit 5 # 只跑前 5 个点（省钱调试）
 */

import "dotenv/config";
import { discoverRestaurants } from "@/collectors/restaurants/discover";
import { regionGridPoints } from "@/lib/geo";
import { usageSummary } from "@/lib/api-usage";

function parseLimit(): number | undefined {
  const idx = process.argv.indexOf("--limit");
  if (idx !== -1 && process.argv[idx + 1]) return Number(process.argv[idx + 1]);
  return undefined;
}

async function main() {
  const limit = parseLimit();
  const total = regionGridPoints().length;

  console.log("🍜 Athroics 区域发现");
  console.log(`   区域内网格点：${total}${limit ? `（本次只跑前 ${limit} 个）` : ""}`);

  const before = await usageSummary();
  console.log(
    `   Google Places 本月已花费：$${before.spend.toFixed(2)} / $${before.cap}`,
  );
  console.log("");

  const report = await discoverRestaurants({
    limitPoints: limit,
    onProgress: (done, all) => {
      process.stdout.write(`\r   进度：${done}/${all} 个网格点`);
    },
  });

  const after = await usageSummary();

  console.log("\n");
  console.log("✅ 完成");
  console.table({
    网格点: report.gridPoints,
    原始返回: report.rawResults,
    去重后: report.uniquePlaces,
    达标数: report.passedFilter,
    新增入库: report.inserted,
    触发熔断: report.capHit ? "是" : "否",
  });
  console.log(
    `   本次花费约 $${(after.spend - before.spend).toFixed(2)}，` +
      `本月累计 $${after.spend.toFixed(2)} / $${after.cap}`,
  );

  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ 发现失败：", err);
  process.exit(1);
});
