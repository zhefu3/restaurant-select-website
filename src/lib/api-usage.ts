/**
 * API 花费跟踪 + 硬熔断。
 *
 * 每次调用付费 API 前先 assertUnderCap()，调用后 recordUsage()。
 * Google Places 月度花费超过 $180（可配）即抛错，阻止继续烧钱。
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { apiUsage } from "@/db/schema";
import { costConfig } from "./config";

/** Google Places 各接口单价（美元/次）。SKU 价格可能变动，接入前以官方为准。 */
export const PLACES_UNIT_COST = {
  nearbySearch: 0.032, // Nearby Search (Basic)
  placeDetails: 0.017, // Place Details (Basic)
  placeDetailsReviews: 0.025, // Place Details 含 reviews 字段（高阶 SKU，以官方为准）
  textSearch: 0.032, // Text Search (Basic)
  findPlace: 0.017, // Find Place
  geocoding: 0.005, // Geocoding API
  computeRoutes: 0.005, // Routes API computeRoutes（Basic）
  placeDetailsPhotos: 0.017, // Place Details 取 photos 字段（拿照片资源名）
  placePhoto: 0.007, // Place Photo（取图片字节）
} as const;

export type PlacesOp = keyof typeof PLACES_UNIT_COST;

/**
 * Anthropic 各模型单价（美元 / 百万 token）。Sonnet 5 用促销价（到 2026-08-31）。
 * 价格可能变动，以官方为准。
 */
export const ANTHROPIC_PRICE = {
  "claude-sonnet-5": { input: 2.0, output: 10.0 },
  "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0 },
} as const;

export interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/** 由 token 用量算美元花费。缓存读 ~0.1x、缓存写 ~1.25x。 */
export function anthropicCost(
  model: keyof typeof ANTHROPIC_PRICE,
  usage: TokenUsage,
): number {
  const p = ANTHROPIC_PRICE[model];
  const inp = usage.input_tokens ?? 0;
  const out = usage.output_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  return (
    ((inp + cacheWrite * 1.25 + cacheRead * 0.1) * p.input + out * p.output) /
    1_000_000
  );
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

export class CostCapExceededError extends Error {
  constructor(
    public readonly api: string,
    public readonly spend: number,
    public readonly cap: number,
  ) {
    super(
      `成本熔断：${api} 本月已花费 $${spend.toFixed(2)}，达到上限 $${cap}。停止调用。`,
    );
    this.name = "CostCapExceededError";
  }
}

async function getSpend(api: string, month: string): Promise<number> {
  const row = await db
    .select()
    .from(apiUsage)
    .where(and(eq(apiUsage.api, api), eq(apiUsage.month, month)))
    .get();
  return row?.spend ?? 0;
}

/**
 * 确认再花 `nextCost` 美元不会超过熔断上限。超了就抛 CostCapExceededError。
 */
export async function assertUnderCap(
  api: string,
  nextCost: number,
  cap: number = costConfig.googlePlacesMonthlyCapUsd,
): Promise<void> {
  const spend = await getSpend(api, currentMonth());
  if (spend + nextCost > cap) {
    throw new CostCapExceededError(api, spend, cap);
  }
}

/** 记录一次调用的花费与次数（按 api+month upsert）。 */
export async function recordUsage(
  api: string,
  cost: number,
  requests = 1,
): Promise<void> {
  const month = currentMonth();
  await db
    .insert(apiUsage)
    .values({ api, month, spend: cost, requestCount: requests })
    .onConflictDoUpdate({
      target: [apiUsage.api, apiUsage.month],
      set: {
        spend: sql`${apiUsage.spend} + ${cost}`,
        requestCount: sql`${apiUsage.requestCount} + ${requests}`,
      },
    });
}

/** 当前月度花费概览（供 UI / 脚本展示）。 */
export async function usageSummary(api = "google_places") {
  const month = currentMonth();
  const spend = await getSpend(api, month);
  return {
    api,
    month,
    spend,
    cap: costConfig.googlePlacesMonthlyCapUsd,
    remaining: costConfig.googlePlacesMonthlyCapUsd - spend,
  };
}
