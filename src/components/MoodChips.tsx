"use client";

/** 「适合场景」快捷筛选（约会/聚餐/一人食…）。点一下按场景启发式筛，再点取消。 */

import { MOODS } from "@/lib/filters";

export function MoodChips({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (mood: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">适合：</span>
      {MOODS.map((m) => {
        const on = value === m.key;
        return (
          <button
            key={m.key}
            onClick={() => onChange(on ? null : m.key)}
            aria-pressed={on}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              on
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {m.emoji} {m.label}
          </button>
        );
      })}
    </div>
  );
}
