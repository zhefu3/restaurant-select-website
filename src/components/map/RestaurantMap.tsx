"use client";

/**
 * Leaflet 地图本体（纯客户端）。由 MapView 通过 dynamic(ssr:false) 载入。
 *
 * - marker icon 的 webpack 问题：显式用包内 png 资源重设默认图标。
 * - 489 个点用 MarkerClusterGroup 聚合，缩放时自动成团，避免"一堆针"。
 * - 与列表联动：focusId 变化 → 飞过去并弹窗；点 marker → onSelect 通知列表高亮。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Tooltip,
  Circle,
  CircleMarker,
  Polygon,
  Polyline,
  useMap,
  useMapEvents,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

import { ANCHORS, restaurantConfig, getHomeAnchor } from "@/lib/config";
import { cuisineGroup } from "@/lib/cuisine";
import { isLowRated, isRecommended, type RestaurantView } from "@/lib/types";
import { RestaurantPopup } from "./RestaurantPopup";

const baseIconOptions = {
  iconRetinaUrl: iconRetinaUrl.src,
  iconUrl: iconUrl.src,
  shadowUrl: shadowUrl.src,
  iconSize: [25, 41] as [number, number],
  iconAnchor: [12, 41] as [number, number],
  popupAnchor: [1, -34] as [number, number],
  shadowSize: [41, 41] as [number, number],
};

/* eslint-disable @typescript-eslint/no-explicit-any */
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions(baseIconOptions);

// ── 菜系特色图标（divIcon 自绘，不依赖图片资源，不会破图）──
const GROUP_EMOJI: Record<string, string> = {
  中餐: "🥟",
  日料: "🍣",
  韩餐: "🍖",
  东南亚: "🍜",
  "南亚/印度": "🍛",
  "墨西哥/拉美": "🌮",
  美式: "🍔",
  "意/欧陆": "🍕",
  中东: "🥙",
  海鲜: "🦞",
  "咖啡/甜点/烘焙": "☕",
  "快餐/简餐": "🥪",
  "早餐/早午餐": "🍳",
  酒吧: "🍺",
  素食: "🥗",
  其他: "🍽️",
};

// 图标缓存：同 (emoji, gold) 组合只建一次，几百个 marker 不重复造对象。
const iconCache = new Map<string, L.DivIcon>();
function cuisineIcon(cuisine: string | null, gold: boolean): L.DivIcon {
  const emoji = GROUP_EMOJI[cuisineGroup(cuisine)] ?? "🍽️";
  const key = `${emoji}|${gold}`;
  let icon = iconCache.get(key);
  if (!icon) {
    icon = L.divIcon({
      html: `<div class="cmk${gold ? " cmk-gold" : ""}">${emoji}</div>`,
      className: "cmk-wrap",
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -16],
    });
    iconCache.set(key, icon);
  }
  return icon;
}

const CLUSTER_DISABLE_ZOOM = 16; // 放大到此级别后不再聚合，方便定位单店

