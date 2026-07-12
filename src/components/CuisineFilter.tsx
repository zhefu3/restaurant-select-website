"use client";

import { useEffect, useRef, useState } from "react";
import type { CuisineOption } from "@/lib/cuisine";

/**
 * 菜系多选筛选。点开一个下拉面板，勾选多个菜系大类（带数量）；
 * 空 = 全部菜系。选项从当前餐厅集合动态统计、按数量排序。
 */
export function CuisineFilter({
  options,
  values,
  onToggle,
  onClear,
}: {
  options: CuisineOption[];
  values: string[];
  onToggle: (v: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 点面板外关闭。
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const label =
    values.length === 0
      ? "全部菜系"
      : values.length === 1
        ? values[0]
        : `${values[0]} +${values.length - 1}`;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">菜系：</span>
      <div ref={wrapRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={`flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            values.length > 0
              ? "border-foreground/30 bg-accent"
              : "border-input bg-background hover:bg-accent"
          }`}
        >
          <span className="max-w-[8rem] truncate">{label}</span>
          <span className="text-xs text-muted-foreground">{open ? "▲" : "▼"}</span>
        </button>
        {open && (
          <div className="absolute left-0 top-10 z-30 max-h-72 w-56 overflow-y-auto rounded-lg border bg-background p-1.5 shadow-xl">
            <div className="flex items-center justify-between px-1.5 py-1">
              <span className="text-[11px] text-muted-foreground">
                {values.length > 0 ? `已选 ${values.length}` : "多选菜系"}
              </span>
              {values.length > 0 && (
                <button
                  onClick={onClear}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  清空
                </button>
              )}
            </div>
            {options.map((o) => {
              const checked = values.includes(o.value);
              return (
                <button
                  key={o.value}
                  onClick={() => onToggle(o.value)}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                      checked
                        ? "border-foreground bg-foreground text-background"
                        : "border-input"
                    }`}
                  >
                    {checked ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {o.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
