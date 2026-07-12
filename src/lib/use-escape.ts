"use client";

import { useEffect } from "react";

/** active 为真时，按 Esc 触发 onEscape（关弹窗/模态），并锁住背景滚动。 */
export function useEscape(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", onKey);
    // 模态打开时锁背景滚动，避免弹窗后面的长列表跟着滚（体验更稳）。
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [active, onEscape]);
}
