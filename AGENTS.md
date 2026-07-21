# Athroics · 餐厅挑选系统 — 项目交接文档

个人助理 Athroics 的第一个模块（最终规划含 CS2 电竞/电影/音乐剧/提醒/每日简报 + Telegram bot，本项目只做餐厅）。用户是湾区（San Jose 南湾）美食爱好者，中文交流。

## 技术栈与运行

- Next.js 15 (App Router, TS) · Tailwind + shadcn 风格组件 · react-leaflet v5 + OSM · Drizzle + libSQL（本地 `file:./local.db`，`TURSO_*` 留空即本地）
- Google Places API (New) + **Routes API + Geocoding API**（都已启用，key 在 `.env`）
- Anthropic API：对话 Agent 用 `Codex-sonnet-5`，提取/vision 用 `Codex-haiku-4-5-20251001`
- **node/npm 需要 `export PATH="/opt/homebrew/bin:$PATH"`**（zsh 非交互 shell 里 PATH 不含 homebrew）
- 跑起来：`npm run dev`（端口 3000）。预览用 `.Codex/launch.json` 里的 `dev` 配置
- 改 schema：改 `src/db/schema.ts` → `npm run db:push`
- 区域重扫：`npm run discover`（手动，非 cron；门槛在 `src/lib/config.ts` restaurantConfig，现为 4.0/100）
- **绝不在 dev 服务器运行时跑 `npm run build`**——会重写 `.next` 导致 dev 崩（出过事故：`Cannot find module './586.js'`，修法=停服务、删 `.next`、重启）
- 验证约定：每次改动 `npx tsc --noEmit` + 浏览器实测（preview 工具），测试数据用完必须清掉
- **部署（任何设备访问）**：云库用 Turso（`sqlite3 local.db .dump | turso db shell <db>` 导数据）+ Vercel 托管；`output:"standalone"` 已开。详见 README「部署」。dev 服务器跑着时想验证 build，用 rsync 到临时目录 + 软链 node_modules 起独立实例（别在本目录 build）
- **只读演示**（放个人网站不让别人烧钱）：`DEMO_MODE=1`（服务端 `middleware.ts` 硬拦所有写请求 + 花钱的读请求→403）+ `NEXT_PUBLIC_DEMO_MODE=1`（前端藏入口 + 横幅）。花钱的读接口清单在 `src/lib/demo.ts` 的 `PAID_GET_PREFIXES`
- **PWA**：`public/sw.js`（network-first + 离线壳）由 `ServiceWorkerRegister`（仅 production 注册）挂上；manifest 有 maskable 图标 + 快捷方式（`/?action=wizard|pick`，page.tsx 里响应）
- **深色模式**：`tailwind darkMode:["class"]` + globals.css `.dark` token + 地图瓦片 `.dark .leaflet-tile{filter:invert...}`；`ThemeToggle`（头部）切换存 localStorage，layout 内联脚本防闪烁。改 UI 颜色优先用 shadcn token（自动明暗）；写死彩色面板要补 `dark:` 变体（弹窗/粘贴框/page 已补）
- **URL 持久化视图**：地区/筛选/排序写进 query（page.tsx `parseUrlState`+serialize effect），刷新不丢、可分享；筛选 chips 可单删 + 「清空筛选」。**恢复放 effect 里做**（不放 useState 初值），否则 SSR/CSR 初值不一致会水合告警
- **`load()` 竞态守卫**：快速切地区/筛选会并发多个 `/api/restaurants`，用 `loadSeq` ref 只认最新一次结果——否则慢的旧请求会覆盖新结果（曾导致切换后列表显示 0）
- OG/社媒分享图：layout `metadataBase` 用 `NEXT_PUBLIC_SITE_URL`（部署设真实域名）
- **列表缩略图**：默认菜系渐变+emoji（免费，`cuisineEmoji/cuisineColor`）；有缓存照片则盖真实照片（`hasPhoto`，列表/弹窗/帮我选卡都用）。**全库 1081 家已全部抓真实照片**（2026-07-09，$25，`backfillPhotos` 并发+哨兵防重抓）。真实照片走 `fetchPlacePhoto`（Place Details photos + Place Photo，~$0.024/家）→ `restaurant_photos` 缓存（base64；没照片存 contentType='none' 哨兵）→ `GET /api/photo?restaurantId=` 读缓存（免费）。**照片让 local.db 膨到 ~70MB**：Turso 部署时 `.dump` 会很大（可行但慢），要更省可改对象存储（Vercel Blob/S3）。临时批量端点抓完即删，别留付费端点
- **地图定位**：浏览器 geolocation（免费）；红色小人标记（`.me-marker`），📍按钮点了 flyTo zoom16（Google Maps 式）；挂载自动定位只显示不移图
- `BackToTop` 在 `bottom-24 left-5`（避开 dev 的 N 角标）