// 「我的位置」红色小人图标（带脉冲光环）。
const userIcon = L.divIcon({
  html: '<div class="me-marker"><svg viewBox="0 0 24 24" width="16" height="16" fill="#fff"><circle cx="12" cy="6" r="3.2"/><path d="M12 10.5c-3.2 0-5.5 2.1-5.5 5.2V20h11v-4.3c0-3.1-2.3-5.2-5.5-5.2z"/></svg></div>',
  className: "me-marker-wrap",
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

/**
 * 浏览器定位（免费，不花 Google 钱）。挂载时自动定位显示红色小人（不自动移图），
 * 点按钮再定位并像 Google Maps 一样飞过去放大。失败给出明确提示（权限/系统定位/超时）。
 */
function LocateControl({
  setUserLoc,
  onLocateReady,
}: {
  setUserLoc: (p: { lat: number; lng: number } | null) => void;
  onLocateReady?: (fn: () => void) => void;
}) {
  const map = useMap();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 只挡滚轮（免得在提示框上滚动缩放地图）。
  // 注意：绝不能用 disableClickPropagation——它 stopPropagation 掉原生 click，
  // React 的 onClick 靠冒泡到根节点触发，会被它整个弄哑（踩过）。
  useEffect(() => {
    if (wrapRef.current) L.DomEvent.disableScrollPropagation(wrapRef.current);
  }, []);

  // 错误提示 6 秒后自动消失。
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error]);

  const locate = useCallback(
    (fly: boolean) => {
      if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
        if (fly) setError("此浏览器不支持定位");
        return;
      }
      setLocating(true);
      if (fly) setError(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLoc(p);
          setLocating(false);
          // 像 Google Maps：定位后放大到当前位置（setView 避开 flyTo 被聚类打断）。
          if (fly) map.setView([p.lat, p.lng], 16);
        },
        (err) => {
          setLocating(false);
          if (!fly) return; // 挂载时的自动定位失败保持安静，不打扰
          setError(
            err.code === 1
              ? "浏览器拒绝了定位权限：点地址栏左侧 🔒/ⓘ → 允许「位置」，再点一次"
              : err.code === 2
                ? "获取不到位置：系统「定位服务」可能没开（macOS 设置→隐私与安全性→定位服务）"
                : "定位超时了，再点一次试试",
          );
        },
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
      );
    },
    [map, setUserLoc],
  );

  // 免费 → 挂载时自动定位（只显示小人，不自动移动地图，免得打断浏览）。
  useEffect(() => {
    locate(false);
  }, [locate]);

  // 把「定位并飞过去」的函数交给父组件（供「附近」一键调用）。
  useEffect(() => {
    onLocateReady?.(() => locate(true));
  }, [locate, onLocateReady]);

  return (
    <div ref={wrapRef} className="absolute right-2 top-2 z-[1000]">
      <button
        onClick={() => locate(true)}
        className="flex h-10 w-10 items-center justify-center rounded-md border bg-background/95 shadow backdrop-blur transition-colors hover:bg-accent"
        title="定位到我的位置"
        aria-label="定位到我的位置"
      >
        {/* Google Maps 式准星图标；定位中转圈 */}
        <svg
          viewBox="0 0 24 24"
          className={`h-5 w-5 fill-current ${locating ? "animate-spin opacity-50" : "text-blue-600 dark:text-blue-400"}`}
        >
          <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 3h-2.07A7.005 7.005 0 0 0 13 5.07V3h-2v2.07A7.005 7.005 0 0 0 5.07 11H3v2h2.07A7.005 7.005 0 0 0 11 18.93V21h2v-2.07A7.005 7.005 0 0 0 18.93 13H21v-2zM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10z" />
        </svg>
      </button>
      {error && (
        <div className="absolute right-0 top-11 w-60 rounded-md border bg-background/95 p-2 text-xs leading-relaxed text-foreground shadow-lg backdrop-blur">
          {error}
        </div>
      )}
    </div>
  );
}

export interface RestaurantMapProps {
  restaurants: RestaurantView[];
  showRegion?: boolean;
  /** 列表选中的店 id：地图飞过去并弹窗。 */
  focusId?: number | null;
  /** 点击 marker 时回调（通知列表高亮）。 */
  onSelect?: (id: number) => void;
  onVisited?: () => void;
  /** 当前地区中心 + 切换触发键：地区变化时地图飞过去。 */
  regionCenter?: { lat: number; lng: number } | null;
  regionKey?: number | string;
  /** 地图停下时回报中心（供"以地图中心定点搜索"用）。 */
  onCenterChange?: (c: { lat: number; lng: number }) => void;
  /** 路线地区：解码后的路线折线，画在地图上并缩放到全程。 */
  routeLine?: [number, number][] | null;
  /** 浏览器定位成功后上报「我的位置」（供「离我近」排序用）。 */
  onUserLocate?: (loc: { lat: number; lng: number } | null) => void;
  /** 把 highlight(id) 函数交给父组件，供列表悬停时联动地图。 */
  onHighlightReady?: (fn: (id: number | null) => void) => void;
  /** 把「定位并飞过去」函数交给父组件，供「附近」一键调用。 */
  onLocateReady?: (fn: () => void) => void;
  /** 圈选搜索（②B）：画完多边形后交给父组件调 Google 搜索。不传则不显示圈选按钮。 */
  onPolygonSearch?: (points: [number, number][], done: () => void) => void;
}

