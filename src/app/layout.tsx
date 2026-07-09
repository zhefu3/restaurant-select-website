import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

const DESCRIPTION = "个人餐厅地图 — 想去吃 / 去过 / 评分 / 今晚吃什么";

export const metadata: Metadata = {
  // 让 OG/Twitter 图片解析成绝对地址；部署时设 NEXT_PUBLIC_SITE_URL 为真实域名。
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  ),
  title: "Athroics · 餐厅",
  description: DESCRIPTION,
  manifest: "/manifest.json",
  applicationName: "Athroics 餐厅",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "餐厅",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
  // 分享到个人网站/社媒时的链接预览。
  openGraph: {
    title: "Athroics · 餐厅",
    description: DESCRIPTION,
    type: "website",
    locale: "zh_CN",
    images: ["/icon-512.png"],
  },
  twitter: {
    card: "summary",
    title: "Athroics · 餐厅",
    description: DESCRIPTION,
    images: ["/icon-512.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  // 地图双指缩放需要，别禁用户缩放
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {/* 无闪烁：首帧前按 localStorage/系统偏好设好 .dark。 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||((!t||t==='system')&&matchMedia('(prefers-color-scheme:dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`,
          }}
        />
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
