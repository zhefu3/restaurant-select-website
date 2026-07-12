/**
 * 连锁店折叠：把同名的多家分店（如多家 In-N-Out）合并成一个可展开的组，
 * 让搜索结果不被连锁刷屏。纯前端、零成本。
 */

import type { RestaurantView } from "./types";

export interface ChainEntry {
  kind: "chain";
  name: string;
  branches: RestaurantView[];
}
export interface SingleEntry {
  kind: "single";
  r: RestaurantView;
}
export type ListEntry = ChainEntry | SingleEntry;

/**
 * 把（已排序的）列表按同名连锁折叠。
 * - 同名出现 ≥2 次 → 合并成一个 chain 组，组出现在其第一家分店的排序位置。
 * - 只出现 1 次的 → 保持单店。
 * 保序：不打乱原有排序，只是把散落的同名分店收拢到第一家的位置。
 */
export function groupChains(sorted: RestaurantView[]): ListEntry[] {
  const counts = new Map<string, number>();
  for (const r of sorted) counts.set(r.name, (counts.get(r.name) ?? 0) + 1);

  const entries: ListEntry[] = [];
  const idxByName = new Map<string, number>();
  for (const r of sorted) {
    if ((counts.get(r.name) ?? 0) >= 2) {
      const i = idxByName.get(r.name);
      if (i == null) {
        idxByName.set(r.name, entries.length);
        entries.push({ kind: "chain", name: r.name, branches: [r] });
      } else {
        (entries[i] as ChainEntry).branches.push(r);
      }
    } else {
      entries.push({ kind: "single", r });
    }
  }
  return entries;
}

/** 当前（已排序）列表里存在的连锁数量——用来决定「合并连锁」开关值不值得显示。 */
export function countChains(sorted: RestaurantView[]): number {
  const counts = new Map<string, number>();
  for (const r of sorted) counts.set(r.name, (counts.get(r.name) ?? 0) + 1);
  let n = 0;
  for (const c of counts.values()) if (c >= 2) n++;
  return n;
}
