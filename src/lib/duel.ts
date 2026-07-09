/**
 * 两两对决排位（Beli 式）。
 *
 * 星级的问题：吃多了全是 4 星，区分不开。二选一 + Elo 能拉开真实偏好差距。
 * 只有「去过」的店参与排位。Elo 从 1000 起步，K=32，按对决时间顺序重放计算。
 */

import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { duels, restaurants, visits } from "@/db/schema";

const BASE_ELO = 1000;
const K = 32;

export interface RankedRestaurant {
  id: number;
  name: string;
  cuisine: string | null;
  elo: number;
  wins: number;
  losses: number;
  duelCount: number;
}

export interface DuelState {
  /** 下一组对决（不足两家去过的店时为 null）。 */
  pair: [RankedRestaurant, RankedRestaurant] | null;
  /** 当前排行榜（按 Elo 降序，含未出场的）。 */
  rankings: RankedRestaurant[];
  visitedCount: number;
}

async function computeState(): Promise<{
  ranked: Map<number, RankedRestaurant>;
  visitedCount: number;
}> {
  // 去过的店（有 visits 记录）
  const visited = await db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      cuisine: restaurants.cuisine,
    })
    .from(restaurants)
    .innerJoin(visits, eq(visits.restaurantId, restaurants.id))
    .groupBy(restaurants.id)
    .all();

  const ranked = new Map<number, RankedRestaurant>(
    visited.map((v) => [
      v.id,
      { ...v, elo: BASE_ELO, wins: 0, losses: 0, duelCount: 0 },
    ]),
  );

  // 重放全部对决算 Elo
  const allDuels = await db
    .select()
    .from(duels)
    .orderBy(asc(duels.createdAt), asc(duels.id))
    .all();

  for (const d of allDuels) {
    const w = ranked.get(d.winnerId);
    const l = ranked.get(d.loserId);
    if (!w || !l) continue; // 店可能已被删
    const expectedW = 1 / (1 + 10 ** ((l.elo - w.elo) / 400));
    w.elo += K * (1 - expectedW);
    l.elo -= K * (1 - expectedW);
    w.wins++;
    l.losses++;
    w.duelCount++;
    l.duelCount++;
  }

  return { ranked, visitedCount: visited.length };
}

export async function getDuelState(): Promise<DuelState> {
  const { ranked, visitedCount } = await computeState();
  const list = [...ranked.values()];

  const rankings = [...list].sort((a, b) => b.elo - a.elo);

  // 选下一组：优先出场次数少的（让每家都被排到），同场次里随机。
  let pair: DuelState["pair"] = null;
  if (list.length >= 2) {
    const sorted = [...list].sort(
      (a, b) => a.duelCount - b.duelCount || Math.random() - 0.5,
    );
    pair = [sorted[0], sorted[1]];
  }

  return { pair, rankings, visitedCount };
}

export async function submitDuel(
  winnerId: number,
  loserId: number,
): Promise<void> {
  if (winnerId === loserId) throw new Error("winner 和 loser 不能相同");
  await db.insert(duels).values({ winnerId, loserId });
}

/** 每家店的当前排名（1 起）。给列表页显示 #N 徽章用。 */
export async function getRankMap(): Promise<Record<number, number>> {
  const { ranked } = await computeState();
  const sorted = [...ranked.values()]
    .filter((r) => r.duelCount > 0)
    .sort((a, b) => b.elo - a.elo);
  const map: Record<number, number> = {};
  sorted.forEach((r, i) => {
    map[r.id] = i + 1;
  });
  return map;
}
