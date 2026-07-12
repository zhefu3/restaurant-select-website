"use client";

/**
 * 「为你推荐」横向精选栏（借鉴 Beli Recs / The Infatuation 精选）。
 * 把当前地区最值得试的几家横向铺开，点一下即在地图定位。
 * 只在「发现态」出现（没搜索、店够多时），用户一开始筛选就让位给正经列表。
 */

import { useMemo, useState } from "react";
import { cuisineEmoji, cuisineColor, cuisineLabel } from "@/lib/cuisine";
import { curatePicks } from "@/lib/picks";
import { formatDistance } from "@/lib/utils";
import type { RestaurantView } from "@/lib/types";

export function ForYouRail({
  restaurants,
  onFocus,
  onHover,
}: {
  restaurants: RestaurantView[];
  onFocus?: (id: number) => void;
  onHover?: (id: number | null) => void;
}) {
  const [shuffle, setShuffle] = useState(0);
  const picks = useMemo(
    () => curatePicks(restaurants, 8, shuffle),
    [restaurants, shuffle],
  );
  // 候选够多才给「换一批」（否则换来换去都一样）。
  const canShuffle = useMemo(
    () => curatePicks(restaurants, 24).length > 8,
    [restaurants],
  );
  if (picks.length < 4) return null; // 太少就不喧宾夺主

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1.5 text-sm font-semibold">
        <span className="brand-title">为你推荐</span>
        <span className="text-xs font-normal text-muted-foreground">
          · 挑了 {picks.length} 家今天就想让你去
        </span>
        {canShuffle && (
          <button
            onClick={() => setShuffle((s) => s + 1)}
            className="ml-auto rounded-full border border-input px-2 py-0.5 text-xs font-normal text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="换一批推荐"
          >
            🔄 换一批
          </button>
        )}
      </div>
      <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
        {picks.map(({ r, reason }) => (
          <button
            key={r.id}
            onClick={() => onFocus?.(r.id)}
            onMouseEnter={() => onHover?.(r.id)}
            onMouseLeave={() => onHover?.(null)}
            className="group relative flex w-[144px] shrink-0 flex-col overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            title={`${r.name} — 点击在地图上定位`}
          >
            {/* 封面：真实照片盖在菜系渐变上 */}
            <div className="relative h-20 w-full overflow-hidden">
              <div
                className="flex h-full w-full items-center justify-center text-3xl"
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
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  onError={(e) => e.currentTarget.remove()}
                />
              )}
              {/* 上榜理由角标 */}
              <span className="absolute left-1.5 top-1.5 rounded-full bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                {reason}
              </span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 p-2">
              <div className="truncate text-xs font-semibold" title={r.name}>
                {r.name}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {r.rating != null && (
                  <span className="font-medium text-amber-600 dark:text-amber-500">
                    ★ {r.rating}
                  </span>
                )}
                {r.cuisine && <> · {cuisineLabel(r.cuisine)}</>}
              </div>
              {(r.distanceFromMeKm ?? r.distanceKm) != null && (
                <div className="text-[11px] text-muted-foreground/80">
                  {r.distanceFromMeKm != null
                    ? `📍 ${formatDistance(r.distanceFromMeKm)}`
                    : `🏠 ${formatDistance(r.distanceKm!)}`}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
