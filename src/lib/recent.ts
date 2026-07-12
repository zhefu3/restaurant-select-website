/** 「最近看过」的餐厅 id（localStorage，最多 12 个，最新在前）。零成本、纯本地。 */

const KEY = "athroics:recent";
const MAX = 12;

export function pushRecent(id: number) {
  if (typeof window === "undefined") return;
  try {
    const cur = getRecent().filter((x) => x !== id);
    cur.unshift(id);
    localStorage.setItem(KEY, JSON.stringify(cur.slice(0, MAX)));
  } catch {
    /* localStorage 不可用则忽略 */
  }
}

export function getRecent(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "number") : [];
  } catch {
    return [];
  }
}
