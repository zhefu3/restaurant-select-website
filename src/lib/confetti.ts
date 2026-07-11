/**
 * 命令式彩带：直接往 document.body 撒一层彩带，~1.6s 后自清理。
 * 不走 React 渲染树——所以选餐时那波「聚焦地图 986 marker」的重渲染卡顿动不了它，
 * 点下去立刻就有，且 transform/opacity 走合成器，主线程忙也照跑。
 */

const COLORS = ["#f59e0b", "#fb7185", "#34d399", "#60a5fa", "#a78bfa", "#fbbf24"];

export function fireConfetti(count = 34): void {
  if (typeof document === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const layer = document.createElement("div");
  layer.className = "confetti-layer";

  for (let i = 0; i < count; i++) {
    const bit = document.createElement("span");
    bit.className = "confetti-bit";
    bit.style.left = `${Math.random() * 100}%`;
    bit.style.background = COLORS[i % COLORS.length];
    bit.style.setProperty("--dx", `${(Math.random() - 0.5) * 200}px`);
    bit.style.setProperty("--delay", `${Math.random() * 0.18}s`);
    bit.style.setProperty("--rot", `${(Math.random() - 0.5) * 720}deg`);
    layer.appendChild(bit);
  }

  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 1900);
}
