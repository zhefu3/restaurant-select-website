import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

/**
 * Drizzle 客户端。
 * 无 Turso 环境变量时回退到本地文件库 file:./local.db，方便本地开发。
 */
const client = createClient({
  // 用 || 而非 ??：.env 里 TURSO_DATABASE_URL= 是空串，也要回退到本地文件库。
  url: process.env.TURSO_DATABASE_URL || "file:./local.db",
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});

export const db = drizzle(client, { schema });
export { schema };
