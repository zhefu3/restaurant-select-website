"use client";

/**
 * 深色模式全屏星空 + 流星 + 偶尔飞过的 UFO（浅色时隐形）。
 * 点 UFO → 飞船停住、小外星人 Gusto 从船顶冒头招手，旁边一个贴着飞船的小气泡里聊天，
 * 聊到最后从你的餐厅库推荐一家（就地交互，不遮挡整页）。
 * 位置用确定式伪随机算出（不用 Math.random 渲染，避免 SSR 水合不一致）。
 */

import { useEffect, useMemo, useState } from "react";
import { cuisineLabel } from "@/lib/cuisine";
import { isRecommended, type RestaurantView } from "@/lib/types";

const STARS = Array.from({ length: 64 }, (_, i) => ({
  left: (i * 61.803) % 100,
  top: (i * 37.5 + ((i * i) % 29)) % 100,
  size: 1 + (i % 3) * 0.7,
  dur: 2.4 + (i % 5) * 0.55,
  delay: (i % 8) * 0.45,
}));

const METEORS: [number, number, number, number][] = [
  [82, 2, 6, 0.5],
  [58, -4, 7, 1.8],
  [95, 10, 6.5, 3],
  [44, 4, 7.5, 4.2],
  [72, 18, 6, 5.4],
  [90, 28, 7, 6.6],
  [64, -6, 6.5, 7.8],
  [50, 24, 7.5, 9],
  [86, 40, 6, 10.5],
  [38, 14, 7, 12],
];

interface Node {
  text: string;
  next?: string;
  choices?: { label: string; to: string }[];
  reco?: boolean;
}

// 气泡很小，台词都写短；hub 循环可多聊几轮
const SCRIPT: Record<string, Node> = {
  start: {
    text: "👋 hi！被你抓到啦。我是 Gusto，M69 星系的美食星人 🛸",
    next: "intro",
  },
  intro: {
    text: "我们星球没吃的，只有营养膏。我就开着船满宇宙找好吃的。",
    choices: [
      { label: "飞船靠啥飞？", to: "ship" },
      { label: "M69 在哪？", to: "m69" },
      { label: "给我推荐！", to: "reco_intro" },
    ],
  },
  ship: {
    text: "靠『美味的记忆』！你们的火锅，我一口够飞三光年 🔥",
    next: "hub",
  },
  m69: {
    text: "就是你们望远镜里的 Messier 69，2.97 万光年外的星团。很美，但真的很难吃 😔",
    next: "hub",
  },
  hub: {
    text: "还想知道啥？",
    choices: [
      { label: "你最爱吃啥？", to: "best" },
      { label: "你咋找到地球的？", to: "found" },
      { label: "你会做饭吗？", to: "cook" },
      { label: "挑一家吃的！", to: "reco_intro" },
    ],
  },
  best: {
    text: "银河边缘有种『会发光的面』，一口能让人想起初恋。可惜他们不外卖 🌟",
    next: "hub2",
  },
  found: {
    text: "循着香味来的。你们的深夜烧烤摊，香气都飘出大气层了 🍢",
    next: "hub2",
  },
  cook: {
    text: "不会！我只负责吃和评分。做饭是隔壁『厨神座』星系的活儿 ♨️",
    next: "hub2",
  },
  hub2: {
    text: "嗯嗯，再问？",
    choices: [
      { label: "你有啥秘密？", to: "lore" },
      { label: "宇宙第一味是啥？", to: "quest" },
      { label: "给我推荐！", to: "reco_intro" },
    ],
  },
  lore: {
    text: "三个胃、七条舌、1400 万份菜谱。唯一天敌是香菜——那是『宇宙尽头的味道』🌿💀",
    next: "hub3",
  },
  quest: {
    text: "传说一口能尝到整个宇宙。我找了 800 年……也许就藏在你的收藏里 ✨",
    next: "hub3",
  },
  hub3: {
    text: "要不，让我给你挑一家？",
    choices: [
      { label: "好啊，挑一家！", to: "reco_intro" },
      { label: "再唠会儿", to: "more" },
      { label: "我该走了", to: "bye" },
    ],
  },
  more: {
    text: "偷偷说：别迷信『米其林三星』——在我们那儿至少『银河七星』才算好吃 😎",
    next: "reco_intro",
  },
  reco_intro: {
    text: "让传感器帮你挑一家…嗡…叮！",
    next: "reco",
  },
  reco: { text: "", reco: true },
  bye: { text: "该走了，香味在别的宇宙叫我啦 🛸✨", next: "__close" },
};

function pickReco(list: RestaurantView[]): RestaurantView | null {
  const reco = list.filter((r) => isRecommended(r));
  const high = list.filter((r) => (r.rating ?? 0) >= 4.5);
  const from = reco.length ? reco : high.length ? high : list;
  return from.length ? from[Math.floor(Math.random() * from.length)] : null;
}

