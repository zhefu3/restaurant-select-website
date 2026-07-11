/**
 * 把本地 local.db 整库（schema + 数据，含照片）复制到目标 libSQL/Turso 数据库。
 *
 * 用法（凭证从环境变量读，绝不出现在命令行里）：
 *   node --env-file=.env scripts/migrate-to-turso.mjs
 * 需要 .env 里有：
 *   TURSO_DATABASE_URL=libsql://xxx.turso.io
 *   TURSO_AUTH_TOKEN=...
 * 本地自测（目标也用本地文件，不碰云）：
 *   MIGRATE_DEST_URL=file:/tmp/test-dest.db node scripts/migrate-to-turso.mjs
 *
 * 做法：目标库先关外键 → 逐表 DROP+CREATE → 建索引 → 分批插入数据。
 * 可重复运行（每次都是干净覆盖）。
 */

import { createClient } from "@libsql/client";

const SRC_URL = process.env.MIGRATE_SRC_URL ?? "file:./local.db";
const DEST_URL = process.env.MIGRATE_DEST_URL ?? process.env.TURSO_DATABASE_URL;
const DEST_TOKEN = process.env.MIGRATE_DEST_TOKEN ?? process.env.TURSO_AUTH_TOKEN;

if (!DEST_URL) {
  console.error(
    "❌ 缺目标库地址。设 TURSO_DATABASE_URL（或本地测试用 MIGRATE_DEST_URL=file:/tmp/x.db）",
  );
  process.exit(1);
}
const destIsRemote = DEST_URL.startsWith("libsql://") || DEST_URL.startsWith("https://");
if (destIsRemote && !DEST_TOKEN) {
  console.error("❌ 远程目标库需要 TURSO_AUTH_TOKEN");
  process.exit(1);
}

const src = createClient({ url: SRC_URL });
const dest = createClient(
  destIsRemote ? { url: DEST_URL, authToken: DEST_TOKEN } : { url: DEST_URL },
);

const BATCH = Number(process.env.MIGRATE_BATCH ?? 40); // 每批插入行数（照片大，别太大）

async function main() {
  // 源库里的表 / 索引（跳过 sqlite 内部对象）
  const tables = (
    await src.execute(
      "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
  ).rows;
  const indexes = (
    await src.execute(
      "SELECT name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL",
    )
  ).rows;

  console.log(`源库：${tables.length} 张表，${indexes.length} 个索引`);

  await dest.execute("PRAGMA foreign_keys=OFF");

  // 1) 表：先全 DROP（倒序），再按序 CREATE
  for (const t of [...tables].reverse()) {
    await dest.execute(`DROP TABLE IF EXISTS "${t.name}"`);
  }
  for (const t of tables) {
    await dest.execute(t.sql);
  }
  // 2) 索引
  for (const idx of indexes) {
    try {
      await dest.execute(idx.sql);
    } catch (e) {
      console.warn(`  索引 ${idx.name} 跳过：${String(e).slice(0, 80)}`);
    }
  }

  // 3) 数据：逐表分批插入
  let grandTotal = 0;
  for (const t of tables) {
    const name = t.name;
    const colsRes = await src.execute(`PRAGMA table_info("${name}")`);
    const cols = colsRes.rows.map((r) => r.name);
    if (!cols.length) continue;

    const all = await src.execute(`SELECT * FROM "${name}"`);
    const rows = all.rows;
    if (!rows.length) {
      console.log(`  ${name}: 0 行`);
      continue;
    }

    const colList = cols.map((c) => `"${c}"`).join(",");
    const placeholders = `(${cols.map(() => "?").join(",")})`;
    const insertSql = `INSERT INTO "${name}" (${colList}) VALUES ${placeholders}`;

    let done = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const stmts = chunk.map((row) => ({
        sql: insertSql,
        args: cols.map((c) => row[c] ?? null),
      }));
      await dest.batch(stmts, "write");
      done += chunk.length;
      process.stdout.write(`\r  ${name}: ${done}/${rows.length}`);
    }
    process.stdout.write("\n");
    grandTotal += done;
  }

  await dest.execute("PRAGMA foreign_keys=ON");

  // 校验：逐表行数对比
  console.log("\n校验行数：");
  let ok = true;
  for (const t of tables) {
    const s = Number((await src.execute(`SELECT count(*) c FROM "${t.name}"`)).rows[0].c);
    const d = Number((await dest.execute(`SELECT count(*) c FROM "${t.name}"`)).rows[0].c);
    const mark = s === d ? "✓" : "✗";
    if (s !== d) ok = false;
    console.log(`  ${mark} ${t.name}: 源 ${s} / 目标 ${d}`);
  }
  console.log(ok ? `\n✅ 迁移完成，共 ${grandTotal} 行，全部一致` : "\n❌ 有表行数不一致");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("迁移失败:", e);
  process.exit(1);
});
