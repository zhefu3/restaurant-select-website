"use client";

import { useEffect } from "react";

/** 生产环境注册 Service Worker（离线壳）。dev 不注册，避免缓存干扰热更新。 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
