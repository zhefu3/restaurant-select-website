/** 一次性生成 PWA 图标（512/192/apple-touch 180）。改了 SVG 再跑即可。 */

import sharp from "sharp";
import { mkdirSync } from "node:fs";

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#0f172a"/>
  <!-- 碗 -->
  <path d="M106 262 h300 a150 150 0 0 1 -300 0 z" fill="#f59e0b"/>
  <path d="M106 262 h300 a150 150 0 0 1 -8 46 h-284 a150 150 0 0 1 -8 -46 z" fill="#fbbf24"/>
  <!-- 筷子 -->
  <rect x="292" y="88" width="16" height="180" rx="8" fill="#e2e8f0" transform="rotate(18 300 178)"/>
  <rect x="330" y="80" width="16" height="188" rx="8" fill="#cbd5e1" transform="rotate(24 338 174)"/>
  <!-- 热气 -->
  <path d="M186 200 q-12 -22 0 -42 q12 -20 0 -40" stroke="#94a3b8" stroke-width="14" stroke-linecap="round" fill="none"/>
  <path d="M236 208 q-12 -22 0 -42 q12 -20 0 -40" stroke="#94a3b8" stroke-width="14" stroke-linecap="round" fill="none"/>
</svg>`;

async function main() {
  mkdirSync("public", { recursive: true });
  const buf = Buffer.from(svg);
  await sharp(buf).resize(512, 512).png().toFile("public/icon-512.png");
  await sharp(buf).resize(192, 192).png().toFile("public/icon-192.png");
  await sharp(buf).resize(180, 180).png().toFile("public/apple-touch-icon.png");
  console.log("✅ 图标已生成：public/icon-512.png, icon-192.png, apple-touch-icon.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
