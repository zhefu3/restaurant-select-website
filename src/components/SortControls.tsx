"use client";

import { Button } from "@/components/ui/button";

export type SortKey =
  | "default"
  | "reviews"
  | "rating"
  | "distance"
  | "nearMe"
  | "taste"
  | "added"
  | "myRating";
export type SortDir = "desc" | "asc";

export interface SortState {
  key: SortKey;
  dir: SortDir;
}

const OPTIONS: { key: Exclude<SortKey, "default">; label: string }[] = [
  { key: "reviews", label: "评论数" },
  { key: "rating", label: "评分" },
  { key: "distance", label: "离家近" },
  { key: "nearMe", label: "离我近" },
  { key: "added", label: "最近添加" },
  { key: "myRating", label: "我的打分" },
  { key: "taste", label: "合口味" },
];

/** 每个维度首次点击的默认方向：评论数/评分要「高→低」，距离要「近→远」。 */
function initialDir(key: Exclude<SortKey, "default">): SortDir {
  return key === "distance" || key === "nearMe" ? "asc" : "desc";
}

/**
 * 排序控件。点一个维度 → 默认方向；再点同一个 → 反向；第三次点 → 取消（回默认）。
 * 默认按发现时的复合分（评论数×评分）排列。
 */
export function SortControls({
  value,
  onChange,
  showTaste = false,
  showNearMe = false,
}: {
  value: SortState;
  onChange: (next: SortState) => void;
  /** 口味画像就绪（≥3 条打分记录）才显示「合口味」。 */
  showTaste?: boolean;
  /** 定位成功后才显示「离我近」。 */
  showNearMe?: boolean;
}) {
  function handleClick(key: Exclude<SortKey, "default">) {
    if (value.key !== key) {
      onChange({ key, dir: initialDir(key) });
    } else if (value.dir === initialDir(key)) {
      onChange({ key, dir: value.dir === "desc" ? "asc" : "desc" });
    } else {
      onChange({ key: "default", dir: "desc" });
    }
  }

  const options = OPTIONS.filter(
    (o) =>
      (o.key !== "taste" || showTaste) && (o.key !== "nearMe" || showNearMe),
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">排序：</span>
      {options.map((o) => {
        const active = value.key === o.key;
        const arrow = active ? (value.dir === "desc" ? " ↓" : " ↑") : "";
        return (
          <Button
            key={o.key}
            size="sm"
            variant={active ? "default" : "outline"}
            onClick={() => handleClick(o.key)}
          >
            {o.label}
            {arrow}
          </Button>
        );
      })}
    </div>
  );
}

/** 按当前排序状态排列餐厅（不改原数组）。 */
export function sortRestaurants<
  T extends {
    rating: number | null;
    reviewCount: number | null;
    distanceKm?: number;
    distanceFromMeKm?: number;
    tasteScore?: number;
    myRating?: number | null;
    addedAt?: string | Date;
  },
>(list: T[], sort: SortState): T[] {
  if (sort.key === "default") return list;

  const getValue = (x: T): number => {
    if (sort.key === "reviews") return x.reviewCount ?? -Infinity;
    if (sort.key === "rating") return x.rating ?? -Infinity;
    if (sort.key === "taste") return x.tasteScore ?? -Infinity;
    if (sort.key === "myRating") return x.myRating ?? -Infinity;
    if (sort.key === "added")
      return x.addedAt ? new Date(x.addedAt).getTime() : -Infinity;
    if (sort.key === "nearMe") return x.distanceFromMeKm ?? Infinity;
    // distance：无距离的排到最后（升序时给 +Infinity）。
    return x.distanceKm ?? Infinity;
  };

  const factor = sort.dir === "desc" ? -1 : 1;
  return [...list].sort((a, b) => (getValue(a) - getValue(b)) * factor);
}
