"use client";

/** 「对比」：搜 2–3 家餐厅并排比较关键指标，帮你在几个候选里拍板。零成本，纯客户端。 */

import { useMemo, useState } from "react";
import { cuisineLabel, cuisineEmoji, cuisineColor } from "@/lib/cuisine";
import { googleMapsUrl, type RestaurantView } from "@/lib/types";
import { useEscape } from "@/lib/use-escape";
import { formatDistance } from "@/lib/utils";

const MAX = 3;

export function CompareModal({
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
  const [ids, setIds] = useState<number[]>([]);
  const [q, setQ] = useState("");
  const [winnerId, setWinnerId] = useState<number | null>(null);

  const picked = useMemo(
    () =>
      ids
        .map((id) => restaurants.find((r) => r.id === id))
        .filter((r): r is RestaurantView => r != null),
    [ids, restaurants],
  );

  const matches = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return restaurants
      .filter(
        (r) =>
          !ids.includes(r.id) &&
          (r.name.toLowerCase().includes(query) ||
            (r.address ?? "").toLowerCase().includes(query) ||
            cuisineLabel(r.cuisine).toLowerCase().includes(query)),
      )
      .slice(0, 6);
  }, [q, restaurants, ids]);

  // 每行的“最优”高亮：评分最高、价位最低、距离最近、我的分最高。
  const best = useMemo(() => {
    const nums = (get: (r: RestaurantView) => number | null | undefined) =>
      picked.map(get).filter((v): v is number => v != null);
    const maxRating = Math.max(...nums((r) => r.rating), -Infinity);
    const minPrice = Math.min(...nums((r) => r.priceLevel), Infinity);
    const minDist = Math.min(
      ...nums((r) => r.distanceFromMeKm ?? r.distanceKm),
      Infinity,
    );
    const maxMine = Math.max(...nums((r) => r.myRating), -Infinity);
    return { maxRating, minPrice, minDist, maxMine };
  }, [picked]);

  if (!open) return null;

  const add = (id: number) => {
    if (ids.length >= MAX || ids.includes(id)) return;
    setIds((p) => [...p, id]);
    setQ("");
    setWinnerId(null);
  };
  const remove = (id: number) => {
    setIds((p) => p.filter((x) => x !== id));
    setWinnerId(null);
  };

  // 帮我拍板：评分质量 × 距离邻近 × 合口味加权，选一个赢家。
  const decide = () => {
    let bestId: number | null = null;
    let bestW = -Infinity;
    for (const p of picked) {
      const rating = p.rating ?? 4.2;
      const dist = p.distanceFromMeKm ?? p.distanceKm ?? 12;
      const w =
        Math.exp((rating - 4.2) * 2) *
        (1 / (1 + dist / 6)) *
        (p.tasteScore != null ? 0.7 + p.tasteScore / 100 : 1);
      if (w > bestW) {
        bestW = w;
        bestId = p.id;
      }
    }
    setWinnerId(bestId);
  };

  const cellBest = "font-semibold text-emerald-600 dark:text-emerald-400";

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-start justify-center bg-black/50 p-4 pt-[8vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="对比餐厅"
        className="flex max-h-[84vh] w-[min(94vw,620px)] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <div className="font-semibold">⚖️ 对比餐厅</div>
            <div className="text-xs text-muted-foreground">
              搜索加入 2–3 家，绿色 = 该项最优
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

        {/* 搜索加入 */}
        {ids.length < MAX && (
          <div className="relative border-b px-4 py-2.5">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches.length > 0) add(matches[0].id);
              }}
              placeholder={`搜店名 / 菜系加入对比（已选 ${ids.length}/${MAX}）…`}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {matches.length > 0 && (
              <div className="absolute left-4 right-4 top-[3.2rem] z-10 max-h-52 overflow-y-auto rounded-lg border bg-background p-1 shadow-xl">
                {matches.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => add(r.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <span>{cuisineEmoji(r.cuisine)}</span>
                    <span className="min-w-0 flex-1 truncate">{r.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {r.rating != null && `★ ${r.rating}`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-auto p-4">
          {picked.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <div className="text-3xl">⚖️</div>
              <p className="mt-2">搜索加入 2–3 家餐厅开始对比</p>
              <p className="mt-1 text-xs">评分 / 价位 / 距离 / 我的评分 一目了然</p>
            </div>
          ) : (
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${picked.length}, minmax(0,1fr))` }}
            >
              {picked.map((r) => (
                <div
                  key={r.id}
                  className={`flex flex-col overflow-hidden rounded-xl border ${
                    winnerId === r.id
                      ? "border-amber-400 ring-2 ring-amber-400"
                      : ""
                  }`}
                >
                  <div className="relative h-24 w-full">
                    {winnerId === r.id && (
                      <span className="absolute left-1 top-1 z-10 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-slate-900">
                        🏆 拍板
                      </span>
                    )}
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
                        className="absolute inset-0 h-full w-full object-cover"
                        onError={(e) => e.currentTarget.remove()}
                      />
                    )}
                    <button
                      onClick={() => remove(r.id)}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-xs text-white backdrop-blur-sm hover:bg-black/75"
                      aria-label="移除"
                      title="移除"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5 p-2.5 text-xs">
                    <a
                      href={googleMapsUrl(r)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-sm font-semibold hover:underline"
                      title={r.name}
                    >
                      {r.name}
                    </a>
                    <Row label="评分">
                      <span className={r.rating === best.maxRating ? cellBest : ""}>
                        {r.rating != null ? `★ ${r.rating}` : "—"}
                        {r.reviewCount != null && (
                          <span className="text-muted-foreground">
                            {" "}
                            ({r.reviewCount.toLocaleString()})
                          </span>
                        )}
                      </span>
                    </Row>
                    <Row label="价位">
                      <span className={r.priceLevel === best.minPrice ? cellBest : ""}>
                        {r.priceLevel != null && r.priceLevel > 0
                          ? "¥".repeat(r.priceLevel)
                          : "—"}
                      </span>
                    </Row>
                    <Row label="菜系">{cuisineLabel(r.cuisine)}</Row>
                    <Row label="距离">
                      <span
                        className={
                          (r.distanceFromMeKm ?? r.distanceKm) === best.minDist
                            ? cellBest
                            : ""
                        }
                      >
                        {(r.distanceFromMeKm ?? r.distanceKm) != null
                          ? formatDistance((r.distanceFromMeKm ?? r.distanceKm)!)
                          : "—"}
                      </span>
                    </Row>
                    <Row label="我的分">
                      <span className={r.myRating === best.maxMine && r.myRating != null ? cellBest : ""}>
                        {r.myRating != null ? `${r.myRating} 分` : "—"}
                      </span>
                    </Row>
                    <Row label="小红书">{r.hasXhsNote ? "📕 有" : "—"}</Row>
                    <button
                      onClick={() => {
                        onLocate(r.id);
                        onClose();
                      }}
                      className="mt-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      在地图定位
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {picked.length >= 2 && (
          <div className="border-t px-4 py-3">
            <button
              onClick={decide}
              className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              🏆 帮我拍板
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-t pt-1 first:border-t-0 first:pt-0">
      <span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right">{children}</span>
    </div>
  );
}
