"use client";

/** 「今晚吃什么」三问向导 → 3 家候选 + 理由。 */

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cuisineLabel, cuisineEmoji, cuisineColor } from "@/lib/cuisine";
import { googleMapsUrl, type RestaurantView } from "@/lib/types";
import { useEscape } from "@/lib/use-escape";
import {
  DISTANCE_OPTIONS,
  PARTY_OPTIONS,
  VIBE_OPTIONS,
  wizardPick,
  type Party,
  type Vibe,
  type WizardPick,
} from "@/lib/wizard";

export function WizardModal({
  restaurants,
  open,
  onClose,
  onLocate,
}: {
  restaurants: RestaurantView[];
  open: boolean;
  onClose: () => void;
  onLocate: (id: number) => void;
}) {
  const [vibe, setVibe] = useState<Vibe | null>(null);
  const [party, setParty] = useState<Party | null>(null);
  const [maxKm, setMaxKm] = useState<number | null>(null);
  const [picks, setPicks] = useState<WizardPick[] | null>(null);
  useEscape(open, onClose);

  if (!open) return null;

  function reset() {
    setVibe(null);
    setParty(null);
    setMaxKm(null);
    setPicks(null);
  }

  function go(km: number) {
    setMaxKm(km);
    setPicks(wizardPick(restaurants, { vibe: vibe!, party: party!, maxKm: km }));
  }

  const step = vibe === null ? 1 : party === null ? 2 : maxKm === null ? 3 : 4;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="今晚吃什么"
        className="w-full max-w-md rounded-xl bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">🍽️ 今晚吃什么</h3>
          <div className="flex items-center gap-3">
            {/* 三步进度点：让「三问」有明确的推进感 */}
            {step <= 3 && (
              <div className="flex items-center gap-1.5" aria-hidden>
                {[1, 2, 3].map((s) => (
                  <span
                    key={s}
                    className={
                      "h-1.5 rounded-full transition-all duration-300 " +
                      (s === step
                        ? "w-5 bg-foreground"
                        : s < step
                          ? "w-1.5 bg-foreground/60"
                          : "w-1.5 bg-muted-foreground/25")
                    }
                  />
                ))}
              </div>
            )}
            <button onClick={onClose} className="text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">想吃什么感觉的？</p>
            {VIBE_OPTIONS.map((o) => (
              <Button
                key={o.value}
                variant="outline"
                className="w-full justify-start"
                onClick={() => setVibe(o.value)}
              >
                {o.label}
              </Button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">几个人吃？</p>
            {PARTY_OPTIONS.map((o) => (
              <Button
                key={o.value}
                variant="outline"
                className="w-full justify-start"
                onClick={() => setParty(o.value)}
              >
                {o.label}
              </Button>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">愿意走多远？</p>
            {DISTANCE_OPTIONS.map((o) => (
              <Button
                key={o.value}
                variant="outline"
                className="w-full justify-start"
                onClick={() => go(o.value)}
              >
                {o.label}
              </Button>
            ))}
          </div>
        )}

        {step === 4 && picks && (
          <div className="space-y-3">
            {picks.length === 0 && (
              <p className="text-sm text-muted-foreground">
                这个范围内没找到合适的，放宽条件再试？
              </p>
            )}
            {picks.map(({ restaurant: r, reasons }, i) => (
              <div key={r.id} className="flex gap-3 rounded-lg border p-3">
                {/* 缩略图：有照片盖真实照片，否则露菜系 emoji 底（和列表/精选栏一致） */}
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md">
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
                  <div className="flex items-center justify-between gap-2">
                    <a
                      href={googleMapsUrl(r)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate font-semibold hover:underline"
                    >
                      {i === 0 ? "🥇 " : i === 1 ? "🥈 " : "🥉 "}
                      {r.name} ↗
                    </a>
                    <button
                      onClick={() => {
                        onLocate(r.id);
                        onClose();
                      }}
                      className="shrink-0 text-xs text-blue-600 hover:underline"
                    >
                      地图定位
                    </button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.rating != null && (
                      <span className="text-amber-600 dark:text-amber-500">
                        ★ {r.rating}{" "}
                      </span>
                    )}
                    {r.cuisine && <>· {cuisineLabel(r.cuisine)} </>}
                    {r.distanceKm != null && (
                      <>· 🏠 {r.distanceKm.toFixed(1)}km</>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {reasons.map((reason) => (
                      <span
                        key={reason}
                        className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                      >
                        {reason}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={reset}>
              ← 重新选
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
