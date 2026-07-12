"use client";

/** 「导出清单」：把想去/去过的店导成带 Google Maps 链接的文本，一键复制去分享或规划。零成本。 */

import { useMemo, useState } from "react";
import { cuisineLabel } from "@/lib/cuisine";
import { googleMapsUrl, type RestaurantView } from "@/lib/types";
import { useEscape } from "@/lib/use-escape";

type Mode = "want" | "visited";

export function ExportModal({
  open,
  onClose,
  restaurants,
  regionName,
}: {
  open: boolean;
  onClose: () => void;
  restaurants: RestaurantView[];
  regionName: string;
}) {
  useEscape(open, onClose);
  const [mode, setMode] = useState<Mode>("want");
  const [copied, setCopied] = useState(false);

  const text = useMemo(() => {
    const list = restaurants
      .filter((r) => (mode === "want" ? r.wantToEat && !r.visited : r.visited))
      .sort((a, b) =>
        mode === "visited"
          ? (b.myRating ?? 0) - (a.myRating ?? 0)
          : (b.rating ?? 0) - (a.rating ?? 0),
      );
    if (list.length === 0) return "";
    const title =
      mode === "want"
        ? `📍 ${regionName} · 我想去的店（${list.length}）`
        : `✓ ${regionName} · 我去过的店（${list.length}）`;
    const lines = list.map((r, i) => {
      const bits = [
        r.rating != null ? `★${r.rating}` : null,
        cuisineLabel(r.cuisine),
        r.priceLevel != null && r.priceLevel > 0 ? "¥".repeat(r.priceLevel) : null,
        mode === "visited" && r.myRating != null ? `我${r.myRating}分` : null,
      ].filter(Boolean);
      return `${i + 1}. ${r.name}（${bits.join(" · ")}）\n   ${googleMapsUrl(r)}`;
    });
    return `${title}\n\n${lines.join("\n")}\n\n— 由 Athroics 美食地图整理`;
  }, [restaurants, mode, regionName]);

  const count = useMemo(
    () =>
      restaurants.filter((r) =>
        mode === "want" ? r.wantToEat && !r.visited : r.visited,
      ).length,
    [restaurants, mode],
  );

  if (!open) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* 剪贴板不可用则忽略（用户可手动选中复制） */
    }
  };

  const Tab = ({ m, label }: { m: Mode; label: string }) => (
    <button
      onClick={() => setMode(m)}
      className={`rounded-full px-3 py-1 text-xs transition-colors ${
        mode === m
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/60"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-start justify-center bg-black/50 p-4 pt-[8vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="导出清单"
        className="flex max-h-[82vh] w-[min(94vw,480px)] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <div className="font-semibold">📋 导出清单</div>
            <div className="text-xs text-muted-foreground">
              带 Google Maps 链接，复制去分享或规划
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

        <div className="flex items-center gap-1.5 border-b px-4 py-2">
          <Tab m="want" label="想去吃" />
          <Tab m="visited" label="去过" />
          <span className="ml-auto text-xs text-muted-foreground">{count} 家</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {text ? (
            <textarea
              readOnly
              value={text}
              onFocus={(e) => e.currentTarget.select()}
              className="h-64 w-full resize-none rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          ) : (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <div className="text-3xl">📋</div>
              <p className="mt-2">
                {mode === "want" ? "还没有想去的店" : "还没有去过打卡的店"}
              </p>
            </div>
          )}
        </div>

        {text && (
          <div className="border-t px-4 py-3">
            <button
              onClick={copy}
              className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {copied ? "✓ 已复制到剪贴板" : "复制全部"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
