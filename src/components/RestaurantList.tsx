"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cuisineLabel, cuisineEmoji, cuisineColor } from "@/lib/cuisine";
import { googleMapsUrl, isRecommended, type RestaurantView } from "@/lib/types";
import { cn, formatDistance } from "@/lib/utils";
import { scoreTier } from "@/lib/score";
import { groupChains, type ListEntry } from "@/lib/chains";

/** 右侧评分徽章：借鉴 Beli 的「醒目数字」。去过的店显示我的评分，没去过但合口味显示预测分。 */
function ScoreChip({ r }: { r: RestaurantView }) {
  if (r.visited && r.myRating != null) {
    const t = scoreTier(r.myRating);
    return (
      <div
        className={cn(
          "flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl ring-1",
          t.bg,
          t.ring,
        )}
        title={`我给这家打了 ${r.myRating} 分`}
      >
        <span className={cn("text-base font-bold leading-none tabular-nums", t.text)}>
          {r.myRating}
        </span>
        <span className={cn("mt-0.5 text-[9px] leading-none opacity-70", t.text)}>我的</span>
      </div>
    );
  }
  if (r.tasteScore != null && !r.visited) {
    return (
      <div
        className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-emerald-300 text-emerald-600 dark:border-emerald-800/70 dark:text-emerald-400"
        title={`按你的口味预测：${r.tasteScore} 分合口味`}
      >
        <span className="text-base font-bold leading-none tabular-nums">{r.tasteScore}</span>
        <span className="mt-0.5 text-[9px] leading-none opacity-70">🎯</span>
      </div>
    );
  }
  return null;
}

