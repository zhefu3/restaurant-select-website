import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Leaflet ships CommonJS; keep it external-friendly.
  reactStrictMode: true,
  // 自托管/Docker 部署时产出精简独立包（Vercel 会忽略此项，不影响）。
  output: "standalone",
};

export default nextConfig;
