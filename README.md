# Athroics · 餐厅模块

个人助理 Athroics 的第一个模块。本轮**只做餐厅**，但骨架已按能容纳后续 5 个模块
（CS2 电竞 / 电影 / 音乐剧 / 提醒 / 每日简报）搭好：`src/collectors/` 目录、`config.ts`
里的 `futureModules` 占位、env 里的注释占位。

## 功能

1. **区域发现** — 手动脚本 `npm run discover`。区域 = △(斯坦福 / SJC / 家) ∪ 三个 10km 圆，网格采样 → Google Places → 过滤 `rating≥4.0 且 reviews≥100` → 去重入库（南湾主库 965 家）。
2. **小红书增量** — 粘贴框贴**链接 / 文字 / 截图**：链接 best-effort 抓公开摘要（反爬抓不到提示改贴文字/截图），Claude 提取店名 + **评价摘要 + 推荐菜** → Places 反查 → 确认加入「想去吃」，卡片 📕 标记、弹窗「小红书怎么说」展示。一次 >10 家的合集自动批量入库。
3. **去过 + 评分** — 弹窗内 **0–100 分制**打分（快捷键 95/85/75/60/40 或手输）；≥80 金色推荐，≤40 地图隐藏。⭐想去吃 / ✓去过。
4. **地图 + 列表** — Leaflet + OSM，菜系 emoji 图标 + 聚合；列表↔地图联动；搜索 / 菜系大类 / 城市 / 价格 / 距离 / 隐藏连锁筛选，多种排序。
5. **智能选餐** — 今晚吃什么向导、帮我选、排位赛(Elo)、口味画像、推荐点菜(评论挖招牌菜)、AI 菜单翻译、我的点评。
6. **旅行地区** — 按城市 / 定点 / 真实驾车路线搜索沿途餐厅，地区互不污染、全部缓存。
7. **对话 Agent** — 右下气泡，工具调用型只读推荐（Sonnet 5）。
8. **PWA + 只读演示** — 可装手机、离线壳；`DEMO_MODE` 一键变只读演示。

## 技术栈

Next.js 15 (App Router, TS) · Tailwind + shadcn 风格组件 · react-leaflet v5 + OSM ·
Turso/libSQL + Drizzle · Google Places (New) + Routes + Geocoding · Anthropic API
(Sonnet 5 对话 / Haiku 提取·vision) · PWA(manifest + service worker)。

## 快速开始

```bash
# 1. 装依赖
npm install

# 2. 配环境变量
cp .env.example .env
#   填入 GOOGLE_PLACES_API_KEY 和 ANTHROPIC_API_KEY
#   TURSO_* 可留空 → 本地自动用 file:./local.db

# 3. 建表 + 初始化 config
npm run db:push
npm run db:seed

# 4. 起开发服务器
npm run dev        # http://localhost:3000

# 5.（配好 Google key 后）跑一次区域发现
npm run discover              # 全量
npm run discover -- --limit 5 # 只跑前 5 个网格点（省钱调试）
```

## 成本控制

Google Places 花费记在 `api_usage` 表，按月累计；`GOOGLE_PLACES_MONTHLY_CAP_USD`
（默认 $180）**硬熔断**——每次付费调用前检查，超上限即停。结果按 `place_id` 缓存入库，
重复的只刷新评分不重复计费。

## 部署到云端（任何设备 / 手机访问）

本地 `file:./local.db` 只在自己电脑上能用。要在别的电脑、手机上访问，需要：
**① 云数据库（Turso）+ ② 托管（Vercel 最省事）**。

```bash
# ① Turso：建云库，把本地数据搬上去
turso db create athroics
turso db show athroics --url          # → TURSO_DATABASE_URL
turso db tokens create athroics       # → TURSO_AUTH_TOKEN
sqlite3 local.db .dump | turso db shell athroics   # 本地 965+ 家一次性导入

# ② Vercel：连接 GitHub 仓库，在 Project → Settings → Environment Variables 填：
#   TURSO_DATABASE_URL / TURSO_AUTH_TOKEN / GOOGLE_PLACES_API_KEY / ANTHROPIC_API_KEY
#   （自用实例不要设 DEMO_MODE）
# 然后 Deploy。Next.js 15 App Router 在 Vercel 上零配置可跑。
```

装到手机：用手机浏览器打开部署后的网址 → 「添加到主屏幕」，即得一个全屏 PWA（已带 manifest + 图标 + 离线壳）。

## 只读演示（放个人网站，别人能看不能花你的钱）

再部署**第二个**实例（或同一部署设不同环境变量），设置：

```
DEMO_MODE=1
NEXT_PUBLIC_DEMO_MODE=1
```

- 服务端 `middleware.ts` 硬拦截：所有写请求 + 会花钱的读请求（小红书提取、AI 菜单、推荐点菜、地区搜索、对话 Agent）一律 403。**访客点什么都烧不到你的 Google/Anthropic 额度，也改不了你的数据。**
- 前端隐藏这些入口并显示「🔒 只读演示」横幅；地图 / 列表 / 筛选 / 排序 / 看菜单点评 / 小红书笔记等**已缓存**内容照常浏览。
- 演示库建议用一份快照，并去掉私人自由文本（保留评分/推荐/小红书摘要，去掉点评正文和到访备注）：

```bash
cp local.db demo.db
sqlite3 demo.db "UPDATE restaurant_reviews SET body=''; UPDATE visits SET notes=NULL;"
sqlite3 demo.db .dump | turso db shell athroics-demo   # 导入演示专用云库
```

## 目录

```
src/
  middleware.ts   只读演示硬闸（DEMO_MODE 时拦写请求 + 花钱的读请求）
  app/            页面 + API 路由（restaurants/xhs/visits/wishlist/review/
                  dishes/menu/chat/regions/duel/restaurant-extra …）+ error/layout
  components/     地图(MapView→RestaurantMap, ssr:false)、列表、粘贴框、筛选、
                  弹窗、对话气泡、向导/排位、ServiceWorkerRegister
  db/             Drizzle schema(10 表) + 客户端
  lib/            config · geo · google-places · anthropic · api-usage(熔断) ·
                  restaurants · menu-review · xhs-fetch · demo · taste · recommend · types
  collectors/     发现逻辑（为后续模块预留同构目录）
scripts/          discover.ts · seed-config.ts
public/           manifest.json · sw.js · 图标
```

## 调锚点 / 阈值

改 `src/lib/config.ts` 里的 `ANCHORS`（含家的坐标）和 `restaurantConfig`，
然后重跑 `npm run db:seed`。

## 后续模块（本轮未做）

CS2 / 电影 / 音乐剧 / 提醒 / 每日简报、Telegram bot。schema、目录、config 已预留位置。
