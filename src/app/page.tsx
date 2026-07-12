"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapPin,
  Search,
  Sparkles,
  Swords,
  Trophy,
  UtensilsCrossed,
} from "lucide-react";
import { MapView } from "@/components/map/MapView";
import { RestaurantList } from "@/components/RestaurantList";
import { XhsPasteBox } from "@/components/XhsPasteBox";
import { Filters, type FilterState } from "@/components/Filters";
import { FilterBar } from "@/components/FilterBar";
import { WizardModal } from "@/components/WizardModal";
import { DuelModal } from "@/components/DuelModal";
import { ChatWidget } from "@/components/ChatWidget";
import { BackToTop } from "@/components/BackToTop";
import { RegionBar, type RegionSummary } from "@/components/RegionBar";
import {
  SortControls,
  sortRestaurants,
  type SortState,
} from "@/components/SortControls";
import { Button } from "@/components/ui/button";
import {
  collectCuisineGroups,
  cuisineLabel,
  cuisineEmoji,
  cuisineColor,
} from "@/lib/cuisine";
import {
  applyClientFilters,
  collectCities,
  detectChains,
  emptyClientFilters,
  MOODS,
  type ClientFilters,
} from "@/lib/filters";
import {
  withDistanceFrom,
  withDistanceFromMe,
  pickForMe,
} from "@/lib/recommend";
import { decodePolyline } from "@/lib/polyline";
import { getHomeAnchor } from "@/lib/config";
import { buildTasteProfile, withTasteScores } from "@/lib/taste";
import {
  googleMapsUrl,
  isRecommended,
  type RestaurantView,
} from "@/lib/types";
import { PUBLIC_DEMO, DEMO_MESSAGE } from "@/lib/demo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { StarField } from "@/components/StarField";
import { CommandPalette } from "@/components/CommandPalette";
import { MoodChips } from "@/components/MoodChips";
import { LeaderboardModal } from "@/components/LeaderboardModal";
import { ProfileModal } from "@/components/ProfileModal";
import { CompareModal } from "@/components/CompareModal";
import { ShareCardModal } from "@/components/ShareCardModal";
import { NearbyModal } from "@/components/NearbyModal";
import { ExportModal } from "@/components/ExportModal";
import { fireConfetti } from "@/lib/confetti";
import { ListSkeleton } from "@/components/ListSkeleton";
import { RegionInsights } from "@/components/RegionInsights";
import { ForYouRail } from "@/components/ForYouRail";
import { countChains } from "@/lib/chains";
import { pushRecent } from "@/lib/recent";

type UrlInit = {
  regionId: number | null;
  visit: FilterState["visit"];
  source: FilterState["source"];
  search: string;
  cuisine: string;
  city: string;
  prices: number[];
  maxDistanceKm: number | null;
  hideChains: boolean;
  sortKey: SortState["key"];
  sortDir: SortState["dir"];
  focus: number | null; // 深链：打开某家店的弹窗
  list: number | null;
  tag: string | null;
};

/** 从 URL query 恢复视图状态（地区/筛选/排序），支持刷新不丢 + 分享链接。 */
function parseUrlState(): UrlInit | null {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search);
  const num = (k: string) => (p.get(k) ? Number(p.get(k)) : null);
  return {
    regionId: num("r"),
    visit: (p.get("visit") as FilterState["visit"]) ?? "all",
    source: (p.get("source") as FilterState["source"]) ?? "all",
    search: p.get("q") ?? "",
    cuisine: p.get("cuisine") ?? "all",
    city: p.get("city") ?? "all",
    prices: (p.get("price") ?? "")
      .split(",")
      .map(Number)
      .filter((n) => n >= 1 && n <= 4),
    maxDistanceKm: num("dist"),
    hideChains: p.get("chains") === "1",
    sortKey: (p.get("sort") as SortState["key"]) ?? "default",
    sortDir: (p.get("dir") as SortState["dir"]) ?? "desc",
    focus: num("focus"),
    list: num("list"),
    tag: p.get("tag"),
  };
}