/** 单店卡片（列表主体）。 */
function RestaurantCard({
  r,
  focused,
  cardRef,
  onFocus,
  onHover,
}: {
  r: RestaurantView;
  focused: boolean;
  cardRef?: React.Ref<HTMLDivElement>;
  onFocus?: (id: number) => void;
  onHover?: (id: number | null) => void;
}) {
  return (
    <Card
      ref={focused ? cardRef : undefined}
      onClick={() => onFocus?.(r.id)}
      onMouseEnter={() => onHover?.(r.id)}
      onMouseLeave={() => onHover?.(null)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onFocus?.(r.id);
        }
      }}
      className={cn(
        "group cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        // 屏外卡片跳过渲染（长列表提速）；记住高度避免滚动条跳动。
        "[contain-intrinsic-size:auto_88px] [content-visibility:auto]",
        isRecommended(r) && "reco-card",
        focused && "border-blue-500 ring-1 ring-blue-500",
      )}
      title="点击在地图上定位"
    >
      <CardContent className="flex items-center gap-3 p-3">
        {/* 缩略图：有缓存照片就盖真实照片，否则/加载失败露出菜系 emoji 底 */}
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg shadow-inner">
          <div
            className="flex h-full w-full items-center justify-center text-2xl"
            style={{
              background: `linear-gradient(135deg, ${cuisineColor(r.cuisine)}33, ${cuisineColor(r.cuisine)}66)`,
            }}
            aria-hidden
          >
            {cuisineEmoji(r.cuisine)}
          </div>
          {r.hasPhoto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/photo?restaurantId=${r.id}`}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
              onError={(e) => e.currentTarget.remove()}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {/* 店名即链接，点击直达 Google Maps（阻止冒泡，避免同时触发定位） */}
            <a
              href={googleMapsUrl(r)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 truncate font-medium hover:text-blue-600 hover:underline"
              title="在 Google Maps 打开"
            >
              <span className="truncate">{r.name}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60" />
            </a>
            {isRecommended(r) && <Badge variant="gold">推荐</Badge>}
            {r.wantToEat && !r.visited && <Badge variant="secondary">想去吃</Badge>}
            {r.hasXhsNote && (
              <span title="有小红书笔记" className="shrink-0 text-xs">
                📕
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {r.rating != null && (
              <span className="font-medium text-amber-600 dark:text-amber-500">
                ★ {r.rating}{" "}
              </span>
            )}
            {r.reviewCount != null && <>({r.reviewCount.toLocaleString()}) </>}
            {r.priceLevel != null && r.priceLevel > 0 && (
              <span className="text-emerald-600 dark:text-emerald-500">
                · {"¥".repeat(r.priceLevel)}{" "}
              </span>
            )}
            {r.cuisine && <>· {cuisineLabel(r.cuisine)} </>}
            {r.distanceKm != null && <>· 🏠 {formatDistance(r.distanceKm)} </>}
            {r.distanceFromMeKm != null && (
              <span className="text-blue-600 dark:text-blue-400">
                · 📍 {formatDistance(r.distanceFromMeKm)}
              </span>
            )}
          </div>
          {r.address && (
            <div className="truncate text-xs text-muted-foreground/70">{r.address}</div>
          )}
          {r.tags && r.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {r.tags.slice(0, 4).map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                >
                  🏷️ {t}
                </span>
              ))}
            </div>
          )}
        </div>
        {/* 右侧 Beli 式评分徽章：我的评分 / 预测合口味分 */}
        <ScoreChip r={r} />
      </CardContent>
    </Card>
  );
}

/** 连锁组里的一家分店（紧凑行，用地址区分不同分店）。 */
function BranchRow({
  r,
  focused,
  cardRef,
  onFocus,
  onHover,
}: {
  r: RestaurantView;
  focused: boolean;
  cardRef?: React.Ref<HTMLDivElement>;
  onFocus?: (id: number) => void;
  onHover?: (id: number | null) => void;
}) {
  return (
    <Card
      ref={focused ? cardRef : undefined}
      onClick={() => onFocus?.(r.id)}
      onMouseEnter={() => onHover?.(r.id)}
      onMouseLeave={() => onHover?.(null)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onFocus?.(r.id);
        }
      }}
      className={cn(
        "cursor-pointer bg-muted/30 transition-colors hover:bg-accent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        focused && "border-blue-500 ring-1 ring-blue-500",
      )}
      title="点击在地图上定位这家分店"
    >
      <CardContent className="flex items-center gap-2 p-2">
        <span className="shrink-0 text-sm" aria-hidden>
          📍
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">
            {r.address ?? r.name}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {r.rating != null && (
              <span className="text-amber-600 dark:text-amber-500">★ {r.rating} </span>
            )}
            {r.priceLevel != null && r.priceLevel > 0 && (
              <span className="text-emerald-600 dark:text-emerald-500">
                · {"¥".repeat(r.priceLevel)}{" "}
              </span>
            )}
            {r.distanceKm != null && <>· 🏠 {formatDistance(r.distanceKm)} </>}
            {r.distanceFromMeKm != null && (
              <span className="text-blue-600 dark:text-blue-400">
                · 📍 {formatDistance(r.distanceFromMeKm)}
              </span>
            )}
          </div>
        </div>
        <a
          href={googleMapsUrl(r)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 text-muted-foreground hover:text-blue-600"
          title="在 Google Maps 打开这家分店"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </CardContent>
    </Card>
  );
}

/** 连锁组：折叠成一行「店名 · N 家分店」，点开展开各分店，并把分店在地图上框出来。 */
function ChainGroupRow({
  name,
  branches,
  expanded,
  onToggle,
  focusId,
  focusedRef,
  onFocus,
  onHover,
}: {
  name: string;
  branches: RestaurantView[];
  expanded: boolean;
  onToggle: () => void;
  focusId?: number | null;
  focusedRef: React.Ref<HTMLDivElement>;
  onFocus?: (id: number) => void;
  onHover?: (id: number | null) => void;
}) {
  const first = branches[0];
  const rating = first.rating;
  // 最近一家分店的距离（离我 > 离家）。
  const nearest = branches
    .map((b) => b.distanceFromMeKm ?? b.distanceKm)
    .filter((d): d is number => d != null)
    .sort((a, b) => a - b)[0];

  return (
    <div className="space-y-1.5">
      <Card
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={expanded}
        className={cn(
          "cursor-pointer transition-all duration-200 hover:border-foreground/25 hover:shadow-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
          expanded && "border-foreground/20",
        )}
        title={`${name} — 点开看 ${branches.length} 家分店`}
      >
        <CardContent className="flex items-center gap-3 p-3">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg text-2xl shadow-inner"
            style={{
              background: `linear-gradient(135deg, ${cuisineColor(first.cuisine)}33, ${cuisineColor(first.cuisine)}66)`,
            }}
            aria-hidden
          >
            {cuisineEmoji(first.cuisine)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">{name}</span>
              <Badge variant="secondary" className="shrink-0">
                🔗 {branches.length} 家分店
              </Badge>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {rating != null && (
                <span className="font-medium text-amber-600 dark:text-amber-500">
                  ★ {rating}{" "}
                </span>
              )}
              {first.cuisine && <>· {cuisineLabel(first.cuisine)} </>}
              {nearest != null && <>· 最近 {formatDistance(nearest)}</>}
            </div>
            <div className="text-xs text-muted-foreground/70">
              {expanded ? "收起分店" : "点开看各家分店并在地图上框出"}
            </div>
          </div>
          <ChevronRight
            className={cn(
              "h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200",
              expanded && "rotate-90",
            )}
          />
        </CardContent>
      </Card>

      {expanded && (
        <div className="ml-4 space-y-1.5 border-l border-border/60 pl-2">
          {branches.map((b) => (
            <BranchRow
              key={b.id}
              r={b}
              focused={b.id === focusId}
              cardRef={b.id === focusId ? focusedRef : undefined}
              onFocus={onFocus}
              onHover={onHover}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function RestaurantList({
  restaurants,
  focusId,
  onFocus,
  onHover,
  groupChains: doGroup = false,
  onShowBranches,
  filtersActive = false,
  onClearFilters,
}: {
  restaurants: RestaurantView[];
  focusId?: number | null;
  onFocus?: (id: number) => void;
  /** 悬停卡片时联动地图（高亮对应 marker）。 */
  onHover?: (id: number | null) => void;
  /** 是否把同名连锁折叠成可展开的组。 */
  groupChains?: boolean;
  /** 展开某连锁时，把这些分店在地图上框出来。 */
  onShowBranches?: (branches: RestaurantView[]) => void;
  /** 有筛选在生效 + 清空回调：空结果时直接给「清空筛选」按钮，省得回头找。 */
  filtersActive?: boolean;
  onClearFilters?: () => void;
}) {
  const focusedRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const entries: ListEntry[] = useMemo(
    () =>
      doGroup
        ? groupChains(restaurants)
        : restaurants.map((r) => ({ kind: "single" as const, r })),
    [restaurants, doGroup],
  );

  // 增量渲染：先渲前 PAGE 张，滚到接近底部再加一批——避免一次性挂 ~千张卡的 DOM。
  const PAGE = 40;
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 列表内容变了（切地区/筛选/排序/连锁开关）→ 回到顶部批次。
  useEffect(() => {
    setVisibleCount(PAGE);
  }, [entries]);

  // 被聚焦的店若在批次之外，扩大批次把它渲出来（否则 scrollIntoView/连锁展开找不到）。
  useEffect(() => {
    if (focusId == null) return;
    const idx = entries.findIndex((e) =>
      e.kind === "single"
        ? e.r.id === focusId
        : e.branches.some((b) => b.id === focusId),
    );
    if (idx >= 0) setVisibleCount((c) => (idx >= c ? idx + 1 : c));
  }, [focusId, entries]);

  // 滚到接近底部（提前 800px）时加载下一批。
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (obs) => {
        if (obs[0]?.isIntersecting)
          setVisibleCount((c) => Math.min(c + PAGE, entries.length));
      },
      { rootMargin: "800px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [entries.length]);

  // 若被聚焦的店藏在某个折叠的连锁组里，自动展开它（点地图 marker 也能在列表里看到）。
  useEffect(() => {
    if (focusId == null || !doGroup) return;
    for (const e of entries) {
      if (e.kind === "chain" && e.branches.some((b) => b.id === focusId)) {
        setExpanded((prev) =>
          prev.has(e.name) ? prev : new Set(prev).add(e.name),
        );
        break;
      }
    }
  }, [focusId, entries, doGroup]);

  // 被选中的卡片滚动进视野。
  useEffect(() => {
    if (focusId != null && focusedRef.current) {
      focusedRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [focusId, expanded]);

  if (restaurants.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        <div className="text-3xl">🍽️</div>
        <p className="mt-2">这里还没有符合条件的餐厅</p>
        <p className="mt-1 text-xs">试试放宽筛选、换个菜系，或切换到别的地区。</p>
        {filtersActive && onClearFilters && (
          <button
            onClick={onClearFilters}
            className="mt-3 rounded-full border border-input px-3 py-1 text-xs text-foreground transition-colors hover:bg-accent"
          >
            清空筛选 ✕
          </button>
        )}
      </div>
    );
  }

  const toggleChain = (name: string, branches: RestaurantView[]) => {
    const willExpand = !expanded.has(name);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
    // 副作用放在 updater 外（updater 必须纯）：展开时把分店在地图上框出来。
    if (willExpand) onShowBranches?.(branches);
  };

  return (
    <div className="space-y-2">
      {entries.slice(0, visibleCount).map((e) =>
        e.kind === "single" ? (
          <RestaurantCard
            key={e.r.id}
            r={e.r}
            focused={e.r.id === focusId}
            cardRef={e.r.id === focusId ? focusedRef : undefined}
            onFocus={onFocus}
            onHover={onHover}
          />
        ) : (
          <ChainGroupRow
            key={`chain:${e.name}`}
            name={e.name}
            branches={e.branches}
            expanded={expanded.has(e.name)}
            onToggle={() => toggleChain(e.name, e.branches)}
            focusId={focusId}
            focusedRef={focusedRef}
            onFocus={onFocus}
            onHover={onHover}
          />
        ),
      )}
      {visibleCount < entries.length && (
        <div
          ref={sentinelRef}
          className="py-4 text-center text-xs text-muted-foreground"
        >
          正在加载更多…（还有 {entries.length - visibleCount} 家）
        </div>
      )}
    </div>
  );
}
