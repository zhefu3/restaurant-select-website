"use client";

/** 「附近还有啥」：选一家店做锚点，列出离它最近的其它餐厅（去它路上/它满了时的 plan B）。零成本。 */

import { useMemo, useState } from "react";
import { cuisineLabel, cuisineEmoji } from "@/lib/cuisine";
import { haversineKm } from "@/lib/geo";
import { type RestaurantView } from "@/lib/types";
import { useEscape } from "@/lib/use-escape";
import { formatDistance } from "@/lib/utils";

export function NearbyModal({
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
  const [anchorId, setAnchorId] = useState<number | null>(null);
  const [q, setQ] = useState("");

  const anchor = useMemo(
    () => restaurants.find((r) => r.id === anchorId) ?? null,
    [restaurants, anchorId],
  );

  const matches = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return restaurants
      .filter(
        (r) =>
          r.lat != null &&
          (r.name.toLowerCase().includes(query) ||
            cuisineLabel(r.cuisine).toLowerCase().includes(query)),
      )
      .slice(0, 6);
  }, [q, restaurants]);

  const near = useMemo(() => {
    if (!anchor || anchor.lat == null || anchor.lng == null) return [];
    const a = { lat: anchor.lat, lng: anchor.lng };
    return restaurants
      .filter((r) => r.id !== anchor.id && r.lat != null && r.lng != null)
      .map((r) => ({ r, km: haversineKm(a, { lat: r.lat!, lng: r.lng! }) }))
      .sort((x, y) => x.km - y.km)
      .slice(0, 8);
  }, [anchor, restaurants]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-start justify-center bg-black/50 p-4 pt-[8vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="附近还有啥"
        className="flex max-h-[82vh] w-[min(94vw,460px)] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <div className="font-semibold">🧭 附近还有啥</div>
            <div className="text-xs text-muted-foreground">
              选一家做锚点，看离它最近的备选
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

        <div className="relative border-b px-4 py-2.5">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={anchor ? `锚点：${anchor.name}（重新搜可换）` : "搜一家店做锚点…"}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {matches.length > 0 && (
            <div className="absolute left-4 right-4 top-[3.2rem] z-10 max-h-52 overflow-y-auto rounded-lg border bg-background p-1 shadow-xl">
              {matches.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setAnchorId(m.id);
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

        <div className="flex-1 overflow-y-auto p-3">
          {!anchor ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <div className="text-3xl">🧭</div>
              <p className="mt-2">搜一家店做锚点</p>
              <p className="mt-1 text-xs">看它周围最近的 8 家备选</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {near.map(({ r, km }) => (
                <button
                  key={r.id}
                  onClick={() => {
                    onLocate(r.id);
                    onClose();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors hover:bg-accent"
                >
                  <span className="text-lg">{cuisineEmoji(r.cuisine)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.rating != null && (
                        <span className="text-amber-600 dark:text-amber-500">
                          ★ {r.rating}{" "}
                        </span>
                      )}
                      {r.priceLevel != null && r.priceLevel > 0 && (
                        <span className="text-emerald-600 dark:text-emerald-500">
                          · {"¥".repeat(r.priceLevel)}{" "}
                        </span>
                      )}
                      · {cuisineLabel(r.cuisine)}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                    {formatDistance(km)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
