"use client";

/**
 * 地图的 SSR 安全外壳：Leaflet 只能在浏览器跑，
 * 这里用 dynamic import + ssr:false 保证它绝不在服务端渲染。
 */

import dynamic from "next/dynamic";
import type { RestaurantMapProps } from "./RestaurantMap";

const RestaurantMap = dynamic(() => import("./RestaurantMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-slate-100 text-sm text-slate-400">
      地图加载中…
    </div>
  ),
});

export function MapView(props: RestaurantMapProps) {
  return <RestaurantMap {...props} />;
}

export type { RestaurantMapProps };
