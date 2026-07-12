/**
 * 我的评分（0–100）→ 色阶（借鉴 Beli 的「醒目彩色数字」）。
 * 卡片右侧徽章、我的美食榜共用，保证同一分数在全站颜色一致。
 */
export interface ScoreTier {
  bg: string;
  ring: string;
  text: string;
}

export function scoreTier(score: number): ScoreTier {
  if (score >= 80)
    return {
      bg: "bg-amber-100 dark:bg-amber-950/50",
      ring: "ring-amber-300 dark:ring-amber-800/60",
      text: "text-amber-700 dark:text-amber-300",
    };
  if (score >= 65)
    return {
      bg: "bg-emerald-100 dark:bg-emerald-950/50",
      ring: "ring-emerald-300 dark:ring-emerald-800/60",
      text: "text-emerald-700 dark:text-emerald-300",
    };
  if (score >= 50)
    return {
      bg: "bg-lime-100 dark:bg-lime-950/50",
      ring: "ring-lime-300 dark:ring-lime-800/60",
      text: "text-lime-700 dark:text-lime-300",
    };
  if (score >= 35)
    return {
      bg: "bg-orange-100 dark:bg-orange-950/40",
      ring: "ring-orange-300 dark:ring-orange-800/60",
      text: "text-orange-700 dark:text-orange-300",
    };
  return {
    bg: "bg-rose-100 dark:bg-rose-950/40",
    ring: "ring-rose-300 dark:ring-rose-800/60",
    text: "text-rose-700 dark:text-rose-300",
  };
}
