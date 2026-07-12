"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CuisineFilter } from "@/components/CuisineFilter";
import type { CuisineOption } from "@/lib/cuisine";
import type { CityOption, ClientFilters } from "@/lib/filters";

const PRICE_LEVELS: { level: number; label: string }[] = [
  { level: 1, label: "¥" },
  { level: 2, label: "¥¥" },
  { level: 3, label: "¥¥¥" },
  { level: 4, label: "¥¥¥¥" },
];

const DISTANCES: { value: number | null; label: string }[] = [
  { value: null, label: "不限" },
  { value: 2, label: "≤2km" },
  { value: 5, label: "≤5km" },
  { value: 10, label: "≤10km" },
];

export function FilterBar({
  filters,
  onChange,
  cuisineOptions,
  cityOptions,
  lists = [],
  tags = [],
}: {
  filters: ClientFilters;
  onChange: (next: ClientFilters) => void;
  cuisineOptions: CuisineOption[];
  cityOptions: CityOption[];
  lists?: { id: number; name: string; emoji: string | null }[];
  tags?: string[];
}) {
  const set = (patch: Partial<ClientFilters>) =>
    onChange({ ...filters, ...patch });

  // 搜索去抖：本地即时显示，停顿 180ms 后才真正过滤（986 家实时过滤+重渲染，避免每键都卡）。
  const [localSearch, setLocalSearch] = useState(filters.search);
  useEffect(() => setLocalSearch(filters.search), [filters.search]);
  useEffect(() => {
    if (localSearch === filters.search) return;
    const t = setTimeout(() => set({ search: localSearch }), 180);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localSearch]);

  function togglePrice(level: number) {
    const has = filters.prices.includes(level);
    set({
      prices: has
        ? filters.prices.filter((p) => p !== level)
        : [...filters.prices, level],
    });
  }

  return (
    <div className="space-y-2">
      {/* 搜索 */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && localSearch) {
              e.preventDefault();
              setLocalSearch("");
            }
          }}
          placeholder="搜索店名 / 菜系 / 地址…（按 /）"
          className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-8 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {localSearch && (
          <button
            type="button"
            onClick={() => setLocalSearch("")}
            title="清空搜索"
            aria-label="清空搜索"
            className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            ✕
          </button>
        )}
      </div>

      {/* 菜系 + 城市 */}
      <div className="flex flex-wrap items-center gap-3">
        <CuisineFilter
          options={cuisineOptions}
          values={filters.cuisines}
          onToggle={(v) =>
            set({
              cuisines: filters.cuisines.includes(v)
                ? filters.cuisines.filter((x) => x !== v)
                : [...filters.cuisines, v],
            })
          }
          onClear={() => set({ cuisines: [] })}
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">城市：</span>
          <select
            value={filters.city}
            onChange={(e) => set({ city: e.target.value })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">全部城市</option>
            {cityOptions.map((c) => (
              <option key={c.value} value={c.value}>
                {c.value}（{c.count}）
              </option>
            ))}
          </select>
        </div>
        {lists.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">清单：</span>
            <select
              value={filters.list ?? "all"}
              onChange={(e) =>
                set({
                  list: e.target.value === "all" ? null : Number(e.target.value),
                })
              }
              className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">全部清单</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.emoji ? `${l.emoji} ` : "📁 "}
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {tags.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">标签：</span>
            <select
              value={filters.tag ?? "all"}
              onChange={(e) =>
                set({ tag: e.target.value === "all" ? null : e.target.value })
              }
              className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">全部标签</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  🏷️ {t}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 价格 + 距离 + 隐藏连锁 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">价格：</span>
          {PRICE_LEVELS.map((p) => (
            <Button
              key={p.level}
              size="sm"
              variant={filters.prices.includes(p.level) ? "default" : "outline"}
              onClick={() => togglePrice(p.level)}
            >
              {p.label}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">距家：</span>
          {DISTANCES.map((d) => (
            <Button
              key={d.label}
              size="sm"
              variant={filters.maxDistanceKm === d.value ? "default" : "outline"}
              onClick={() => set({ maxDistanceKm: d.value })}
            >
              {d.label}
            </Button>
          ))}
        </div>

        <Button
          size="sm"
          variant={filters.hideChains ? "default" : "outline"}
          onClick={() => set({ hideChains: !filters.hideChains })}
        >
          {filters.hideChains ? "✓ " : ""}隐藏连锁
        </Button>
      </div>
    </div>
  );
}
