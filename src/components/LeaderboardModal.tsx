"use client";

/** 我的美食榜（Beli 式）：把打过分的店按我的评分排名。零成本，用现有数据。 */

import { cuisineLabel } from "@/lib/cuisine";
import { type RestaurantView } from "@/lib/types";
import { useEscape } from "@/lib/use-escape";
import { scoreTier } from "@/lib/score";
import { cn } from "@/lib/utils";

const MEDAL = ["🥇", "🥈", "🥉"];

export function LeaderboardModal({
  open,
  onClose,
  restaurants,
  onLocate,
}: {
  open: boolean;
  onClose: () => void;
  restaurants: RestaurantView[];
  onLocate: (id: number) => void;
}) {
  useEscape(open, onClose);
  if (!open) return null;

  const ranked = restaurants
    .filter((r) => r.myRating != null)
    .sort((a, b) => (b.myRating ?? 0) - (a.myRating ?? 0))
    .slice(0, 50);

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="我的美食榜"
        className="flex max-h-[80vh] w-[min(92vw,480px)] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <div className="font-semibold">🏆 我的美食榜</div>
            <div className="text-xs text-muted-foreground">
              按你的评分排名 · 去过打分后自动上榜
            </div>
          </div>
          {ranked.length > 0 && (
            <div className="text-xs text-muted-foreground">{ranked.length} 家</div>
          )}
        </div>

        <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
          {ranked.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <div className="text-3xl">🍽️</div>
              <p className="mt-2">还没有打分的餐厅</p>
              <p className="mt-1 text-xs">
                去过一家后在弹窗里打个分，就能建立你的专属榜单
              </p>
            </div>
          ) : (
            ranked.map((r, i) => (
              <button
                key={r.id}
                onClick={() => {
                  onLocate(r.id);
                  onClose();
                }}
                className="flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors hover:bg-accent"
              >
                <div className="w-8 shrink-0 text-center text-lg font-bold">
                  {i < 3 ? (
                    MEDAL[i]
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      #{i + 1}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {r.rating != null && (
                      <>
                        <span className="text-amber-600 dark:text-amber-500">
                          ★ {r.rating}
                        </span>{" "}
                        ·{" "}
                      </>
                    )}
                    {cuisineLabel(r.cuisine)}
                  </div>
                </div>
                <div
                  className={cn(
                    "flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl ring-1",
                    scoreTier(r.myRating ?? 0).bg,
                    scoreTier(r.myRating ?? 0).ring,
                  )}
                >
                  <div
                    className={cn(
                      "text-base font-bold leading-none tabular-nums",
                      scoreTier(r.myRating ?? 0).text,
                    )}
                  >
                    {r.myRating}
                  </div>
                  <div
                    className={cn(
                      "mt-0.5 text-[9px] leading-none opacity-70",
                      scoreTier(r.myRating ?? 0).text,
                    )}
                  >
                    我的
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
