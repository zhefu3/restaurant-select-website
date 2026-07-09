"use client";

import { useEffect, useRef } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cuisineLabel, cuisineEmoji, cuisineColor } from "@/lib/cuisine";
import { googleMapsUrl, isRecommended, type RestaurantView } from "@/lib/types";
import { cn } from "@/lib/utils";

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
              "cursor-pointer transition-colors hover:border-foreground/25",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
              // 屏外卡片跳过渲染（长列表提速）；记住高度避免滚动条跳动。
              "[contain-intrinsic-size:auto_88px] [content-visibility:auto]",
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
                    className="absolute inset-0 h-full w-full object-cover"
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
                  {r.rating != null && <>⭐ {r.rating} </>}
                  {r.reviewCount != null && (
                    <>({r.reviewCount.toLocaleString()}) </>
                  )}
                  {r.priceLevel != null && r.priceLevel > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-500">
                      {"¥".repeat(r.priceLevel)}{" "}
                    </span>
                  )}
                  {r.cuisine && <>· {cuisineLabel(r.cuisine)} </>}
                  {r.distanceKm != null && <>· 🏠 {r.distanceKm.toFixed(1)} km </>}
                  {r.distanceFromMeKm != null && (
                    <span className="text-blue-600 dark:text-blue-400">
                      · 📍 {r.distanceFromMeKm.toFixed(1)} km
                    </span>
                  )}
                  {r.tasteScore != null && !r.visited && (
                    <span className="text-emerald-600">· 🎯 {r.tasteScore}</span>
                  )}
                  {r.visited && r.myRating != null && (
                    <span className="text-amber-600">· 我打 {r.myRating} 分</span>
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
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
