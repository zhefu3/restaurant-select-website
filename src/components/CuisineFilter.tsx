"use client";

import type { CuisineOption } from "@/lib/cuisine";

/**
 * 菜系筛选下拉。选项从当前餐厅集合动态统计得来（带数量），按数量排序。
 * 选中某菜系后，排序功能仍作用于筛选结果。
 */
export function CuisineFilter({
  options,
  value,
  onChange,
}: {
  options: CuisineOption[];
  value: string; // "all" 或某原始 cuisine
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">菜系：</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="all">全部菜系</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}（{o.count}）
          </option>
        ))}
      </select>
    </div>
  );
}