## 数据模型（本地 SQLite，16 张表）

- `regions`：地区分桶。kind=home(南湾)/city/point/route；route 的 meta 存 polyline。**餐厅 region_id 为 null 视为 home**（旧数据兼容，查询用 `isHome=1` 参数带上 null）
- `restaurants`：place_id 唯一。source=google/xhs/manual/travel。region_id 归属地区
- `visits`：**评分是 0-100 分制**（2026-07-09 从 5 星迁移，旧分×20）。rating 可空=去过没打分
- `dishes`（菜品记录 again/ok/never）、`duels`（Elo 排位）、`dish_recs`（推荐点菜缓存，一店一份永久缓存）
- `restaurant_menus`（AI 归纳翻译的菜单 JSON，一店一份）、`restaurant_reviews`（我的文字点评，一店一份）
- `restaurant_xhs`（小红书笔记沉淀：`posts_json`=[{summary,dishes,url,at}] 累积多帖，一店一份）
- `restaurant_photos`（Google Places Photo 缓存：base64+contentType，一店一份，抓过永久缓存不重复付费）
- `lists`（收藏夹/清单）、`list_items`（清单↔店多对多）、`restaurant_tags`（店的自由标签）——个人层，`src/lib/lists.ts` + `/api/lists`·`/api/lists/items`·`/api/tags`；listRestaurants 带出每店 listIds+tags 供客户端筛选
- `xhs_captures`（小红书候选日志，含 summary/dishes_json/source_url 承接候选→确认）、`api_usage`（成本记账）、`config`
- `conversations` + `chat_messages`（对话 Agent 存库：assistant 消息的 `recommendations` 列存 RestaurantView[] JSON，重开还原推荐卡；action 不存，避免重开后重复执行；`src/lib/conversations.ts`）

## 成本控制（用户非常在意）

- Google 月度硬熔断 $180（`api_usage` 记账，每次调用前 `assertUnderCap`）；Anthropic 软上限 $20（`ANTHROPIC_MONTHLY_CAP_USD`）
- 一切外部查询结果**入库缓存**，重复看不再调 API。花钱的操作先告知用户预估
- **API key 永远不出现在命令文本/聊天里**（出过泄露事故）。key 已在 `.env`，直接用环境变量

## 已完成功能（全部实测过）

