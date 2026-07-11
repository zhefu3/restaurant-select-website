"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/** 浅色/深色切换，存 localStorage。日↔月 丝滑动画 + 切换时全页平滑过渡。 */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const root = document.documentElement;
    const next = !root.classList.contains("dark");
    // 切换瞬间挂上过渡类，让整页颜色平滑淡变，动画结束后摘掉（避免干扰其它交互）
    root.classList.add("theme-anim");
    root.classList.toggle("dark", next);
    window.setTimeout(() => root.classList.remove("theme-anim"), 550);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
    setDark(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label={dark ? "切换到浅色" : "切换到深色"}
      title={dark ? "浅色模式" : "深色模式"}
      className="theme-toggle inline-flex h-9 w-9 items-center justify-center rounded-full border border-input bg-background transition-colors hover:bg-accent"
    >
      <span className="glow" aria-hidden />
      <span className="ico ico-sun" aria-hidden>
        <Sun className="h-[18px] w-[18px]" strokeWidth={2.2} />
      </span>
      <span className="ico ico-moon" aria-hidden>
        <Moon className="h-[17px] w-[17px]" strokeWidth={2.2} />
      </span>
    </button>
  );
}