export default function Home() {
  const [restaurants, setRestaurants] = useState<RestaurantView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [regions, setRegions] = useState<RegionSummary[]>([]);
  const [activeRegionId, setActiveRegionId] = useState<number | null>(null);
  // 地图中心存 ref 而不是 state：拖动地图不触发整页(500个marker)重渲染——卡顿主因。
  const mapCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  // 请求序号：只应用最新一次 /api/restaurants 的结果，避免慢的旧请求覆盖。
  const loadSeq = useRef(0);
  const handleCenterChange = useCallback(
    (c: { lat: number; lng: number }) => {
      mapCenterRef.current = c;
    },
    [],
  );
  const [filters, setFilters] = useState<FilterState>({
    visit: "all",
    source: "all",
  });
  const [clientFilters, setClientFilters] =
    useState<ClientFilters>(emptyClientFilters);
  const [sort, setSort] = useState<SortState>({ key: "default", dir: "desc" });
  // 是否已从 URL 恢复过状态。用 state（非 ref）：serialize 要等恢复完再写，避免覆盖。
  const [restored, setRestored] = useState(false);
  const [pick, setPick] = useState<RestaurantView | null>(null);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [duelOpen, setDuelOpen] = useState(false);
  // PWA 快捷方式：?action=wizard / ?action=pick（pick 要等数据加载完再执行）。
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  // 深链 ?focus=<id>：等对应地区数据加载后打开那家店的弹窗。
  const [pendingFocus, setPendingFocus] = useState<number | null>(null);
  // 浏览器定位到的「我的位置」（供「离我近」排序）。
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
  // 列表↔地图悬停联动：地图把 highlight(id) 交上来，悬停卡片时命令式调用（不重渲染）。
  const highlightRef = useRef<(id: number | null) => void>(() => {});
  const handleHighlightReady = useCallback(
    (fn: (id: number | null) => void) => {
      highlightRef.current = fn;
    },
    [],
  );
  const handleHover = useCallback(
    (id: number | null) => highlightRef.current(id),
    [],
  );
  // 「附近」一键：地图把「定位」函数交上来；点了先定位，位置到手后自动按「离我近」排序。
  const locateRef = useRef<() => void>(() => {});
  const handleLocateReady = useCallback((fn: () => void) => {
    locateRef.current = fn;
  }, []);
  const [pendingNearMe, setPendingNearMe] = useState(false);
  // 「黑名单」视图：只看被手动拉黑的店。
  const [showBlacklist, setShowBlacklist] = useState(false);
  // 「合并连锁」：把同名分店折叠成一个可展开的组。
  const [groupChains, setGroupChains] = useState(false);
  // 展开连锁时把所有分店在地图上框出来（地图把 fitBounds 函数交上来）。
  const fitBranchesRef = useRef<(coords: [number, number][]) => void>(() => {});
  const handleFitBoundsReady = useCallback(
    (fn: (coords: [number, number][]) => void) => {
      fitBranchesRef.current = fn;
    },
    [],
  );
  const handleShowBranches = useCallback((branches: RestaurantView[]) => {
    const coords = branches
      .filter((b) => b.lat != null && b.lng != null)
      .map((b) => [b.lat as number, b.lng as number] as [number, number]);
    fitBranchesRef.current(coords);
  }, []);
  // 按时段的问候语（放 effect 里算，避免 SSR/CSR 时间不一致的水合告警）。
  const [greeting, setGreeting] = useState<string | null>(null);
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(
      h < 5
        ? "🌛 还没睡？来点宵夜"
        : h < 11
          ? "☀️ 早上好，今天吃点什么"
          : h < 14
            ? "🍜 中午好，午饭想好了吗"
            : h < 17
              ? "🌤️ 下午好"
              : h < 21
                ? "🍽️ 晚上好，今晚吃什么"
                : "🌙 夜深了，来顿宵夜？",
    );
  }, []);

  const activeRegion = useMemo(
    () => regions.find((r) => r.id === activeRegionId) ?? null,
    [regions, activeRegionId],
  );
  const activeIsHome = activeRegion?.kind === "home";

  const loadRegions = useCallback(async (): Promise<RegionSummary[]> => {
    const res = await fetch("/api/regions");
    const data = await res.json();
    const regs: RegionSummary[] = data.regions ?? [];
    setRegions(regs);
    setActiveRegionId((prev) => {
      if (prev != null && regs.some((r) => r.id === prev)) return prev;
      return regs.find((r) => r.kind === "home")?.id ?? regs[0]?.id ?? null;
    });
    return regs;
  }, []);

  useEffect(() => {
    loadRegions();
  }, [loadRegions]);

  // 个人层清单（供筛选下拉）。
  const [lists, setLists] = useState<
    { id: number; name: string; emoji: string | null }[]
  >([]);
  const loadLists = useCallback(async () => {
    try {
      const res = await fetch("/api/lists");
      const d = await res.json();
      setLists(d.lists ?? []);
    } catch {
      /* 忽略 */
    }
  }, []);
  useEffect(() => {
    loadLists();
  }, [loadLists]);

  // 圈选搜索（②B）：画完多边形 → 调 Google 搜 → 建新地区并切过去。
  const handlePolygonSearch = useCallback(
    async (points: [number, number][], done: () => void) => {
      try {
        const res = await fetch("/api/regions/search-polygon", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            points: points.map(([lat, lng]) => ({ lat, lng })),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          alert(
            data.capped
              ? "本月圈选搜索预算已用完（$5）"
              : (data.error ?? "搜索失败"),
          );
          return;
        }
        if (data.regionId) {
          await loadRegions();
          setActiveRegionId(data.regionId);
          alert(`圈到 ${data.saved} 家新店，已建成新地区。`);
        } else if (data.found > 0) {
          alert(
            `这片的 ${data.found} 家店都已在你库里（多在南湾），没有新店可加。`,
          );
        } else {
          alert("这片没搜到达标的店（可换片或放宽门槛）。");
        }
      } catch (e) {
        alert("搜索失败：" + String(e));
      } finally {
        done();
      }
    },
    [loadRegions],
  );

  const load = useCallback(async () => {
    if (activeRegionId == null) return;
    // 序号守卫：地区/筛选连续变化会并发多次请求，只认最新一次的结果，
    // 否则慢的旧请求可能覆盖新请求（曾导致切换后列表显示 0）。
    const seq = ++loadSeq.current;
    setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams();
      params.set("regionId", String(activeRegionId));
      if (activeIsHome) params.set("isHome", "1");
      if (filters.visit !== "all") params.set("visit", filters.visit);
      if (filters.source !== "all") params.set("source", filters.source);
      if (showBlacklist) params.set("onlyHidden", "1");
      const res = await fetch(`/api/restaurants?${params.toString()}`);
      if (!res.ok) throw new Error(`加载失败 ${res.status}`);
      const data = await res.json();
      if (seq !== loadSeq.current) return; // 已有更新的请求，丢弃本次
      setRestaurants(data.restaurants ?? []);
      loadLists(); // 个人层清单/店数可能已变（弹窗里新建/收藏）
    } catch (e) {
      if (seq !== loadSeq.current) return;
      console.error(e);
      setLoadError(true);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [filters, activeRegionId, activeIsHome, loadLists, showBlacklist]);

  useEffect(() => {
    load();
  }, [load]);

  // PWA 快捷方式入口：挂载时读一次 ?action=
  useEffect(() => {
    const a = new URLSearchParams(window.location.search).get("action");
    if (a === "wizard" || a === "pick") setPendingAction(a);
  }, []);

  // 「/」快捷键聚焦搜索框（在输入框里时不拦截）。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const tag = (e.target as HTMLElement)?.tagName ?? "";
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
      const el = document.querySelector<HTMLInputElement>(
        'input[placeholder*="搜索"]',
      );
      if (el) {
        e.preventDefault();
        el.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 挂载后从 URL 恢复视图状态（放 effect 里做，避免 SSR/CSR 初值不一致的水合告警）。
  useEffect(() => {
    const u = parseUrlState();
    if (u) {
      if (u.regionId != null) setActiveRegionId(u.regionId);
      if (u.visit !== "all" || u.source !== "all")
        setFilters({ visit: u.visit, source: u.source });
      setClientFilters({
        search: u.search,
        cuisine: u.cuisine,
        city: u.city,
        prices: u.prices,
        maxDistanceKm: u.maxDistanceKm,
        hideChains: u.hideChains,
        list: u.list,
        tag: u.tag,
        mood: null,
      });
      setSort({ key: u.sortKey, dir: u.sortDir });
      if (u.focus != null) setPendingFocus(u.focus);
    }
    setRestored(true);
  }, []);

  // 记录「最近看过」：聚焦某店时写入 localStorage（供 ⌘K 空查询时快速回访）。
  useEffect(() => {
    if (focusId != null) pushRecent(focusId);
  }, [focusId]);

  // 深链：对应地区数据加载后，聚焦并打开那家店（FocusController 会飞过去开弹窗）。
  useEffect(() => {
    if (pendingFocus == null) return;
    if (restaurants.some((r) => r.id === pendingFocus)) {
      setFocusId(pendingFocus);
      setPendingFocus(null);
    }
  }, [pendingFocus, restaurants]);

  // 视图状态同步进 URL（刷新不丢 + 可分享）。用 replaceState 不污染历史。
  // 等 restored 之后再写，否则挂载首帧会用默认值把 URL 参数冲掉。
  useEffect(() => {
    if (!restored) return;
    const p = new URLSearchParams();
    if (activeRegionId != null) p.set("r", String(activeRegionId));
    if (filters.visit !== "all") p.set("visit", filters.visit);
    if (filters.source !== "all") p.set("source", filters.source);
    if (clientFilters.search) p.set("q", clientFilters.search);
    if (clientFilters.cuisine !== "all") p.set("cuisine", clientFilters.cuisine);
    if (clientFilters.city !== "all") p.set("city", clientFilters.city);
    if (clientFilters.prices.length) p.set("price", clientFilters.prices.join(","));
    if (clientFilters.maxDistanceKm != null)
      p.set("dist", String(clientFilters.maxDistanceKm));
    if (clientFilters.hideChains) p.set("chains", "1");
    if (clientFilters.list != null) p.set("list", String(clientFilters.list));
    if (clientFilters.tag != null) p.set("tag", clientFilters.tag);
    if (sort.key !== "default") p.set("sort", sort.key);
    if (sort.dir !== "desc") p.set("dir", sort.dir);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [restored, activeRegionId, filters, clientFilters, sort]);

  // 当前地区的参考中心：距离从这里算。
  const center = useMemo(() => {
    if (activeRegion?.centerLat != null && activeRegion?.centerLng != null)
      return { lat: activeRegion.centerLat, lng: activeRegion.centerLng };
    const h = getHomeAnchor();
    return { lat: h.lat, lng: h.lng };
  }, [activeRegion]);

  // 路线地区：解码 polyline 供地图画线。
  const routeLine = useMemo(
    () =>
      activeRegion?.route?.polyline
        ? decodePolyline(activeRegion.route.polyline)
        : null,
    [activeRegion],
  );

  const withDist = useMemo(
    () => withDistanceFrom(restaurants, center),
    [restaurants, center],
  );
  const tasteProfile = useMemo(() => buildTasteProfile(withDist), [withDist]);
  const withTaste = useMemo(
    () => withTasteScores(withDist, tasteProfile),
    [withDist, tasteProfile],
  );
  // 定位后附加「到我」的距离（供「离我近」排序 + 卡片展示）。
  const withMy = useMemo(
    () => (myLoc ? withDistanceFromMe(withTaste, myLoc) : withTaste),
    [withTaste, myLoc],
  );

  const cuisineOptions = useMemo(
    () => collectCuisineGroups(withMy),
    [withMy],
  );
  const cityOptions = useMemo(() => collectCities(withMy), [withMy]);
  const chains = useMemo(() => detectChains(withMy), [withMy]);
  const tagOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of withMy) (r.tags ?? []).forEach((t) => s.add(t));
    return [...s].sort();
  }, [withMy]);

  const visible = useMemo(() => {
    const filtered = applyClientFilters(withMy, clientFilters, chains);
    return sortRestaurants(filtered, sort);
  }, [withMy, clientFilters, chains, sort]);

  // 当前列表里有几个同名连锁（≥2 家）——有才显示「合并连锁」开关。
  const chainCount = useMemo(() => countChains(visible), [visible]);

  // 顶部速览统计（当前地区）。
  const stats = useMemo(() => {
    const want = restaurants.filter((r) => r.wantToEat && !r.visited).length;
    const visited = restaurants.filter((r) => r.visited).length;
    const rec = restaurants.filter(isRecommended).length;
    const xhs = restaurants.filter((r) => r.hasXhsNote).length;
    return { total: restaurants.length, want, visited, rec, xhs };
  }, [restaurants]);

  // 是否有任何筛选处于激活态（用于显示「清空筛选」）。
  const filtersActive =
    filters.visit !== "all" ||
    filters.source !== "all" ||
    clientFilters.search !== "" ||
    clientFilters.cuisine !== "all" ||
    clientFilters.city !== "all" ||
    clientFilters.prices.length > 0 ||
    clientFilters.maxDistanceKm != null ||
    clientFilters.hideChains ||
    clientFilters.list != null ||
    clientFilters.tag != null ||
    clientFilters.mood != null;

  function clearFilters() {
    setFilters({ visit: "all", source: "all" });
    setClientFilters(emptyClientFilters);
  }

  // 激活筛选的可删除 chips（点 ✕ 只清这一项）。
  const filterChips: { label: string; clear: () => void }[] = [];
  if (filters.visit !== "all")
    filterChips.push({
      label: filters.visit === "want" ? "想去吃" : "去过",
      clear: () => setFilters((f) => ({ ...f, visit: "all" })),
    });
  if (filters.source !== "all")
    filterChips.push({
      label: filters.source === "xhs" ? "小红书" : filters.source,
      clear: () => setFilters((f) => ({ ...f, source: "all" })),
    });
  if (clientFilters.search)
    filterChips.push({
      label: `搜：${clientFilters.search}`,
      clear: () => setClientFilters((c) => ({ ...c, search: "" })),
    });
  if (clientFilters.cuisine !== "all")
    filterChips.push({
      label: clientFilters.cuisine,
      clear: () => setClientFilters((c) => ({ ...c, cuisine: "all" })),
    });
  if (clientFilters.city !== "all")
    filterChips.push({
      label: clientFilters.city,
      clear: () => setClientFilters((c) => ({ ...c, city: "all" })),
    });
  if (clientFilters.prices.length)
    filterChips.push({
      label: clientFilters.prices.map((p) => "￥".repeat(p)).join("/"),
      clear: () => setClientFilters((c) => ({ ...c, prices: [] })),
    });
  if (clientFilters.maxDistanceKm != null)
    filterChips.push({
      label: `≤${clientFilters.maxDistanceKm}km`,
      clear: () => setClientFilters((c) => ({ ...c, maxDistanceKm: null })),
    });
  if (clientFilters.hideChains)
    filterChips.push({
      label: "隐藏连锁",
      clear: () => setClientFilters((c) => ({ ...c, hideChains: false })),
    });
  if (clientFilters.list != null) {
    const l = lists.find((x) => x.id === clientFilters.list);
    filterChips.push({
      label: `📁 ${l?.name ?? "清单"}`,
      clear: () => setClientFilters((c) => ({ ...c, list: null })),
    });
  }
  if (clientFilters.tag != null)
    filterChips.push({
      label: `🏷️ ${clientFilters.tag}`,
      clear: () => setClientFilters((c) => ({ ...c, tag: null })),
    });
  if (clientFilters.mood != null) {
    const m = MOODS.find((x) => x.key === clientFilters.mood);
    filterChips.push({
      label: `${m?.emoji ?? ""} ${m?.label ?? "场景"}`,
      clear: () => setClientFilters((c) => ({ ...c, mood: null })),
    });
  }

  function handlePick() {
    const p = pickForMe(visible);
    if (p) fireConfetti(); // 先撒彩带（同步加进 body），再触发重渲染
    setPick(p);
    if (p) setFocusId(p.id);
  }

  // 「附近」：定位就绪后自动按「离我近」排序。
  useEffect(() => {
    if (myLoc && pendingNearMe) {
      setSort({ key: "nearMe", dir: "asc" });
      setPendingNearMe(false);
    }
  }, [myLoc, pendingNearMe]);

  function nearbyQuick() {
    if (myLoc) {
      setSort({ key: "nearMe", dir: "asc" });
    } else {
      setPendingNearMe(true);
      locateRef.current();
    }
  }

  // 执行 PWA 快捷方式（pick 需等列表就绪）。
  useEffect(() => {
    if (!pendingAction) return;
    if (pendingAction === "wizard") {
      setWizardOpen(true);
      setPendingAction(null);
    } else if (pendingAction === "pick" && visible.length > 0) {
      const p = pickForMe(visible);
      if (p) fireConfetti();
      setPick(p);
      if (p) setFocusId(p.id);
      setPendingAction(null);
    }
  }, [pendingAction, visible]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <StarField restaurants={withMy} onLocate={setFocusId} />
      {PUBLIC_DEMO && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-sky-200 dark:border-sky-900/50 bg-sky-50 dark:bg-sky-950/40 px-3 py-2 text-xs text-sky-800 dark:text-sky-200">
          <span>{DEMO_MESSAGE}</span>
        </div>
      )}
      <header className="relative mb-4">
        {greeting && (
          <p className="mb-0.5 text-xs font-medium text-muted-foreground">
            {greeting}
          </p>
        )}
        <div className="relative flex items-start justify-between gap-2">
          <h1 className="brand-title text-2xl font-bold tracking-tight">
            Athroics · 餐厅
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                window.dispatchEvent(
                  new KeyboardEvent("keydown", { key: "k", metaKey: true }),
                )
              }
              title="命令面板（⌘K）"
              className="hidden items-center gap-1 rounded-full border border-input px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:inline-flex"
            >
              <Search className="h-3.5 w-3.5" />
              <kbd className="font-sans">⌘K</kbd>
            </button>
            <button
              onClick={() => setProfileOpen(true)}
              title="我的美食档案"
              aria-label="我的美食档案"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-input text-sm transition-colors hover:bg-accent"
            >
              📊
            </button>
            <ThemeToggle />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {activeIsHome ? "🏠 我的湾区" : `✈️ ${activeRegion?.name ?? ""}`}
          {" · "}金色 = 我的推荐
          {activeIsHome && tasteProfile && (
            <> · 🎯 已学习你的口味（{tasteProfile.sampleSize} 条）</>
          )}
        </p>
        {!loading && (stats.total > 0 || showBlacklist) && (
          <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
            <button
              onClick={() => setFilters({ visit: "all", source: "all" })}
              className={`rounded-full px-2 py-0.5 transition-colors ${
                filters.visit === "all" && filters.source === "all"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              🍽️ {stats.total} 家
            </button>
            {stats.want > 0 && (
              <button
                onClick={() => setFilters((f) => ({ ...f, visit: "want" }))}
                className={`rounded-full px-2 py-0.5 transition-colors ${
                  filters.visit === "want"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent"
                }`}
              >
                ⭐ 想去 {stats.want}
              </button>
            )}
            {stats.visited > 0 && (
              <button
                onClick={() => setFilters((f) => ({ ...f, visit: "visited" }))}
                className={`rounded-full px-2 py-0.5 transition-colors ${
                  filters.visit === "visited"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent"
                }`}
              >
                ✓ 去过 {stats.visited}
              </button>
            )}
            {stats.rec > 0 && (
              <span className="px-2 py-0.5 text-amber-600">
                🏆 推荐 {stats.rec}
              </span>
            )}
            {stats.xhs > 0 && (
              <button
                onClick={() => setFilters((f) => ({ ...f, source: "xhs" }))}
                className={`rounded-full px-2 py-0.5 transition-colors ${
                  filters.source === "xhs"
                    ? "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                    : "text-rose-600 hover:bg-accent"
                }`}
              >
                📕 小红书 {stats.xhs}
              </button>
            )}
            <button
              onClick={() => setShowBlacklist((v) => !v)}
              className={`rounded-full px-2 py-0.5 transition-colors ${
                showBlacklist
                  ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
                  : "text-muted-foreground hover:bg-accent"
              }`}
              title="被我拉黑的店（可恢复）"
            >
              🚫 黑名单{showBlacklist ? ` ${stats.total}` : ""}
            </button>
          </div>
        )}
      </header>

      <RegionBar
        regions={regions}
        activeId={activeRegionId}
        onSelect={setActiveRegionId}
        onSearched={async (id) => {
          await loadRegions();
          setActiveRegionId(id);
        }}
        onDeleted={async () => {
          const regs = await loadRegions();
          setActiveRegionId(regs.find((r) => r.kind === "home")?.id ?? null);
        }}
        getMapCenter={() => mapCenterRef.current}
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* 左：地图 */}
        <div className="h-[420px] overflow-hidden rounded-lg border lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
          <MapView
            restaurants={visible}
            showRegion={activeIsHome}
            focusId={focusId}
            onSelect={setFocusId}
            onVisited={load}
            regionCenter={center}
            regionKey={activeRegionId ?? undefined}
            onCenterChange={handleCenterChange}
            routeLine={routeLine}
            onUserLocate={setMyLoc}
            onHighlightReady={handleHighlightReady}
            onLocateReady={handleLocateReady}
            onFitBoundsReady={handleFitBoundsReady}
            onPolygonSearch={PUBLIC_DEMO ? undefined : handlePolygonSearch}
          />
        </div>

        {/* 右：粘贴框 + 筛选 + 列表 */}
        <div className="space-y-4">
          {!PUBLIC_DEMO && (
            <section>
              <h2 className="mb-2 text-sm font-semibold">从小红书添加</h2>
              <XhsPasteBox onChanged={load} />
            </section>
          )}

          <section className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                餐厅{loading ? "…" : `（${visible.length}）`}
                {filtersActive && (
                  <button
                    onClick={clearFilters}
                    className="rounded-full border border-input px-2 py-0.5 text-xs font-normal text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    清空筛选 ✕
                  </button>
                )}
              </h2>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" onClick={() => setWizardOpen(true)}>
                  <UtensilsCrossed className="h-4 w-4" />
                  今晚吃什么
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={nearbyQuick}
                  title="定位并按离我最近排序"
                >
                  <MapPin className="h-4 w-4" />
                  附近
                </Button>
                <Button size="sm" variant="secondary" onClick={handlePick}>
                  <Sparkles className="h-4 w-4" />
                  帮我选
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setLeaderboardOpen(true)}
                  title="按我的评分看排名"
                >
                  <Trophy className="h-4 w-4" />
                  我的榜
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setCompareOpen(true)}
                  title="并排对比 2-3 家"
                >
                  ⚖️ 对比
                </Button>
                {!PUBLIC_DEMO && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDuelOpen(true)}
                  >
                    <Swords className="h-4 w-4" />
                    排位
                  </Button>
                )}
              </div>
            </div>

            {pick && (
              <div
                key={pick.id}
                className="pick-reveal relative flex gap-3 rounded-lg border border-amber-300 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/40 p-3"
              >
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md">
                  <div
                    className="flex h-full w-full items-center justify-center text-2xl"
                    style={{
                      background: `linear-gradient(135deg, ${cuisineColor(pick.cuisine)}33, ${cuisineColor(pick.cuisine)}66)`,
                    }}
                    aria-hidden
                  >
                    {cuisineEmoji(pick.cuisine)}
                  </div>
                  {pick.hasPhoto && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/photo?restaurantId=${pick.id}`}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover"
                      onError={(e) => e.currentTarget.remove()}
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="mb-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                    今天就吃这家吧 👇
                  </div>
                  <a
                    href={googleMapsUrl(pick)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold hover:underline"
                  >
                    {pick.name} ↗
                  </a>
                  <div className="text-xs text-muted-foreground">
                    {pick.rating != null && <>⭐ {pick.rating} </>}
                    {pick.cuisine && <>· {cuisineLabel(pick.cuisine)} </>}
                    {pick.distanceKm != null && (
                      <>· 📍 {pick.distanceKm.toFixed(1)} km</>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 「为你推荐」精选栏：只在发现态出现（没搜索/不看黑名单），
                自身在候选不足 4 家时会隐藏，不喧宾夺主。 */}
            {!clientFilters.search && !showBlacklist && (
              <ForYouRail
                restaurants={visible}
                onFocus={setFocusId}
                onHover={handleHover}
              />
            )}

            <Filters value={filters} onChange={setFilters} />
            <MoodChips
              value={clientFilters.mood}
              onChange={(mood) => setClientFilters((f) => ({ ...f, mood }))}
            />
            <FilterBar
              filters={clientFilters}
              onChange={setClientFilters}
              cuisineOptions={cuisineOptions}
              cityOptions={cityOptions}
              lists={lists}
              tags={tagOptions}
            />
            <SortControls
              value={sort}
              onChange={setSort}
              showTaste={tasteProfile != null}
              showNearMe={myLoc != null}
            />
            <RegionInsights restaurants={withMy} />
            {filterChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {filterChips.map((chip, i) => (
                  <button
                    key={i}
                    onClick={chip.clear}
                    className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground hover:bg-secondary/70"
                    title="移除此筛选"
                  >
                    {chip.label}
                    <span className="text-muted-foreground">✕</span>
                  </button>
                ))}
              </div>
            )}
            {loadError && (
              <div className="flex items-center justify-between rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
                <span className="text-destructive">
                  餐厅加载失败，检查网络或服务器。
                </span>
                <button
                  onClick={load}
                  className="rounded-md border border-input px-2 py-1 text-xs hover:bg-accent"
                >
                  重试
                </button>
              </div>
            )}
            {/* 「合并连锁」开关：把同名分店（如多家 In-N-Out）折叠成一组，点开看各分店 + 地图框出。 */}
            {chainCount > 0 && (
              <div className="flex items-center justify-end">
                <button
                  onClick={() => setGroupChains((v) => !v)}
                  aria-pressed={groupChains}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    groupChains
                      ? "border-foreground/30 bg-accent text-foreground"
                      : "border-input text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                  title="把同名连锁的多家分店折叠成一组"
                >
                  🔗 合并连锁{groupChains ? `（${chainCount}）` : ""}
                </button>
              </div>
            )}
            {loading && visible.length === 0 ? (
              <ListSkeleton />
            ) : (
              <RestaurantList
                restaurants={visible}
                focusId={focusId}
                onFocus={setFocusId}
                onHover={handleHover}
                groupChains={groupChains}
                onShowBranches={handleShowBranches}
              />
            )}
          </section>
        </div>
      </div>

      <WizardModal
        restaurants={withTaste}
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onLocate={setFocusId}
      />
      <DuelModal open={duelOpen} onClose={() => setDuelOpen(false)} />
      <LeaderboardModal
        open={leaderboardOpen}
        onClose={() => setLeaderboardOpen(false)}
        restaurants={withMy}
        onLocate={setFocusId}
      />
      <ProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        restaurants={withMy}
        regions={regions}
        regionName={activeIsHome ? "我的湾区" : (activeRegion?.name ?? "")}
        onLocate={setFocusId}
      />
      <CompareModal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        restaurants={withMy}
        onLocate={setFocusId}
      />
      <ShareCardModal
        open={cardOpen}
        onClose={() => setCardOpen(false)}
        restaurants={withMy}
      />
      <NearbyModal
        open={nearbyOpen}
        onClose={() => setNearbyOpen(false)}
        restaurants={withMy}
        onLocate={setFocusId}
      />
      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        restaurants={withMy}
        regionName={activeIsHome ? "我的湾区" : (activeRegion?.name ?? "")}
      />
      {!PUBLIC_DEMO && <ChatWidget onLocate={setFocusId} onDataChanged={load} />}
      <CommandPalette
        restaurants={withMy}
        regions={regions}
        onFocusRestaurant={setFocusId}
        onSwitchRegion={setActiveRegionId}
        onAction={(a) => {
          if (a === "pick") handlePick();
          else if (a === "wizard") setWizardOpen(true);
          else if (a === "nearby") nearbyQuick();
          else if (a === "profile") setProfileOpen(true);
          else if (a === "leaderboard") setLeaderboardOpen(true);
          else if (a === "compare") setCompareOpen(true);
          else if (a === "card") setCardOpen(true);
          else if (a === "nearby-alt") setNearbyOpen(true);
          else if (a === "export") setExportOpen(true);
          else if (a === "chains") setGroupChains((v) => !v);
          else if (a === "blacklist") setShowBlacklist((v) => !v);
          else if (a === "theme") {
            const root = document.documentElement;
            const next = !root.classList.contains("dark");
            root.classList.add("theme-anim");
            root.classList.toggle("dark", next);
            window.setTimeout(() => root.classList.remove("theme-anim"), 550);
            try {
              localStorage.setItem("theme", next ? "dark" : "light");
            } catch {}
          }
        }}
      />
      <BackToTop />
    </main>
  );
}