- **主库**：南湾 965 家（4.0/100 门槛）；小红书粘贴框（**链接**/文字/截图 vision 提取→Places 反查→候选确认；链接走 best-effort 抓公开摘要，反爬抓不到提示改贴文字/截图）；提取时一并存**评价摘要+推荐菜**到店上（`restaurant_xhs` 一店一份累积多帖），卡片 📕 标记、弹窗「📕 小红书怎么说」面板展示；100 分制打分（≥80 金色推荐 / ≤40 地图隐藏）；弹窗内 ⭐想去吃 / ✓去过 / 打分快捷键(95/85/75/60/40)+数字输入
- **地图**：菜系 emoji divIcon 图标（`GROUP_EMOJI`+iconCache，金色光环=推荐）；marker 聚合 + 悬停显示店名 tooltip；列表↔地图双向联动（点卡片飞过去开弹窗 + **悬停卡片高亮对应 marker**）；区域轮廓（仅 home 画）；右上角 **定位（红色小人，Google Maps 式放大）+ ⊡全览** 控件
- **筛选排序**：搜索框（匹配店名/**菜系**/地址，`/` 聚焦）/菜系大类(89→16 `cuisineGroup`)/城市/价格/距离/隐藏连锁；排序=评论数/评分/离家近/**离我近(定位后)**/最近添加/我的打分/合口味；头部速览统计**可点即筛**（想去/去过/小红书）；「清空筛选」；**📊 菜系分布**折叠洞察；`📍附近`一键=定位+按离我近排序
- **列表卡片**：菜系渐变缩略图（想去的店盖真实 Google 照片，`restaurant_photos` 缓存）；评论数千分位、价格 ¥；📕小红书标记；🏠离家/📍离我 距离；深链 `?focus=<id>` + 弹窗 🔗分享
- **主题/无障碍**：浅/深/跟随系统（`ThemeToggle`，暗色地图滤镜）；reduced-motion；键盘可达 + 焦点环；加载骨架屏；友好空状态
- **个人层**（待办④）：弹窗 📁收藏（勾选/新建清单）+ 🏷️标签（增删）+ 🚫拉黑；按清单/标签筛选（有数据才显示下拉）；卡片显示标签；头部「🚫黑名单」视图（只看拉黑的、可恢复，`restaurants.hidden` 列，`/api/hidden`，listRestaurants 默认排除 hidden / `onlyHidden` 只看）；写操作 POST→演示模式自动拦截、编辑入口 `PUBLIC_DEMO` 隐藏
- **智能**：今晚吃什么三问向导；帮我选(加权随机)；排位赛(两两对决 Elo)；口味画像(≥3 条打分启用)；推荐点菜(Google 评论→Codex 挖招牌菜，$0.025/店缓存)；菜品速记
- **对话 Agent v2**（右下气泡，Sonnet 5，约 $0.02-0.04/轮）：**流式逐字输出**（`streamChatAgent` async generator → `/api/chat` 发 NDJSON，每行一个事件 delta/status/recommendations/action/done；`runChatAgent` 是它的非流式封装给 Telegram 用）；工具：search_restaurants/get_taste_profile/recommend_restaurants/get_dish_recommendation，推荐卡可地图定位；**带确认的写操作**：`propose_action` 只提议不改库→前端确认卡→点确认才 POST `/api/agent/act`（复用 setWantToEat/addVisit/setHidden/清单 find-or-create，`src/lib/agent-actions.ts`，成功后刷新列表/地图）；**对话存库**：开窗载入最近一段会话、「＋新对话」重开；回复里 `**加粗**` 前端渲染成 `<strong>`
- **Telegram bot**（手机聊天选餐）：webhook `POST /api/telegram` 复用同一 chat-agent，无状态一问一答，`formatReply` 拼推荐（⭐评分/🏠离家/Google Maps 链接）；secret_token 校验来源；`/start`·`/help` 走欢迎不跑 Agent（不花钱）。**端到端需部署到公网 HTTPS + `TELEGRAM_BOT_TOKEN` + 注册 webhook**（Telegram 够不到 localhost，本地只能验 webhook 解析/忽略/校验逻辑）。配置步骤见 `.env.example`
- **旅行/地区**：地区切换条；探索新地区=按城市(Text Search)/按定点(地图中心+N英里 Nearby)/按路线(Geocoding→Routes 真实驾车路线→沿途搜索，地图画 polyline)；**可配置门槛**(评分/评论数输入框)；地区互不污染、全部缓存；删除地区连带删店
- **菜单+点评**：弹窗 📋菜单（拍照/贴文字→AI 归纳翻译成 分类→原文/中文/价格）、📝点评（私人文字点评）
- **发现/决策/分享工具（2026-07-12 新增，全部零 API 成本、纯客户端）**：
  - **浅色模式定为 B 柔灰 SaaS/Notion**（`globals.css :root`，中性冷灰底+纯白卡片+蓝焦点环；深色宇宙模式未动）
  - **Beli 式评分徽章**（`lib/score.ts scoreTier`，卡片右侧彩色分数/预测合口味分；榜单/地图弹窗共用）
  - **为你推荐精选栏**（`lib/picks.ts curatePicks` + `ForYouRail.tsx`，评分×距离×想去/小红书/合口味加权策展 8 家+上榜理由；🔄换一批=加权随机换一组；搜索/黑名单态隐藏）
  - **🔗 合并连锁 toggle**（`lib/chains.ts` + `RestaurantList` 重构出 RestaurantCard/BranchRow/ChainGroupRow）：同名≥2 家折叠成可展开组，展开 fitBounds 框出各分店（`onFitBoundsReady`/`FitBoundsControl`），点分店 marker 自动展开
  - **⌘K 命令面板**（`CommandPalette.tsx`）：操作/最近/地区/餐厅 分组；「最近」读 `lib/recent.ts` localStorage
  - **一批 modal 工具**（入口都在 ⌘K，部分在头部/操作行）：📊 我的美食档案(`ProfileModal` 库/个人统计+菜系/价位分布+高分榜)、⚖️ 对比(`CompareModal` 2-3 家并排+绿色标最优+🏆帮我拍板加权选赢家)、🎴 美食卡(`ShareCardModal` 3:4 分享卡截图存)、🧭 附近还有啥(`NearbyModal` 锚点+haversine 最近 8 家)、📋 导出清单(`ExportModal` 想去/去过导成带 Maps 链接文本+复制)
  - **时段问候语**（页头按小时）、**帮我选🎲换一家**原地重摇、**移动端操作行**窄屏堆叠+换行
  - **⚠️ 地图平滑跳转试过又回退**（聚类脆：飞行途中移除聚类层能让 flyTo 动起来，但并发数据重载会把 cluster 挂成孤儿→marker 全消失；而切地区必然并发 load()。纯 flyTo 不加处理则完全不动。加上预览看不到动画，需真机现场调。详见「关键坑」11）
