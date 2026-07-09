"use client";

import { Button } from "@/components/ui/button";
import type { RestaurantSource, VisitFilter } from "@/lib/types";

export interface FilterState {
  visit: VisitFilter;
  source: RestaurantSource | "all";
}

const VISIT_TABS: { key: VisitFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "want", label: "想去吃" },
  { key: "visited", label: "去过" },
];

const SOURCE_TABS: { key: RestaurantSource | "all"; label: string }[] = [
  { key: "all", label: "全部来源" },
  { key: "google", label: "Google" },
  { key: "xhs", label: "小红书" },
];

export function Filters({
  value,
  onChange,
}: {
  value: FilterState;
  onChange: (next: FilterState) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex gap-1">
        {VISIT_TABS.map((t) => (
          <Button
            key={t.key}
            size="sm"
            variant={value.visit === t.key ? "default" : "outline"}
            onClick={() => onChange({ ...value, visit: t.key })}
          >
            {t.label}
          </Button>
        ))}
      </div>
      <div className="flex gap-1">
        {SOURCE_TABS.map((t) => (
          <Button
            key={t.key}
            size="sm"
            variant={value.source === t.key ? "secondary" : "ghost"}
            onClick={() => onChange({ ...value, source: t.key })}
          >
            {t.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
