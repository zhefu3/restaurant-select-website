"use client";

import { useEffect, useRef } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cuisineLabel, cuisineEmoji, cuisineColor } from "@/lib/cuisine";
import { googleMapsUrl, isRecommended, type RestaurantView } from "@/lib/types";
import { cn } from "@/lib/utils";
import { scoreTier } from "@/lib/score";

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

export function RestaurantList({
  restaurants,
  focusId,
  onFocus,
  onHover,
}: {
  restaurants: RestaurantView[];
  focusId?: number | null;
  onFocus?: (id: number) => void;
  /** 悬停卡片时联动地图（高亮对应 marker）。 */
  onHover?: (id: number | null) => void;
}) {
  const focusedRef = useRef<HTMLDivElement>(null);

  // 被选中的卡片滚动进视野。
  useEffect(() => {
    if (focusId != null && focusedRef.current) {
      focusedRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [focusId]);

  if (restaurants.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        <div className="text-3xl">🍽️</div>
        <p className="mt-2">这里还没有符合条件的餐厅</p>
        <p className="mt-1 text-xs">试试放宽筛选、换个菜系，或切换到别的地区。</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {restaurants.map((r) => {
        const focused = r.id === focusId;
        return (
          <Card
            key={r.id}
            ref={focused ? focusedRef : undefined}
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
                  {r.wantToEat && !r.visited && (
                    <Badge variant="secondary">想去吃</Badge>
                  )}
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
                  {r.reviewCount != null && (
                    <>({r.reviewCount.toLocaleString()}) </>
                  )}
                  {r.priceLevel != null && r.priceLevel > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-500">
                      · {"¥".repeat(r.priceLevel)}{" "}
                    </span>
                  )}
                  {r.cuisine && <>· {cuisineLabel(r.cuisine)} </>}
                  {r.distanceKm != null && <>· 🏠 {r.distanceKm.toFixed(1)} km </>}
                  {r.distanceFromMeKm != null && (
                    <span className="text-blue-600 dark:text-blue-400">
                      · 📍 {r.distanceFromMeKm.toFixed(1)} km
                    </span>
                  )}
                </div>
                {r.address && (
                  <div className="truncate text-xs text-muted-foreground/70">
                    {r.address}
                  </div>
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
      })}
    </div>
  );
}