- PWA（manifest+图标可装手机）；回到顶部按钮

## 关键坑（都踩过，别再踩）

1. **react-leaflet 的 Marker 绝不传 `icon={undefined}`**——覆盖默认图标致 `createIcon` 崩全图
2. **FocusController 的 moveend 回调：先 `map.off` 再 `marker.openPopup()`**——openPopup 的 autoPan 同步再触发 moveend，顺序反了=无限递归爆栈
3. **弹窗内操作不能立即刷新列表**（会把弹窗关掉）→ 统一在 Marker `popupclose` 时触发 onVisited 刷新
4. **travel 的 upsert 不能改已有店的 regionId**——会把南湾/其他地区的店"抢走"（出过事故，识别修复靠 in_region=1/source/added_at）
5. **地图拖动回报中心用 ref 不用 state**——setState 会整页重渲染 965 个 marker（卡顿主因）
6. `TURSO_DATABASE_URL=` 空串要用 `||` 回退不能用 `??`
7. Google key 改限制后要等 1-2 分钟传播，期间时好时坏
8. 「Failed to fetch」多半是 dev 服务器没在跑，先检查服务器再查代码
9. **地图上叠 React 控件绝不能用 `L.DomEvent.disableClickPropagation`**——它 stopPropagation 掉原生 click，React 的 onClick 靠冒泡到根节点触发，会被整个弄哑（定位按钮曾因此"点了没反应"）。只用 `disableScrollPropagation`（不影响 click）
10. **geolocation 失败必须给 UI 反馈**（权限拒绝/系统定位关/超时三种文案），静默失败=用户以为按钮坏了；且别只用模拟坐标验证，要真点一次看失败路径
11. **地图移动统一用 `map.setView`/`fitBounds`，别用 `flyTo`/`flyToBounds`**——本地图挂了 `MarkerClusterGroup(chunkedLoading)`，flyTo 的动画会被聚类重算打断，表现为「调用了但地图纹丝不动」（点列表卡片不聚焦、切地区不居中、定位不动都是这个根因）。FocusController/RegionController/定位 已全换 setView
12. **聚类中的 marker `_map` 是 null**（没加到地图上），要先 `setView` 到 `CLUSTER_DISABLE_ZOOM(16)` 解聚类，marker 才在图上、`openPopup` 才有效（延迟 ~350ms 再开）；`markerRefs` 对全部 marker 都有（含聚类中的），能 `getLatLng`
13. **深链 `?focus=<id>`**：page.tsx 等对应地区数据加载后 setFocusId；FocusController 会短暂再确保一次视角（压过 RegionController 的地区居中 setView）
14. dev 控制台有个 `useEffect changed size between renders` 的红字——是 **react-leaflet-cluster(MarkerClusterGroup) 的已知库 warning**（本项目所有 useEffect 依赖都是固定字面量，已排除自身代码），纯 dev 噪声，不影响功能/build，别去追
15. **客户端组件从 server-only 模块 `import type` 是安全的**：ChatWidget（"use client"）`import type { ProposedAction } from "@/lib/chat-agent"`，而 chat-agent 顶上有 `import "server-only"`——因为 `import type` 编译期被完全擦除、不产生运行时 import，不会把 server-only 拉进客户端 bundle。只有值 import 才会炸
16. **dev 里 `Cannot access 'X' before initialization` / `handlePolygonSearch is not defined` 这类 page.tsx 报错，多半是 Fast Refresh 累积的坏状态**（栈里带 performReactRefresh/applyUpdate），不是真 bug——**硬刷新一次就好**，别去改代码追（改多个文件后热更容易进这个状态）
17. **流式 Agent 超预算要在开流前 429**：一旦 `new Response(stream)` 开始就只能发 200，所以 `/api/chat` 先 `assertChatBudget()` 预检超限直接返回 429 JSON，之后才建流；流内部再出错走 `{type:"error"}` 事件