export function StarField({
  restaurants,
  onLocate,
}: {
  restaurants?: RestaurantView[];
  onLocate?: (id: number) => void;
} = {}) {
  const [active, setActive] = useState(false);
  const [nodeId, setNodeId] = useState("start");
  const [pick, setPick] = useState<RestaurantView | null>(null);
  const interactive = !!restaurants && !!onLocate;

  useEffect(() => {
    if (active) {
      setNodeId("start");
      setPick(null);
    }
  }, [active]);

  const node = SCRIPT[nodeId];
  const onReco = active && (node?.reco ?? false);

  useEffect(() => {
    if (onReco && !pick && restaurants) setPick(pickReco(restaurants));
  }, [onReco, pick, restaurants]);

  const advance = (to?: string) => {
    if (!to) return;
    if (to === "__close") return setActive(false);
    setNodeId(to);
  };

  return (
    <>
      <div className="starfield" aria-hidden>
        {STARS.map((s, i) => (
          <span
            key={`s${i}`}
            className="sf-star"
            style={{
              left: `${s.left}%`,
              top: `${s.top}%`,
              width: `${s.size}px`,
              height: `${s.size}px`,
              // @ts-expect-error CSS 自定义属性
              "--dur": `${s.dur}s`,
              "--delay": `${s.delay}s`,
            }}
          />
        ))}
      </div>

      <div
        className={`meteor-layer${active ? " meteor-layer-top" : ""}`}
        aria-hidden={!active}
      >
        {METEORS.map(([left, top, dur, delay], i) => (
          <span
            key={`m${i}`}
            className="meteor"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              // @ts-expect-error CSS 自定义属性
              "--dur": `${dur}s`,
              "--delay": `${delay}s`,
            }}
          />
        ))}

        <div
          className={`spaceship${interactive ? " ufo-clickable" : ""}${active ? " ufo-active" : ""}`}
          onClick={interactive && !active ? () => setActive(true) : undefined}
          role={interactive ? "button" : undefined}
          aria-label={interactive ? "神秘飞船" : undefined}
        >
          <svg width="48" height="26" viewBox="0 0 48 26" fill="none">
            <ellipse cx="24" cy="16" rx="22" ry="6.5" fill="#8b9dff" />
            <ellipse cx="24" cy="16" rx="22" ry="6.5" fill="#c7d2fe" opacity="0.4" />
            <ellipse cx="24" cy="12" rx="10.5" ry="7.5" fill="#dbe4ff" />
            <ellipse cx="24" cy="11" rx="6" ry="4" fill="#a5c8ff" opacity="0.7" />
            <circle className="ufo-light" cx="12" cy="17.5" r="1.5" fill="#fde68a" />
            <circle className="ufo-light" cx="24" cy="19" r="1.5" fill="#fca5a5" />
            <circle className="ufo-light" cx="36" cy="17.5" r="1.5" fill="#86efac" />
          </svg>

          {active && (
            <>
              {/* 冒头的小外星人（招手） */}
              <div className="ufo-alien" aria-hidden>
                <svg width="30" height="30" viewBox="0 0 30 30">
                  <line x1="11" y1="7" x2="8" y2="1" stroke="#4ade80" strokeWidth="1.4" />
                  <line x1="19" y1="7" x2="22" y2="1" stroke="#4ade80" strokeWidth="1.4" />
                  <circle cx="8" cy="1.5" r="1.6" fill="#a7f3d0" />
                  <circle cx="22" cy="1.5" r="1.6" fill="#a7f3d0" />
                  <ellipse cx="15" cy="15" rx="10.5" ry="11.5" fill="#4ade80" />
                  <ellipse cx="11" cy="15" rx="2.8" ry="4.2" fill="#0b1020" transform="rotate(-16 11 15)" />
                  <ellipse cx="19" cy="15" rx="2.8" ry="4.2" fill="#0b1020" transform="rotate(16 19 15)" />
                  <circle cx="12" cy="13" r="0.9" fill="#fff" />
                  <circle cx="20" cy="13" r="0.9" fill="#fff" />
                  <path d="M12 21 Q15 23.5 18 21" stroke="#166534" strokeWidth="1.3" fill="none" strokeLinecap="round" />
                  <g className="wave">
                    <line x1="24" y1="16" x2="29" y2="11" stroke="#4ade80" strokeWidth="2.4" strokeLinecap="round" />
                  </g>
                </svg>
              </div>

              {/* 贴着飞船的小气泡对话 */}
              <div className="ufo-bubble" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2 border-b px-3 py-1.5">
                  <span className="text-xs font-semibold text-emerald-500">
                    Gusto · M69
                  </span>
                  <button
                    onClick={() => setActive(false)}
                    aria-label="关闭"
                    className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                  >
                    ✕
                  </button>
                </div>

                {onReco ? (
                  <div className="space-y-2 p-3">
                    {pick ? (
                      <>
                        <p className="text-xs leading-relaxed">
                          「<span className="font-semibold">{pick.name}</span>」
                          {pick.rating != null && <> ⭐{pick.rating}</>}
                          ，传感器嗡嗡响，替我尝一口。
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            onClick={() => {
                              onLocate?.(pick.id);
                              setActive(false);
                            }}
                            className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:opacity-90"
                          >
                            📍 带我去
                          </button>
                          <button
                            onClick={() => restaurants && setPick(pickReco(restaurants))}
                            className="rounded-full border px-2.5 py-1 text-[11px] hover:bg-accent"
                          >
                            🎲 再挑
                          </button>
                          <button
                            onClick={() => advance("bye")}
                            className="rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-accent"
                          >
                            拜拜
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">扫描中…</p>
                    )}
                  </div>
                ) : (
                  <div
                    className={`p-3 ${node.choices ? "" : "cursor-pointer"}`}
                    onClick={node.choices ? undefined : () => advance(node.next)}
                  >
                    <p className="text-xs leading-relaxed">{node.text}</p>
                    {node.choices ? (
                      <div className="mt-2 flex flex-col gap-1">
                        {node.choices.map((c) => (
                          <button
                            key={c.to}
                            onClick={() => advance(c.to)}
                            className="rounded-md border px-2.5 py-1.5 text-left text-[11px] transition-colors hover:border-emerald-400 hover:bg-accent"
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-1 text-right text-[10px] text-emerald-500">
                        点继续 ▶
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