/** 地区切换时飞到该地区中心（路线地区则缩放到全程）；并把地图中心回报给父组件。 */
function RegionController({
  regionCenter,
  regionKey,
  onCenterChange,
  routeLine,
}: {
  regionCenter?: { lat: number; lng: number } | null;
  regionKey?: number | string;
  onCenterChange?: (c: { lat: number; lng: number }) => void;
  routeLine?: [number, number][] | null;
}) {
  const map = useMap();
  useEffect(() => {
    // 用 setView / fitBounds 而非 flyTo——本地图聚类会打断 flyTo 动画。
    if (routeLine && routeLine.length > 1) {
      map.fitBounds(L.latLngBounds(routeLine), { padding: [40, 40] });
      return;
    }
    if (!regionCenter) return;
    map.setView([regionCenter.lat, regionCenter.lng], 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionKey]);
  useEffect(() => {
    if (!onCenterChange) return;
    const report = () => {
      const c = map.getCenter();
      onCenterChange({ lat: c.lat, lng: c.lng });
    };
    report(); // 初始也报一次，没拖过地图时定点搜索也有中心可用
    map.on("moveend", report);
    return () => {
      map.off("moveend", report);
    };
  }, [map, onCenterChange]);
  return null;
}

/**
 * 圈选搜索（②B）：点「🔷」进入画多边形模式，点地图加顶点，≥3 点「搜这片」，
 * 交给父组件调 /api/regions/search-polygon（Google，$5/月封顶）。
 */
function DrawControl({
  onSearch,
}: {
  onSearch: (points: [number, number][], done: () => void) => void;
}) {
  const [drawing, setDrawing] = useState(false);
  const [pts, setPts] = useState<[number, number][]>([]);
  const [busy, setBusy] = useState(false);

  useMapEvents({
    click(e) {
      // 点到画板 UI 上的不算顶点（避免点按钮误加点）。
      if (!drawing) return;
      const el = e.originalEvent.target as HTMLElement;
      if (el.closest?.(".draw-ui")) return;
      setPts((p) => [...p, [e.latlng.lat, e.latlng.lng]]);
    },
  });

  function search() {
    if (pts.length < 3) return;
    setBusy(true);
    onSearch(pts, () => {
      setBusy(false);
      setDrawing(false);
      setPts([]);
    });
  }

  return (
    <>
      {pts.length > 0 && (
        <>
          <Polygon
            positions={pts}
            pathOptions={{
              color: "#6366f1",
              weight: 2,
              fillOpacity: 0.1,
              dashArray: "5",
            }}
          />
          {pts.map((p, i) => (
            <CircleMarker
              key={i}
              center={p}
              radius={4}
              pathOptions={{ color: "#fff", weight: 2, fillColor: "#6366f1", fillOpacity: 1 }}
            />
          ))}
        </>
      )}
      <div className="draw-ui absolute right-2 top-[6.5rem] z-[1000]">
        {!drawing ? (
          <button
            onClick={() => {
              setDrawing(true);
              setPts([]);
            }}
            className="flex h-10 w-10 items-center justify-center rounded-md border bg-background/95 text-lg shadow backdrop-blur transition-colors hover:bg-accent"
            title="圈选搜索：画一片区域搜里面的餐厅"
            aria-label="圈选搜索"
          >
            🔷
          </button>
        ) : (
          <div className="flex flex-col gap-1.5 rounded-md border bg-background/95 p-2 text-xs shadow-lg backdrop-blur">
            <div className="text-muted-foreground">
              点地图画范围（{pts.length} 点）
            </div>
            <div className="flex gap-1">
              <button
                onClick={search}
                disabled={pts.length < 3 || busy}
                className="rounded bg-indigo-600 px-2 py-1 text-white transition-colors hover:bg-indigo-700 disabled:opacity-40"
              >
                {busy ? "搜索中…" : "搜这片"}
              </button>
              <button
                onClick={() => setPts((p) => p.slice(0, -1))}
                disabled={!pts.length}
                className="rounded border px-2 py-1 disabled:opacity-40"
              >
                撤销
              </button>
              <button
                onClick={() => {
                  setDrawing(false);
                  setPts([]);
                }}
                className="rounded border px-2 py-1"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/** 「全览」按钮：缩放到显示当前全部餐厅（放大到单店后想看回整体分布）。 */
function FitAllControl({ restaurants }: { restaurants: RestaurantView[] }) {
  const map = useMap();
  const fit = () => {
    const pts = restaurants
      .filter((r) => r.lat != null && r.lng != null)
      .map((r) => [r.lat as number, r.lng as number] as [number, number]);
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40] });
  };
  return (
    <button
      onClick={fit}
      onMouseDown={(e) => e.stopPropagation()}
      className="absolute right-2 top-14 z-[1000] flex h-10 w-10 items-center justify-center rounded-md border bg-background/95 text-lg shadow backdrop-blur transition-colors hover:bg-accent"
      title="全览：缩放到显示全部餐厅"
      aria-label="全览"
    >
      ⊡
    </button>
  );
}

/**
 * 列表→地图悬停联动：把一个 highlight(id) 函数交给父组件，
 * 悬停列表卡片时命令式地开/关对应 marker 的名字 tooltip（不触发 React 重渲染）。
 */
function HighlightController({
  markerRefs,
  onReady,
}: {
  markerRefs: React.MutableRefObject<Map<number, L.Marker>>;
  onReady: (fn: (id: number | null) => void) => void;
}) {
  const prev = useRef<number | null>(null);
  useEffect(() => {
    const closePrev = () => {
      if (prev.current != null) {
        const pm = markerRefs.current.get(prev.current);
        if (pm && pm.getElement()) pm.closeTooltip();
      }
    };
    const highlight = (id: number | null) => {
      if (id === prev.current) return;
      closePrev();
      prev.current = id;
      if (id != null) {
        const m = markerRefs.current.get(id);
        // 仅当 marker 已在图上（非聚类折叠中）才开 tooltip。
        if (m && m.getElement()) m.openTooltip();
      }
    };
    onReady(highlight);
    return () => {
      closePrev();
      onReady(() => {});
    };
  }, [markerRefs, onReady]);
  return null;
}

/** 监听 focusId，飞到对应 marker 并打开其弹窗。 */
function FocusController({
  focusId,
  markerRefs,
}: {
  focusId?: number | null;
  markerRefs: React.MutableRefObject<Map<number, L.Marker>>;
}) {
  const map = useMap();
  useEffect(() => {
    if (focusId == null) return;
    let cancelled = false;
    let tries = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const applyView = () => {
      if (cancelled) return;
      const marker = markerRefs.current.get(focusId);
      if (!marker) {
        // marker 可能还没挂载完（深链/切地区时的竞态）→ 重试最多 ~3s。
        if (tries++ < 20) timers.push(setTimeout(applyView, 150));
        return;
      }
      // 本地图 MarkerClusterGroup(chunkedLoading) 会打断 flyTo 动画导致地图不动，
      // 必须用 setView（瞬移，可靠）。放大到 CLUSTER_DISABLE_ZOOM 让目标 marker 解聚类。
      map.setView(
        marker.getLatLng(),
        Math.max(map.getZoom(), CLUSTER_DISABLE_ZOOM),
      );
      // 解聚类后 marker 才真正在图上，稍延迟再开弹窗。
      timers.push(
        setTimeout(() => {
          if (!cancelled) marker.openPopup();
        }, 350),
      );
    };
    applyView();
    // 深链时 RegionController 可能随后 setView 抢走视角，短暂再确保一次聚焦。
    timers.push(setTimeout(applyView, 300));

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [focusId, map, markerRefs]);
  return null;
}

export default function RestaurantMap({
  restaurants,
  showRegion = true,
  focusId,
  onSelect,
  onVisited,
  regionCenter,
  regionKey,
  onCenterChange,
  routeLine,
  onUserLocate,
  onHighlightReady,
  onLocateReady,
  onPolygonSearch,
}: RestaurantMapProps) {
  const home = getHomeAnchor();
  const markerRefs = useRef<Map<number, L.Marker>>(new Map());
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(
    null,
  );

  // 定位成功后把「我的位置」上报给父组件（供「离我近」排序）。
  useEffect(() => {
    if (userLoc) onUserLocate?.(userLoc);
  }, [userLoc, onUserLocate]);

  const trianglePositions = useMemo(
    () => ANCHORS.map((a) => [a.lat, a.lng] as [number, number]),
    [],
  );

  // 有坐标、且不是"去过但只有 1–2 星"的店才显示。
  const visible = restaurants.filter(
    (r) => r.lat != null && r.lng != null && !isLowRated(r),
  );

  return (
    <MapContainer
      center={[home.lat, home.lng]}
      zoom={11}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {showRegion && (
        <>
          <Polygon
            positions={trianglePositions}
            pathOptions={{ color: "#64748b", weight: 1, fillOpacity: 0.04 }}
          />
          {ANCHORS.map((a) => (
            <Circle
              key={a.key}
              center={[a.lat, a.lng]}
              radius={restaurantConfig.anchorRadiusKm * 1000}
              pathOptions={{ color: "#94a3b8", weight: 1, fillOpacity: 0.03 }}
            />
          ))}
        </>
      )}

      <MarkerClusterGroup
        chunkedLoading
        disableClusteringAtZoom={CLUSTER_DISABLE_ZOOM}
        maxClusterRadius={50}
        showCoverageOnHover={false}
      >
        {visible.map((r) => (
          <Marker
            key={r.id}
            position={[r.lat as number, r.lng as number]}
            icon={cuisineIcon(r.cuisine, isRecommended(r))}
            ref={(m) => {
              if (m) markerRefs.current.set(r.id, m);
              else markerRefs.current.delete(r.id);
            }}
            eventHandlers={{
              click: () => onSelect?.(r.id),
              // 弹窗关闭时统一刷新数据（弹窗内的想去吃/打分不立即刷，避免弹窗被关）
              popupclose: () => onVisited?.(),
            }}
          >
            <Tooltip direction="top" offset={[0, -14]} opacity={0.95}>
              {r.name}
            </Tooltip>
            <Popup>
              <RestaurantPopup restaurant={r} onVisited={onVisited} />
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>

      {routeLine && routeLine.length > 1 && (
        <Polyline
          positions={routeLine}
          pathOptions={{ color: "#3b82f6", weight: 4, opacity: 0.75 }}
        />
      )}

      {userLoc && (
        <Marker position={[userLoc.lat, userLoc.lng]} icon={userIcon}>
          <Popup>我在这 📍</Popup>
        </Marker>
      )}

      <LocateControl setUserLoc={setUserLoc} onLocateReady={onLocateReady} />
      <FitAllControl restaurants={visible} />
      {onPolygonSearch && <DrawControl onSearch={onPolygonSearch} />}
      {onHighlightReady && (
        <HighlightController
          markerRefs={markerRefs}
          onReady={onHighlightReady}
        />
      )}
      <FocusController focusId={focusId} markerRefs={markerRefs} />
      <RegionController
        regionCenter={regionCenter}
        regionKey={regionKey}
        onCenterChange={onCenterChange}
        routeLine={routeLine}
      />
    </MapContainer>
  );
}
