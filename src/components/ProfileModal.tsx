"use client";

/** 「我的美食档案」：当前地区 + 个人层的多维统计概览（零成本，纯客户端）。 */

import { useMemo } from "react";
import { cuisineGroup, cuisineLabel, GROUP_EMOJI, GROUP_COLOR } from "@/lib/cuisine";
import { isRecommended, type RestaurantView } from "@/lib/types";
import { useEscape } from "@/lib/use-escape";

interface RegionSummary {
  id: number;
  name: string;
  kind: string;
  count?: number;
}

function StatTile({
  emoji,
  label,
  value,
  accent,
}: {
  emoji: string;
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border bg-card px-2 py-3 text-center">
      <div className="text-lg leading-none">{emoji}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${accent ?? ""}`}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function BarRow({
  label,
  emoji,
  n,
  max,
  color,
}: {
  label: string;
  emoji: string;
  n: number;
  max: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 truncate">
        {emoji} {label}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(4, (n / max) * 100)}%`, background: color }}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-muted-foreground">{n}</span>
    </div>
  );
}

export function ProfileModal({
  open,
  onClose,
  restaurants,
  regions,
  regionName,
  onLocate,
}: {
  open: boolean;
  onClose: () => void;
  restaurants: RestaurantView[];
  regions: RegionSummary[];
  regionName: string;
  onLocate: (id: number) => void;
}) {
  useEscape(open, onClose);

  const stats = useMemo(() => {
    const want = restaurants.filter((r) => r.wantToEat && !r.visited).length;
    const visited = restaurants.filter((r) => r.visited).length;
    const rec = restaurants.filter(isRecommended).length;
    const xhs = restaurants.filter((r) => r.hasXhsNote).length;

    // 菜系分布 top 8
    const cui = new Map<string, number>();
    for (const r of restaurants) {
      const g = cuisineGroup(r.cuisine);
      cui.set(g, (cui.get(g) ?? 0) + 1);
    }
    const cuiArr = [...cui.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const cuiMax = cuiArr[0]?.[1] ?? 1;

    // 价位分布
    const price = [0, 0, 0, 0]; // ¥ ¥¥ ¥¥¥ ¥¥¥¥
    for (const r of restaurants) {
      if (r.priceLevel != null && r.priceLevel >= 1 && r.priceLevel <= 4)
        price[r.priceLevel - 1]++;
    }
    const priceMax = Math.max(1, ...price);

    // 我的 top（打过分的，取前 5）
    const rated = restaurants
      .filter((r) => r.myRating != null)
      .sort((a, b) => (b.myRating ?? 0) - (a.myRating ?? 0));
    const avgMine =
      rated.length > 0
        ? Math.round(
            rated.reduce((s, r) => s + (r.myRating ?? 0), 0) / rated.length,
          )
        : null;

    return {
      total: restaurants.length,
      want,
      visited,
      rec,
      xhs,
      cuiArr,
      cuiMax,
      price,
      priceMax,
      top: rated.slice(0, 5),
      avgMine,
      cuisineVariety: cui.size,
    };
  }, [restaurants]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-[min(94vw,560px)] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <div className="font-semibold">📊 我的美食档案</div>
            <div className="text-xs text-muted-foreground">
              {regionName} · {stats.cuisineVariety} 种菜系 · 共 {regions.length} 个探索地区
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {/* 概览数字 */}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            <StatTile emoji="🍽️" label="库里" value={stats.total} />
            <StatTile emoji="⭐" label="想去" value={stats.want} accent="text-amber-600 dark:text-amber-400" />
            <StatTile emoji="✓" label="去过" value={stats.visited} accent="text-emerald-600 dark:text-emerald-400" />
            <StatTile emoji="🏆" label="推荐" value={stats.rec} accent="text-amber-600 dark:text-amber-400" />
            <StatTile emoji="📕" label="小红书" value={stats.xhs} accent="text-rose-600 dark:text-rose-400" />
            <StatTile emoji="🗺️" label="地区" value={regions.length} />
          </div>

          {/* 菜系分布 */}
          {stats.cuiArr.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">
                菜系分布
              </h3>
              <div className="space-y-1 rounded-lg border p-2.5">
                {stats.cuiArr.map(([g, n]) => (
                  <BarRow
                    key={g}
                    label={g}
                    emoji={GROUP_EMOJI[g] ?? "🍽️"}
                    n={n}
                    max={stats.cuiMax}
                    color={GROUP_COLOR[g] ?? "#94a3b8"}
                  />
                ))}
              </div>
            </section>
          )}

          {/* 价位分布 */}
          <section>
            <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">
              价位分布
            </h3>
            <div className="space-y-1 rounded-lg border p-2.5">
              {stats.price.map((n, i) => (
                <BarRow
                  key={i}
                  label={"¥".repeat(i + 1)}
                  emoji="💰"
                  n={n}
                  max={stats.priceMax}
                  color="#10b981"
                />
              ))}
            </div>
          </section>

          {/* 我的 top 榜（有打分才显示） */}
          {stats.top.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">
                我的高分店{stats.avgMine != null && ` · 平均 ${stats.avgMine} 分`}
              </h3>
              <div className="space-y-1">
                {stats.top.map((r, i) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      onLocate(r.id);
                      onClose();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg border p-2 text-left text-sm transition-colors hover:bg-accent"
                  >
                    <span className="w-5 shrink-0 text-center text-muted-foreground">
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {cuisineLabel(r.cuisine)}
                    </span>
                    <span className="shrink-0 font-bold tabular-nums text-amber-600 dark:text-amber-400">
                      {r.myRating}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {stats.visited === 0 && (
            <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
              去过的店在弹窗里打个分，这里就会长出你的专属榜单和口味画像 🍜
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
