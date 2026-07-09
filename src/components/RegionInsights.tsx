"use client";

/** 当前地区菜系分布（可折叠洞察，零成本，纯客户端统计）。 */

import { useMemo, useState } from "react";
import { cuisineGroup, GROUP_EMOJI, GROUP_COLOR } from "@/lib/cuisine";
import type { RestaurantView } from "@/lib/types";

export function RegionInsights({
  restaurants,
}: {
  restaurants: RestaurantView[];
}) {
  const [open, setOpen] = useState(false);

  const dist = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of restaurants) {
      const g = cuisineGroup(r.cuisine);
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    const arr = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return { arr: arr.slice(0, 8), max: arr[0]?.[1] ?? 1 };
  }, [restaurants]);

  if (restaurants.length < 3) return null;

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        📊 菜系分布 {open ? "▲" : "▼"}
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 rounded-lg border p-2.5">
          {dist.arr.map(([g, n]) => (
            <div key={g} className="flex items-center gap-2 text-xs">
              <span className="w-24 shrink-0 truncate">
                {GROUP_EMOJI[g] ?? "🍽️"} {g}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(4, (n / dist.max) * 100)}%`,
                    background: GROUP_COLOR[g] ?? "#94a3b8",
                  }}
                />
              </div>
              <span className="w-8 shrink-0 text-right text-muted-foreground">
                {n}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
