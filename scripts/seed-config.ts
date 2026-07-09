/**
 * `npm run db:seed` — 把 config.ts 里的默认偏好写进 config 表。
 * 数据库建好后跑一次即可；改了锚点/阈值可再跑（幂等 upsert）。
 */

import "dotenv/config";
import { db } from "@/db";
import { config } from "@/db/schema";
import { ANCHORS, restaurantConfig, costConfig } from "@/lib/config";

const entries: Record<string, unknown> = {
  anchors: ANCHORS,
  restaurant: restaurantConfig,
  cost: costConfig,
};

async function main() {
  for (const [key, value] of Object.entries(entries)) {
    await db
      .insert(config)
      .values({ key, value: JSON.stringify(value) })
      .onConflictDoUpdate({
        target: config.key,
        set: { value: JSON.stringify(value) },
      });
    console.log(`  ✓ seeded config.${key}`);
  }
  console.log("✅ config 表已初始化");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ seed 失败：", err);
  process.exit(1);
});
