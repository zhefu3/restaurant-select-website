"use client";

/** 回到顶部浮动按钮：页面滚下去 400px 后出现（左下角，避开右下角聊天气泡）。 */

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

export function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 200);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!show) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed bottom-24 left-5 z-[1100] flex items-center gap-1 rounded-full border bg-background/90 px-3 py-2.5 text-xs font-medium shadow-lg backdrop-blur transition-transform hover:scale-105"
      title="回到顶部"
      aria-label="回到顶部"
    >
      <ArrowUp className="h-4 w-4" />
      顶部
    </button>
  );
}
