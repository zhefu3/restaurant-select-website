"use client";

/**
 * ⌘K / Ctrl+K 命令面板：一键搜店跳转 + 切地区 + 触发操作。
 * 借鉴 Raycast/Linear/Superhuman 的启动器体验，纯客户端、零成本。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { cuisineLabel } from "@/lib/cuisine";
import type { RestaurantView } from "@/lib/types";

/** 只取命令面板要用的字段，避免和两处 RegionSummary 定义耦合。 */
type PaletteRegion = { id: number; name: string; kind: string; count: number };

type Item = {
  key: string;
  icon: string;
  label: string;
  sub?: string;
  group: "操作" | "地区" | "餐厅";
  run: () => void;
};

export function CommandPalette({
  restaurants,
  regions,
  onFocusRestaurant,
  onSwitchRegion,
  onAction,
}: {
  restaurants: RestaurantView[];
  regions: PaletteRegion[];
  onFocusRestaurant: (id: number) => void;
  onSwitchRegion: (id: number) => void;
  onAction: (
    a:
      | "pick"
      | "wizard"
      | "nearby"
      | "blacklist"
      | "theme"
      | "profile"
      | "leaderboard"
      | "chains",
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 全局快捷键：⌘K / Ctrl+K 开关
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const close = () => setOpen(false);
    const actions: Item[] = [
      { key: "a-pick", icon: "🎲", label: "帮我选一家", group: "操作", run: () => { onAction("pick"); close(); } },
      { key: "a-wizard", icon: "🍽️", label: "今晚吃什么（三问向导）", group: "操作", run: () => { onAction("wizard"); close(); } },
      { key: "a-near", icon: "📍", label: "附近（按离我最近）", group: "操作", run: () => { onAction("nearby"); close(); } },
      { key: "a-profile", icon: "📊", label: "我的美食档案", group: "操作", run: () => { onAction("profile"); close(); } },
      { key: "a-board", icon: "🏆", label: "我的美食榜", group: "操作", run: () => { onAction("leaderboard"); close(); } },
      { key: "a-chains", icon: "🔗", label: "合并 / 展开连锁", group: "操作", run: () => { onAction("chains"); close(); } },
      { key: "a-black", icon: "🚫", label: "黑名单视图", group: "操作", run: () => { onAction("blacklist"); close(); } },
      { key: "a-theme", icon: "🌓", label: "切换深色 / 浅色", group: "操作", run: () => { onAction("theme"); close(); } },
    ];
    const regionItems: Item[] = regions.map((r) => ({
      key: `rg-${r.id}`,
      icon: r.kind === "home" ? "🏠" : r.kind === "route" ? "🛣️" : "✈️",
      label: r.name,
      sub: `${r.count} 家`,
      group: "地区",
      run: () => { onSwitchRegion(r.id); close(); },
    }));

    const query = q.trim().toLowerCase();
    if (!query) return [...actions, ...regionItems];

    const match = (s: string) => s.toLowerCase().includes(query);
    const restItems: Item[] = restaurants
      .filter((r) => match(r.name) || match(cuisineLabel(r.cuisine)) || match(r.address ?? ""))
      .slice(0, 8)
      .map((r) => ({
        key: `r-${r.id}`,
        icon: "🍴",
        label: r.name,
        sub: [r.rating != null ? `⭐${r.rating}` : null, cuisineLabel(r.cuisine)].filter(Boolean).join(" · "),
        group: "餐厅",
        run: () => { onFocusRestaurant(r.id); close(); },
      }));

    return [
      ...actions.filter((a) => match(a.label)),
      ...regionItems.filter((r) => match(r.label)),
      ...restItems,
    ];
  }, [q, regions, restaurants, onAction, onSwitchRegion, onFocusRestaurant]);

  useEffect(() => setSel(0), [q]);

  function onListKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[sel]?.run();
    }
  }

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${sel}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!open) return null;

  let lastGroup = "";
  return (
    <div
      className="fixed inset-0 z-[1300] flex items-start justify-center bg-black/40 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-[min(92vw,560px)] overflow-hidden rounded-2xl border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-3.5 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onListKey}
            placeholder="搜店名 / 菜系 / 地址，或选个操作…"
            className="h-6 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
          {items.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              没找到「{q}」
            </div>
          )}
          {items.map((it, i) => {
            const showGroup = it.group !== lastGroup;
            lastGroup = it.group;
            return (
              <div key={it.key}>
                {showGroup && (
                  <div className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {it.group}
                  </div>
                )}
                <button
                  data-idx={i}
                  onMouseEnter={() => setSel(i)}
                  onClick={it.run}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                    i === sel ? "bg-accent" : "hover:bg-accent/60"
                  }`}
                >
                  <span className="text-base">{it.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  {it.sub && (
                    <span className="shrink-0 truncate text-xs text-muted-foreground">
                      {it.sub}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t px-3 py-2 text-[10px] text-muted-foreground">
          <span>↑↓ 选择 · ↵ 确认</span>
          <span>⌘K 随时呼出</span>
        </div>
      </div>
    </div>
  );
}
