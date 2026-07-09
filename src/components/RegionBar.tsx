"use client";

/**
 * 地区切换条：🏠南湾 / 旅行地区 tab + 「探索新地区」。
 * 城市：文本搜索；定点：以当前地图中心 + N 英里。查到的存进对应地区，互不污染。
 */

import { useState } from "react";
import { Plus, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PUBLIC_DEMO } from "@/lib/demo";

export interface RegionSummary {
  id: number;
  name: string;
  kind: string;
  centerLat: number | null;
  centerLng: number | null;
  count: number;
  /** route 地区：polyline + 距离/时长（供地图画线）。 */
  route?: {
    polyline: string;
    from?: string;
    to?: string;
    distanceMiles?: number;
    durationMinutes?: number;
  } | null;
}

export function RegionBar({
  regions,
  activeId,
  onSelect,
  onSearched,
  onDeleted,
  getMapCenter,
}: {
  regions: RegionSummary[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onSearched: (regionId: number) => void;
  onDeleted: () => void;
  /** 点击搜索时实时读取地图中心（存 ref，不随拖动重渲染）。 */
  getMapCenter: () => { lat: number; lng: number } | null;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"city" | "point" | "route">("city");
  const [city, setCity] = useState("");
  const [radiusMiles, setRadiusMiles] = useState(10);
  const [routeFrom, setRouteFrom] = useState("");
  const [routeTo, setRouteTo] = useState("");
  // 可配置质量门槛（每次搜索可调）
  const [minRating, setMinRating] = useState(4.0);
  const [minReviews, setMinReviews] = useState(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch() {
    setLoading(true);
    setError(null);
    try {
      const mapCenter = getMapCenter();
      const thresholds = { minRating, minReviews };
      let url = "/api/regions/search";
      let body: Record<string, unknown>;
      if (mode === "route") {
        url = "/api/regions/search-route";
        body = { from: routeFrom, to: routeTo, ...thresholds };
      } else if (mode === "city") {
        body = { mode, query: city, ...thresholds };
      } else {
        body = {
          mode,
          lat: mapCenter?.lat,
          lng: mapCenter?.lng,
          radiusMiles,
          regionName: `${city || "定点"} ${radiusMiles}mi`,
          ...thresholds,
        };
      }
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.capped ? "本月 Google 花费已达上限" : data.error);
      setOpen(false);
      setCity("");
      onSearched(data.regionId);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function del(id: number) {
    if (!confirm("删除这个旅行地区（连带里面的餐厅）？")) return;
    await fetch("/api/regions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regionId: id }),
    });
    onDeleted();
  }

  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {regions.map((r) => {
          const active = r.id === activeId;
          const isHome = r.kind === "home";
          return (
            <div key={r.id} className="relative">
              <button
                onClick={() => onSelect(r.id)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input hover:bg-accent"
                }`}
              >
                {isHome ? "🏠 " : r.kind === "route" ? "🛣️ " : "✈️ "}
                {r.name}
                <span className="ml-1 opacity-70">{r.count}</span>
                {!isHome && !PUBLIC_DEMO && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      del(r.id);
                    }}
                    className="ml-1.5 inline-flex opacity-60 hover:opacity-100"
                    title="删除地区"
                  >
                    <X className="h-3 w-3" />
                  </span>
                )}
              </button>
            </div>
          );
        })}
        {!PUBLIC_DEMO && (
          <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
            <Plus className="h-4 w-4" />
            探索新地区
          </Button>
        )}
      </div>

      {open && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={mode === "city" ? "default" : "outline"}
              onClick={() => setMode("city")}
            >
              按城市
            </Button>
            <Button
              size="sm"
              variant={mode === "point" ? "default" : "outline"}
              onClick={() => setMode("point")}
            >
              按定点（地图中心）
            </Button>
            <Button
              size="sm"
              variant={mode === "route" ? "default" : "outline"}
              onClick={() => setMode("route")}
            >
              🛣️ 按路线
            </Button>
          </div>

          {mode === "route" ? (
            <div className="space-y-1.5">
              <input
                value={routeFrom}
                onChange={(e) => setRouteFrom(e.target.value)}
                placeholder="起点，如 San Jose 或具体地址"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <input
                value={routeTo}
                onChange={(e) => setRouteTo(e.target.value)}
                placeholder="终点，如 Napa、Los Angeles"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                按真实驾车路线找沿途高分餐厅，地图上会画出路线。
              </p>
            </div>
          ) : mode === "city" ? (
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="城市或地点，如 Seattle、Napa、Cupertino"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          ) : (
            <div className="space-y-1 text-sm">
              <p className="text-xs text-muted-foreground">
                把地图拖到目标位置，点搜索时以当前地图中心为圆心。
              </p>
              <label className="flex items-center gap-2">
                半径
                <input
                  type="number"
                  value={radiusMiles}
                  min={1}
                  max={30}
                  onChange={(e) => setRadiusMiles(Number(e.target.value))}
                  className="h-8 w-16 rounded-md border border-input bg-background px-2"
                />
                英里
              </label>
            </div>
          )}

          {/* 质量门槛（可按需调，小城市可放宽） */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <label className="flex items-center gap-1">
              评分 ≥
              <input
                type="number"
                step={0.1}
                min={0}
                max={5}
                value={minRating}
                onChange={(e) => setMinRating(Number(e.target.value))}
                className="h-7 w-14 rounded-md border border-input bg-background px-1.5 text-sm text-foreground"
              />
            </label>
            <label className="flex items-center gap-1">
              评论数 ≥
              <input
                type="number"
                step={50}
                min={0}
                value={minReviews}
                onChange={(e) => setMinReviews(Number(e.target.value))}
                className="h-7 w-16 rounded-md border border-input bg-background px-1.5 text-sm text-foreground"
              />
            </label>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={runSearch}
              disabled={
                loading ||
                (mode === "city"
                  ? !city.trim()
                  : mode === "route"
                    ? !routeFrom.trim() || !routeTo.trim()
                    : false)
              }
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" /> 搜索中…
                </>
              ) : (
                "搜索并添加"
              )}
            </Button>
            {error && <span className="text-xs text-destructive">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