## 工作方式约定

- 大改动/新功能先给方案+关键决策用 AskUserQuestion 让用户拍板，再动手
- 用户常一次提一大批需求：逐条拆解，能做的直接排队做，有硬限制的（如 Google 无菜单 API、小红书反爬、Google Maps 收藏无读取 API→只能 Takeout 导入）如实说清替代方案
- 每个功能做完立即浏览器实测（点按钮、读 DOM、截图），不要只 typecheck
- 我编造的测试数据（假访问/假菜单等）验证完必须从库里清掉

## 待办队列（用户已确认要做）

1. ~~**小红书发链接**~~ ✅ 已完成（2026-07-09）：贴帖子 URL→best-effort 抓公开摘要（`src/lib/xhs-fetch.ts`：正文其实在页面内嵌 `__INITIAL_STATE__` 的 `title`/`desc`，og 标签是空壳；反爬会**随机**返回内容空壳→换 UA 重试一次；仍抓不到就提示贴文字/截图）；入库时 Codex 存"评价摘要+推荐菜"到店（`restaurant_xhs` 表），卡片 📕 标记 + 弹窗「小红书怎么说」面板展示。**一次识别 >10 家（如"年度36家"合集）走大列表模式：每家自动取 Places 最佳匹配加入"想去吃"，不逐个确认**（阈值 `XHS_AUTO_MAX`）
2. ~~**地图画多边形圈范围搜索**~~ ✅ 已完成（2026-07-09）：地图 🔷 按钮画多边形→外接圆一次 Places Nearby→本地 `pointInPolygon` 精筛→存进新地区（`travel.ts` `searchPolygon` + `/api/regions/search-polygon`）。**独立 `area_search` 月度预算 $5 硬熔断**（`AREA_SEARCH_MONTHLY_CAP_USD`，也计入 google_places 全局账）。圈到的店若都已在别地区（如南湾）则删空地区+提示「都已在库里」
3. **聊天 Agent 接旅行工具**：加 search_area/search_along_route 工具（"我在西雅图附近吃啥""去 Napa 路上吃啥"）
4. ~~个人层：收藏夹/清单 + 自定义标签 + 踩雷隐藏（黑名单）~~ ✅ 全部完成（2026-07-09，见「已完成功能·个人层」）
5. ~~Agent v2：流式输出、对话存库、能动手写操作（带确认）、接 Telegram~~ ✅ **全部完成**（2026-07-09，见「已完成功能·对话 Agent v2」+「Telegram bot」）
6. 用户明确**先不做**：从网上找菜单（AI 联网）、Google Maps 收藏 Takeout 导入

## 成本现状（2026-07 月）

google_places ~$37/$180（含全库真实照片一次性 $25 + 小红书反查等）；anthropic ~$0.1/$20。全部记在 `api_usage` 表。
