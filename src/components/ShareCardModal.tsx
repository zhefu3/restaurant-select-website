"use client";

/** 「美食卡」：给一家店生成一张好看的分享卡（3:4，适合小红书），截图即存。零成本。 */

import { useMemo, useState } from "react";
import { cuisineLabel, cuisineEmoji, cuisineColor } from "@/lib/cuisine";
import { extractCity } from "@/lib/filters";
import { type RestaurantView } from "@/lib/types";
import { useEscape } from "@/lib/use-escape";

export function ShareCardModal({
  open,
  onClose,
  restaurants,
}: {
  open: boolean;
  onClose: () => void;
  restaurants: RestaurantView[];
}) {
  useEscape(open, onClose);
  const [id, setId] = useState<number | null>(null);
  const [q, setQ] = useState("");

  const picked = useMemo(
    () => restaurants.find((r) => r.id === id) ?? null,
    [restaurants, id],
  );

  const matches = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return restaurants
      .filter(
        (r) =>
          r.name.toLowerCase().includes(query) ||
          cuisineLabel(r.cuisine).toLowerCase().includes(query),
      )
      .slice(0, 6);
  }, [q, restaurants]);

  if (!open) return null;

  const r = picked;
  const color = r ? cuisineColor(r.cuisine) : "#f59e0b";

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[6vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[min(94vw,380px)] overflow-hidden rounded-2xl border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="font-semibold">🎴 美食卡</div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* 选店 */}
        <div className="relative border-b px-4 py-2.5">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜一家店做成卡片…"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {matches.length > 0 && (
            <div className="absolute left-4 right-4 top-[3.2rem] z-10 max-h-52 overflow-y-auto rounded-lg border bg-background p-1 shadow-xl">
              {matches.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setId(m.id);
                    setQ("");
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <span>{cuisineEmoji(m.cuisine)}</span>
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {m.rating != null && `★ ${m.rating}`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4">
          {!r ? (
            <div className="py-14 text-center text-sm text-muted-foreground">
              <div className="text-3xl">🎴</div>
              <p className="mt-2">搜一家店，生成一张分享卡</p>
              <p className="mt-1 text-xs">截图即可保存分享到小红书</p>
            </div>
          ) : (
            <>
              {/* 卡片本体（3:4） */}
              <div
                className="relative mx-auto aspect-[3/4] w-full max-w-[300px] overflow-hidden rounded-2xl text-white shadow-lg"
                style={{
                  background: `linear-gradient(160deg, ${color}, #0f172a 85%)`,
                }}
              >
                {r.hasPhoto && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/photo?restaurantId=${r.id}`}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover opacity-60"
                    onError={(e) => e.currentTarget.remove()}
                  />
                )}
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to top, rgba(0,0,0,0.82) 12%, rgba(0,0,0,0.15) 55%, rgba(0,0,0,0.35))",
                  }}
                />
                {/* 顶部：菜系徽章 + 我的分 */}
                <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
                  <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium backdrop-blur-sm">
                    {cuisineEmoji(r.cuisine)} {cuisineLabel(r.cuisine)}
                  </span>
                  {r.visited && r.myRating != null && (
                    <span className="flex h-11 w-11 flex-col items-center justify-center rounded-full bg-amber-400 text-slate-900">
                      <span className="text-base font-bold leading-none">
                        {r.myRating}
                      </span>
                      <span className="text-[8px] leading-none opacity-80">我的分</span>
                    </span>
                  )}
                </div>
                {/* 底部：店名 + 元信息 */}
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <div className="text-xl font-bold leading-tight drop-shadow">
                    {r.name}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    {r.rating != null && (
                      <span className="font-semibold text-amber-300">
                        ★ {r.rating}
                      </span>
                    )}
                    {r.reviewCount != null && (
                      <span className="text-white/70">
                        {r.reviewCount.toLocaleString()} 评价
                      </span>
                    )}
                    {r.priceLevel != null && r.priceLevel > 0 && (
                      <span className="text-emerald-300">
                        {"¥".repeat(r.priceLevel)}
                      </span>
                    )}
                  </div>
                  {extractCity(r.address) && (
                    <div className="mt-1 text-xs text-white/70">
                      📍 {extractCity(r.address)}
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-1.5 border-t border-white/20 pt-2 text-[11px] text-white/60">
                    <span className="font-semibold text-white/80">Athroics</span>
                    · 我的美食地图
                  </div>
                </div>
              </div>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                截图这张卡片即可保存分享 📸
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
