"use client";

import { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import type { PopupEvent } from "leaflet";
import { googleMapsUrl, type RestaurantView, type XhsPost } from "@/lib/types";
import { PUBLIC_DEMO } from "@/lib/demo";
import { scoreTier } from "@/lib/score";

interface MenuItem {
  original: string;
  translated: string;
  price: string | null;
  note: string | null;
}
interface MenuSection {
  name: string;
  items: MenuItem[];
}

interface DishRec {
  name: string;
  mentions: number;
  quote: string | null;
}
interface MyDish {
  name: string;
  verdict: string;
  notes: string | null;
}
interface ListSummary {
  id: number;
  name: string;
  emoji: string | null;
  count: number;
}

const VERDICT_LABEL: Record<string, string> = {
  again: "👍 再点",
  ok: "😐 一般",
  never: "🚫 避雷",
};

/** 常用分数快捷键（100 分制）。 */
const SCORE_CHIPS = [95, 85, 75, 60, 40];

/** 地图 marker 弹窗：信息 + 想去吃/去过 + 100分制打分 + 推荐点菜 + 菜品速记。 */
export function RestaurantPopup({
  restaurant,
  onVisited,
}: {
  restaurant: RestaurantView;
  onVisited?: () => void;
}) {
  const map = useMap();
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [want, setWant] = useState(restaurant.wantToEat);
  const [wantSaved, setWantSaved] = useState(false);
  const [popping, setPopping] = useState(false);
  const [scoreInput, setScoreInput] = useState("");

  // 推荐点菜
  const [recsOpen, setRecsOpen] = useState(false);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recs, setRecs] = useState<DishRec[] | null>(null);
  const [myDishes, setMyDishes] = useState<MyDish[]>([]);
  const [recsError, setRecsError] = useState<string | null>(null);

  // 菜品速记
  const [dishName, setDishName] = useState("");
  const [dishSaved, setDishSaved] = useState(false);

  // 点评 + 菜单（挂载时一次性拉取）
  const [review, setReview] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewDraft, setReviewDraft] = useState("");
  const [menu, setMenu] = useState<MenuSection[] | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuText, setMenuText] = useState("");
  const [menuErr, setMenuErr] = useState<string | null>(null);
  const menuFileRef = useRef<HTMLInputElement>(null);

  // 小红书笔记沉淀
  const [xhsPosts, setXhsPosts] = useState<XhsPost[]>([]);
  const [xhsOpen, setXhsOpen] = useState(false);

  // 分享深链（复制到剪贴板）
  const [shared, setShared] = useState(false);
  // 黑名单
  const [hidden, setHidden] = useState(restaurant.hidden);

  // 个人层：收藏夹/清单 + 标签
  const [allLists, setAllLists] = useState<ListSummary[]>([]);
  const [listIds, setListIds] = useState<number[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [collectOpen, setCollectOpen] = useState(false);
  const [newList, setNewList] = useState("");
  const [tagInput, setTagInput] = useState("");

  // react-leaflet 会为每个 marker 都挂载弹窗内容——若在挂载时就拉 extra，
  // 一个地区上千家店 = 上千个并发请求。改成「弹窗真正打开时才拉一次」。
  const rootRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const onOpen = (e: PopupEvent) => {
      const el = e.popup.getElement();
      if (el && rootRef.current && el.contains(rootRef.current)) {
        setShouldLoad(true);
      }
    };
    map.on("popupopen", onOpen);
    // 挂载时若已在打开的弹窗里（少见），也判定一次。
    if (rootRef.current?.offsetParent) setShouldLoad(true);
    return () => {
      map.off("popupopen", onOpen);
    };
  }, [map]);

  useEffect(() => {
    if (!shouldLoad) return;
    let alive = true;
    fetch(`/api/restaurant-extra?restaurantId=${restaurant.id}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setReview(d.review ?? null);
        setReviewDraft(d.review ?? "");
        setMenu(d.menu?.sections ?? null);
        setXhsPosts(d.xhsPosts ?? []);
        setAllLists(d.allLists ?? []);
        setListIds(d.listIds ?? []);
        setTags(d.tags ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [shouldLoad, restaurant.id]);

  async function toggleHidden() {
    const next = !hidden;
    setHidden(next);
    await fetch("/api/hidden", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId: restaurant.id, hidden: next }),
    });
    onVisited?.();
  }

  async function toggleList(listId: number) {
    const member = !listIds.includes(listId);
    setListIds((prev) =>
      member ? [...prev, listId] : prev.filter((id) => id !== listId),
    );
    await fetch("/api/lists/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listId, restaurantId: restaurant.id, member }),
    });
    onVisited?.();
  }

  async function createAndAddList() {
    const name = newList.trim();
    if (!name) return;
    const res = await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (data.id) {
      setAllLists((prev) => [
        ...prev,
        { id: data.id, name, emoji: null, count: 1 },
      ]);
      setListIds((prev) => [...prev, data.id]);
      setNewList("");
      await fetch("/api/lists/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listId: data.id,
          restaurantId: restaurant.id,
          member: true,
        }),
      });
      onVisited?.();
    }
  }

  async function addTagFn() {
    const t = tagInput.trim();
    if (!t || tags.includes(t)) {
      setTagInput("");
      return;
    }
    setTags((prev) => [...prev, t]);
    setTagInput("");
    await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId: restaurant.id, tag: t }),
    });
    onVisited?.();
  }

  async function removeTagFn(t: string) {
    setTags((prev) => prev.filter((x) => x !== t));
    await fetch("/api/tags", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId: restaurant.id, tag: t }),
    });
    onVisited?.();
  }

  async function saveReview() {
    await fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId: restaurant.id, body: reviewDraft }),
    });
    setReview(reviewDraft.trim() || null);
    setReviewOpen(false);
  }

  function panMap() {
    map.panBy([0, -120], { animate: true });
  }

  async function uploadMenu(body: Record<string, string>) {
    setMenuLoading(true);
    setMenuErr(null);
    try {
      const res = await fetch("/api/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: restaurant.id, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "识别失败");
      setMenu(data.sections);
      setMenuText("");
    } catch (e) {
      setMenuErr(String(e));
    } finally {
      setMenuLoading(false);
    }
  }

  function onMenuFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      uploadMenu({ imageBase64: dataUrl.split(",")[1], mediaType: file.type });
    };
    reader.readAsDataURL(file);
  }

  async function toggleWant() {
    const next = !want;
    setWant(next);
    setWantSaved(false);
    if (next) {
      // 收藏时来一发星爆动画（取消收藏不放）
      setPopping(false);
      requestAnimationFrame(() => setPopping(true));
      setTimeout(() => setPopping(false), 650);
    }
    const res = await fetch("/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId: restaurant.id, want: next }),
    });
    if (res.ok) {
      setWantSaved(true);
      // 不立即刷新列表——会把弹窗关掉；等弹窗关闭时由 popupclose 统一刷新
      setTimeout(() => setWantSaved(false), 1500);
    }
  }

  async function markVisited(rating: number | null) {
    if (rating != null && (rating < 0 || rating > 100)) return;
    setSaving(true);
    try {
      const res = await fetch("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: restaurant.id, rating }),
      });
      if (res.ok) {
        setDone(true); // 刷新推迟到 popupclose，避免弹窗被关
      }
    } finally {
      setSaving(false);
    }
  }

  async function loadRecs() {
    if (recsOpen) {
      setRecsOpen(false);
      return;
    }
    setRecsOpen(true);
    // 面板展开会变高：把地图往下挪一点，避免弹窗顶部被裁掉
    map.panBy([0, -110], { animate: true });
    if (recs !== null) return;
    setRecsLoading(true);
    setRecsError(null);
    try {
      const res = await fetch(
        `/api/dishes/recommend?restaurantId=${restaurant.id}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "加载失败");
      setRecs(data.dishes ?? []);
      setMyDishes(data.myDishes ?? []);
    } catch (e) {
      setRecsError(String(e));
      setRecs(null);
    } finally {
      setRecsLoading(false);
    }
  }

  async function saveDish(verdict: "again" | "ok" | "never") {
    if (!dishName.trim()) return;
    await fetch("/api/dishes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantId: restaurant.id,
        name: dishName.trim(),
        verdict,
      }),
    });
    setMyDishes((prev) => [
      { name: dishName.trim(), verdict, notes: null },
      ...prev,
    ]);
    setDishName("");
    setDishSaved(true);
    setTimeout(() => setDishSaved(false), 1500);
  }

  return (
    <div
      ref={rootRef}
      className="max-h-[300px] min-w-[230px] max-w-[264px] space-y-1.5 overflow-y-auto text-sm"
    >
      {restaurant.hasPhoto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/photo?restaurantId=${restaurant.id}`}
          alt=""
          loading="lazy"
          className="mb-1 h-24 w-full rounded-md object-cover"
          onError={(e) => e.currentTarget.remove()}
        />
      )}
      <div className="font-semibold">{restaurant.name}</div>
      <div className="text-xs text-muted-foreground">
        {restaurant.rating != null && <>⭐ {restaurant.rating} </>}
        {restaurant.reviewCount != null && (
          <>({restaurant.reviewCount.toLocaleString()}) </>
        )}
        · <span className="uppercase">{restaurant.source}</span>
        {restaurant.priceLevel != null && restaurant.priceLevel > 0 && (
          <span className="text-emerald-600 dark:text-emerald-500">
            {" · "}
            {"¥".repeat(restaurant.priceLevel)}
          </span>
        )}
        {restaurant.distanceFromMeKm != null && (
          <span className="text-blue-600 dark:text-blue-400">
            {" · 📍 "}
            {restaurant.distanceFromMeKm.toFixed(1)} km
          </span>
        )}
      </div>
      {restaurant.address && (
        <div className="text-xs text-muted-foreground">{restaurant.address}</div>
      )}
      {/* 订位 / 外卖 快捷深链（外部搜索，演示模式也可用） */}
      <div className="flex flex-wrap gap-1.5">
        <a
          href={`https://www.opentable.com/s?term=${encodeURIComponent(restaurant.name)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          📅 订位
        </a>
        <a
          href={`https://www.doordash.com/search/store/${encodeURIComponent(restaurant.name)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          🛵 外卖
        </a>
      </div>
      {restaurant.visited && restaurant.myRating != null && (
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">我的评分</span>
          <span
            className={
              "inline-flex items-center rounded-full px-2 py-0.5 font-bold tabular-nums ring-1 " +
              [
                scoreTier(restaurant.myRating).bg,
                scoreTier(restaurant.myRating).ring,
                scoreTier(restaurant.myRating).text,
              ].join(" ")
            }
          >
            {restaurant.myRating} 分
          </span>
        </div>
      )}

      {/* 快捷操作行（只读演示下隐藏写操作） */}
      {!PUBLIC_DEMO && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="relative inline-flex">
            <button
              onClick={toggleWant}
              className={`rounded-full border px-2 py-0.5 text-xs font-medium transition-colors ${
                popping ? "fav-pop " : ""
              }${
                want
                  ? "border-amber-400 bg-amber-100 text-amber-800"
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {want ? "⭐ 已想去" : "☆ 想去吃"}
            </button>
            {popping && (
              <span className="fav-burst" aria-hidden>
                {[0, 1, 2, 3, 4, 5].map((i) => {
                  const a = (i / 6) * Math.PI * 2;
                  return (
                    <span
                      key={i}
                      style={
                        {
                          "--tx": `${Math.cos(a) * 22}px`,
                          "--ty": `${Math.sin(a) * 22}px`,
                        } as React.CSSProperties
                      }
                    />
                  );
                })}
              </span>
            )}
          </span>
          {!done && !restaurant.visited && (
            <button
              onClick={() => markVisited(null)}
              disabled={saving}
              className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-40"
            >
              ✓ 去过
            </button>
          )}
          {wantSaved && <span className="text-xs text-green-600">✓</span>}
          <button
            onClick={toggleHidden}
            className={`rounded-full border px-2 py-0.5 text-xs font-medium transition-colors ${
              hidden
                ? "border-red-400 bg-red-100 text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
            title={hidden ? "从黑名单恢复" : "拉黑：从地图/列表隐藏"}
          >
            {hidden ? "↩︎ 恢复" : "🚫 拉黑"}
          </button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <a
          href={googleMapsUrl(restaurant)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
        >
          Google Maps ↗
        </a>
        <button
          onClick={async () => {
            const p = new URLSearchParams(window.location.search);
            p.set("focus", String(restaurant.id));
            const url = `${location.origin}${location.pathname}?${p.toString()}`;
            try {
              await navigator.clipboard.writeText(url);
              setShared(true);
              setTimeout(() => setShared(false), 1500);
            } catch {}
          }}
          className="text-xs font-medium text-teal-600 hover:underline"
          title="复制这家店的分享链接"
        >
          {shared ? "已复制 ✓" : "🔗 分享"}
        </button>
        {!PUBLIC_DEMO && (
          <button
            onClick={loadRecs}
            className="text-xs font-medium text-orange-600 hover:underline"
          >
            🍜 吃什么好{recsOpen ? " ▲" : ""}
          </button>
        )}
        {(!PUBLIC_DEMO || review) && (
          <button
            onClick={() => {
              setReviewOpen((o) => !o);
              if (!reviewOpen) panMap();
            }}
            className="text-xs font-medium text-purple-600 hover:underline"
          >
            📝 点评{review ? " •" : ""}
            {reviewOpen ? " ▲" : ""}
          </button>
        )}
        <button
          onClick={() => {
            setMenuOpen((o) => !o);
            if (!menuOpen) panMap();
          }}
          className="text-xs font-medium text-emerald-600 hover:underline"
        >
          📋 菜单{menu ? " •" : ""}
          {menuOpen ? " ▲" : ""}
        </button>
        {xhsPosts.length > 0 && (
          <button
            onClick={() => {
              setXhsOpen((o) => !o);
              if (!xhsOpen) panMap();
            }}
            className="text-xs font-medium text-rose-600 hover:underline"
          >
            📕 小红书 ({xhsPosts.length}){xhsOpen ? " ▲" : ""}
          </button>
        )}
        {!PUBLIC_DEMO && (
          <button
            onClick={() => {
              setCollectOpen((o) => !o);
              if (!collectOpen) panMap();
            }}
            className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            📁 收藏{listIds.length > 0 ? ` (${listIds.length})` : ""}
            {collectOpen ? " ▲" : ""}
          </button>
        )}
      </div>

      {/* 收藏到清单 + 标签 */}
      {collectOpen && !PUBLIC_DEMO && (
        <div className="space-y-2 rounded-md bg-indigo-50 p-2 dark:bg-indigo-950/40">
          <div className="text-[11px] font-semibold text-indigo-800 dark:text-indigo-300">
            收藏到清单
          </div>
          <div className="flex flex-wrap gap-1">
            {allLists.map((l) => {
              const on = listIds.includes(l.id);
              return (
                <button
                  key={l.id}
                  onClick={() => toggleList(l.id)}
                  className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                    on
                      ? "border-indigo-400 bg-indigo-200 text-indigo-900 dark:border-indigo-600 dark:bg-indigo-800/60 dark:text-indigo-100"
                      : "border-indigo-200 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-900/40"
                  }`}
                >
                  {on ? "✓ " : ""}
                  {l.emoji ? `${l.emoji} ` : ""}
                  {l.name}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1">
            <input
              value={newList}
              onChange={(e) => setNewList(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createAndAddList()}
              placeholder="+ 新建清单并收藏…"
              className="h-6 flex-1 rounded border border-indigo-200 px-1.5 text-xs dark:border-indigo-800 dark:bg-transparent"
            />
            <button
              onClick={createAndAddList}
              disabled={!newList.trim()}
              className="rounded bg-indigo-600 px-2 py-0.5 text-xs text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              建
            </button>
          </div>

          <div className="border-t border-indigo-200 pt-1.5 dark:border-indigo-900/50">
            <div className="mb-1 text-[11px] font-semibold text-indigo-800 dark:text-indigo-300">
              标签
            </div>
            <div className="flex flex-wrap gap-1">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                >
                  🏷️ {t}
                  <button
                    onClick={() => removeTagFn(t)}
                    className="text-slate-400 hover:text-red-500"
                    aria-label={`删除标签 ${t}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-1 flex items-center gap-1">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTagFn()}
                placeholder="+ 加标签（如 有包厢/停车方便）…"
                className="h-6 flex-1 rounded border border-slate-200 px-1.5 text-xs dark:border-slate-700 dark:bg-transparent"
              />
              <button
                onClick={addTagFn}
                disabled={!tagInput.trim()}
                className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 小红书怎么说（评价摘要 + 推荐菜，累积多帖） */}
      {xhsOpen && xhsPosts.length > 0 && (
        <div className="max-h-48 space-y-2 overflow-y-auto rounded-md bg-rose-50 dark:bg-rose-950/40 p-2">
          {xhsPosts.map((p, i) => (
            <div key={i} className="space-y-0.5 border-rose-200 dark:border-rose-900/50 [&:not(:first-child)]:border-t [&:not(:first-child)]:pt-1.5">
              {p.summary && <div className="text-xs text-rose-900 dark:text-rose-100">{p.summary}</div>}
              {p.dishes.length > 0 && (
                <div className="text-xs text-rose-700 dark:text-rose-300">
                  <span className="font-medium">推荐：</span>
                  {p.dishes.join("、")}
                </div>
              )}
              {p.url && (
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-rose-500 hover:underline"
                >
                  看原帖 ↗
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 我的点评（只读演示下仅展示已有点评文字，不给编辑） */}
      {reviewOpen &&
        (PUBLIC_DEMO ? (
          review && (
            <div className="whitespace-pre-wrap rounded-md bg-purple-50 dark:bg-purple-950/40 p-2 text-xs text-purple-900 dark:text-purple-100">
              {review}
            </div>
          )
        ) : (
          <div className="space-y-1 rounded-md bg-purple-50 dark:bg-purple-950/40 p-2">
            <textarea
              value={reviewDraft}
              onChange={(e) => setReviewDraft(e.target.value)}
              placeholder="写点这家店的私人点评…"
              rows={3}
              className="w-full rounded border border-purple-200 dark:border-purple-900/50 px-2 py-1 text-xs"
            />
            <button
              onClick={saveReview}
              className="rounded bg-purple-600 px-2 py-0.5 text-xs text-white hover:bg-purple-700"
            >
              保存点评
            </button>
            {review && reviewDraft !== review && (
              <span className="ml-2 text-xs text-muted-foreground">已有点评，编辑中</span>
            )}
          </div>
        ))}

      {/* 菜单（AI 归纳+翻译）*/}
      {menuOpen && (
        <div className="max-h-48 space-y-2 overflow-y-auto rounded-md bg-emerald-50 dark:bg-emerald-950/40 p-2">
          {menu &&
            menu.map((sec) => (
              <div key={sec.name}>
                <div className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  {sec.name}
                </div>
                {sec.items.map((it, i) => (
                  <div key={i} className="text-xs text-foreground">
                    <span className="font-medium">{it.translated}</span>
                    <span className="text-muted-foreground"> · {it.original}</span>
                    {it.price && <span className="text-emerald-700"> · {it.price}</span>}
                    {it.note && <div className="text-muted-foreground">{it.note}</div>}
                  </div>
                ))}
              </div>
            ))}
          {menuLoading && (
            <div className="text-xs text-muted-foreground">AI 识别+翻译菜单中…</div>
          )}
          {menuErr && <div className="text-xs text-red-500">{menuErr}</div>}
          {!menu && PUBLIC_DEMO && (
            <div className="text-xs text-muted-foreground">这家店还没有菜单。</div>
          )}
          {!PUBLIC_DEMO && (
          <div className="space-y-1 border-t border-emerald-200 dark:border-emerald-900/50 pt-1.5">
            <div className="text-[10px] text-muted-foreground">
              {menu ? "重传覆盖：" : "加菜单："}拍照上传，或贴文字
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => menuFileRef.current?.click()}
                disabled={menuLoading}
                className="rounded border border-emerald-300 px-2 py-0.5 text-xs hover:bg-emerald-100 disabled:opacity-40"
              >
                📷 上传照片
              </button>
              <input
                ref={menuFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onMenuFile(f);
                  e.target.value = "";
                }}
              />
            </div>
            <div className="flex items-start gap-1">
              <textarea
                value={menuText}
                onChange={(e) => setMenuText(e.target.value)}
                placeholder="或贴菜单文字…"
                rows={2}
                className="flex-1 rounded border border-emerald-200 dark:border-emerald-900/50 px-1.5 py-1 text-xs"
              />
              <button
                onClick={() => uploadMenu({ text: menuText })}
                disabled={menuLoading || !menuText.trim()}
                className="rounded bg-emerald-600 px-2 py-0.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                识别
              </button>
            </div>
          </div>
          )}
        </div>
      )}

      {recsOpen && (
        <div className="max-h-32 space-y-1 overflow-y-auto rounded-md bg-orange-50 dark:bg-orange-950/40 p-2">
          {recsLoading && (
            <div className="text-xs text-muted-foreground">从评论里挖招牌菜…</div>
          )}
          {recsError && <div className="text-xs text-red-500">{recsError}</div>}
          {recs && recs.length === 0 && !recsLoading && (
            <div className="text-xs text-muted-foreground">评论里没挖到被点名夸的菜。</div>
          )}
          {recs?.map((d) => (
            <div key={d.name} className="text-xs">
              <span className="font-medium">{d.name}</span>
              {d.mentions > 0 && (
                <span className="text-muted-foreground">（{d.mentions} 次提及）</span>
              )}
              {d.quote && <div className="text-muted-foreground">“{d.quote}”</div>}
            </div>
          ))}
          {myDishes.length > 0 && (
            <div className="border-t border-orange-200 dark:border-orange-900/50 pt-1">
              <div className="text-[10px] font-medium text-muted-foreground">我的记录</div>
              {myDishes.map((d, i) => (
                <div key={i} className="text-xs">
                  {d.name}{" "}
                  <span className="text-muted-foreground">
                    {VERDICT_LABEL[d.verdict] ?? d.verdict}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!PUBLIC_DEMO &&
        (done ? (
        <div className="space-y-1 pt-1">
          <div className="text-xs text-green-600">已记录 ✓</div>
          <div className="flex items-center gap-1">
            <input
              value={dishName}
              onChange={(e) => setDishName(e.target.value)}
              placeholder="点了什么菜？(可选)"
              className="h-6 w-28 rounded border border-border px-1.5 text-xs"
            />
            <button
              onClick={() => saveDish("again")}
              disabled={!dishName.trim()}
              className="text-xs hover:scale-110 disabled:opacity-30"
              title="值得再点"
            >
              👍
            </button>
            <button
              onClick={() => saveDish("ok")}
              disabled={!dishName.trim()}
              className="text-xs hover:scale-110 disabled:opacity-30"
              title="一般"
            >
              😐
            </button>
            <button
              onClick={() => saveDish("never")}
              disabled={!dishName.trim()}
              className="text-xs hover:scale-110 disabled:opacity-30"
              title="避雷"
            >
              🚫
            </button>
          </div>
          {dishSaved && <div className="text-xs text-green-600">菜已记 ✓</div>}
        </div>
      ) : (
        <div className="space-y-1 pt-1">
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-xs text-muted-foreground">打分：</span>
            {SCORE_CHIPS.map((s) => (
              <button
                key={s}
                disabled={saving}
                onClick={() => markVisited(s)}
                className="rounded-full border border-border px-1.5 py-0.5 text-xs hover:border-amber-400 hover:bg-amber-50 disabled:opacity-40"
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={100}
              value={scoreInput}
              onChange={(e) => setScoreInput(e.target.value)}
              placeholder="0-100"
              className="h-6 w-16 rounded border border-border px-1.5 text-xs"
            />
            <button
              disabled={saving || scoreInput === ""}
              onClick={() => markVisited(Number(scoreInput))}
              className="rounded border border-border px-2 py-0.5 text-xs hover:bg-accent disabled:opacity-40"
            >
              打分
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
