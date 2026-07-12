"use client";

/** 头部「🧰 工具」下拉：把 ⌘K 里的工具类操作也摆到显眼处，提升可发现性。 */

import { useEffect, useRef, useState } from "react";

export interface ToolItem {
  key: string;
  icon: string;
  label: string;
  run: () => void;
}

export function HeaderTools({ items }: { items: ToolItem[] }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="工具"
        aria-label="工具"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-input text-sm transition-colors hover:bg-accent"
      >
        🧰
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-40 w-52 overflow-hidden rounded-xl border bg-background p-1.5 shadow-2xl">
          <div className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            工具
          </div>
          {items.map((it) => (
            <button
              key={it.key}
              onClick={() => {
                it.run();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent"
            >
              <span className="text-base">{it.icon}</span>
              <span className="min-w-0 flex-1 truncate">{it.label}</span>
            </button>
          ))}
          <div className="mt-1 border-t px-2.5 pb-1 pt-1.5 text-[10px] text-muted-foreground">
            也可按 ⌘K 快速呼出
          </div>
        </div>
      )}
    </div>
  );
}
