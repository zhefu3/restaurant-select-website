"use client";

/**
 * 浮动对话助理：右下角气泡 → 抽屉式对话框。
 * 和 Claude 聊天选餐；回复**流式逐字**出现；推荐的店以卡片出现，可点「地图定位」联动左侧地图。
 * Agent 也能提议写操作（想去吃/去过/加清单/拉黑）→ 出确认卡，点确认才生效。
 */

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Check, Loader2, SquarePen } from "lucide-react";
import { cuisineLabel } from "@/lib/cuisine";
import { googleMapsUrl, type RestaurantView } from "@/lib/types";
import type { ProposedAction } from "@/lib/chat-agent";
import { useEscape } from "@/lib/use-escape";

type ActState = "pending" | "doing" | "done" | "error";

interface Msg {
  role: "user" | "assistant";
  content: string;
  recommendations?: RestaurantView[];
  status?: string; // 工具调用中的临时提示
  streaming?: boolean;
  actions?: ProposedAction[];
  actionStates?: ActState[];
}

const SUGGESTIONS = [
  "想吃点辣的，别太远",
  "带爸妈周末聚餐去哪好",
  "离家 5km 内评分最高的日料",
  "我没去过的宝藏小馆",
];

/** 极简富文本：把 **加粗** 渲染成 <strong>，其余原样（换行交给 whitespace-pre-wrap）。 */
function renderRich(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.length > 4 && p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i}>{p.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function actionLabel(a: ProposedAction): string {
  switch (a.kind) {
    case "want_to_eat":
      return a.want
        ? `加入「想去吃」· ${a.restaurantName}`
        : `移出「想去吃」· ${a.restaurantName}`;
    case "visited":
      return `标记去过 · ${a.restaurantName}${
        a.rating != null ? `（打分 ${a.rating}）` : ""
      }`;
    case "add_to_list":
      return `加进清单「${a.listName}」· ${a.restaurantName}`;
    case "hide":
      return `拉黑 · ${a.restaurantName}`;
  }
}

export function ChatWidget({
  onLocate,
  onDataChanged,
}: {
  onLocate: (r: RestaurantView) => void;
  onDataChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [convId, setConvId] = useState<number | null>(null);
  const [loadedHistory, setLoadedHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEscape(open, () => setOpen(false));

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  // 首次打开：载入最近一段会话（存库的对话续上）。
  useEffect(() => {
    if (!open || loadedHistory) return;
    setLoadedHistory(true);
    fetch("/api/conversations/recent")
      .then((r) => r.json())
      .then((d) => {
        if (d.conversation) {
          setConvId(d.conversation.id);
          setMessages(
            (d.conversation.messages ?? []).map((m: Msg) => ({
              role: m.role,
              content: m.content,
              recommendations: m.recommendations,
            })),
          );
        }
      })
      .catch(() => {});
  }, [open, loadedHistory]);

  function newChat() {
    setMessages([]);
    setConvId(null);
    setInput("");
  }

  /** 只改最后一条（正在流式的 assistant）消息。 */
  function patchLast(fn: (m: Msg) => Msg) {
    setMessages((p) => {
      if (!p.length) return p;
      const c = p.slice();
      c[c.length - 1] = fn(c[c.length - 1]);
      return c;
    });
  }

  async function confirmAction(msgIdx: number, actIdx: number, a: ProposedAction) {
    setActState(msgIdx, actIdx, "doing");
    try {
      const res = await fetch("/api/agent/act", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: a }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setActState(msgIdx, actIdx, "done");
      onDataChanged?.();
    } catch {
      setActState(msgIdx, actIdx, "error");
    }
  }

  function setActState(msgIdx: number, actIdx: number, s: ActState) {
    setMessages((p) => {
      const c = p.slice();
      const m = c[msgIdx];
      if (!m?.actions) return p;
      const states = (m.actionStates ?? m.actions.map(() => "pending")).slice();
      states[actIdx] = s;
      c[msgIdx] = { ...m, actionStates: states };
      return c;
    });
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    const base: Msg[] = [...messages, { role: "user", content: q }];
    // 先放用户消息 + 一个空的流式 assistant 占位
    setMessages([...base, { role: "assistant", content: "", streaming: true }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: base.map((m) => ({ role: m.role, content: m.content })),
          enableWrites: true,
          conversationId: convId ?? undefined,
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        patchLast((m) => ({
          ...m,
          streaming: false,
          status: undefined,
          content: data.capped
            ? "本月对话额度已用满（成本上限），下个月再聊或调高上限。"
            : `出错了：${data.error ?? "未知"}`,
        }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let ev: Record<string, unknown>;
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          applyEvent(ev);
        }
      }
    } catch (e) {
      patchLast((m) => ({
        ...m,
        streaming: false,
        status: undefined,
        content: m.content || `网络错误：${String(e)}`,
      }));
    } finally {
      setLoading(false);
      patchLast((m) => (m.streaming ? { ...m, streaming: false } : m));
    }
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  function applyEvent(ev: any) {
    switch (ev.type) {
      case "conversation":
        setConvId(ev.id);
        break;
      case "delta":
        patchLast((m) => ({
          ...m,
          content: m.content + (ev.text ?? ""),
          status: undefined,
        }));
        break;
      case "status":
        patchLast((m) => ({ ...m, status: ev.text }));
        break;
      case "recommendations":
        patchLast((m) => ({ ...m, recommendations: ev.items ?? [] }));
        break;
      case "action":
        patchLast((m) => {
          const actions = [...(m.actions ?? []), ev.action as ProposedAction];
          return {
            ...m,
            actions,
            actionStates: actions.map(
              (_, i) => m.actionStates?.[i] ?? "pending",
            ),
          };
        });
        break;
      case "done":
        patchLast((m) => ({
          ...m,
          content: ev.reply ?? m.content,
          streaming: false,
          status: undefined,
        }));
        break;
      case "error":
        patchLast((m) => ({
          ...m,
          streaming: false,
          status: undefined,
          content: m.content
            ? m.content + "\n\n（生成中断了，稍后再试）"
            : "出错了，稍后再试。",
        }));
        break;
    }
  }

  return (
    <>
      {/* 浮动气泡 */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-[1100] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
        title="问问选餐助理"
        aria-label="打开选餐助理"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* 抽屉 */}
      {open && (
        <div className="fixed bottom-24 right-5 z-[1100] flex h-[70vh] max-h-[600px] w-[min(92vw,400px)] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
          <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
            <div>
              <div className="font-semibold">🍽️ 选餐助理</div>
              <div className="text-xs text-muted-foreground">
                说说你想吃啥，我从你的餐厅库里帮你挑
              </div>
            </div>
            {messages.length > 0 && (
              <button
                onClick={newChat}
                className="flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent"
                title="开始新对话"
              >
                <SquarePen className="h-3.5 w-3.5" /> 新对话
              </button>
            )}
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">试试这么问：</p>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="block w-full rounded-lg border border-input px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i}>
                {/* 空的流式占位：还没出字时显示状态/想想 */}
                {m.role === "assistant" && !m.content ? (
                  <div className="mr-auto w-fit rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-muted-foreground">
                    {m.status ?? "想想…"}
                  </div>
                ) : (
                  <div
                    className={
                      m.role === "user"
                        ? "ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground"
                        : "mr-auto w-fit max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm"
                    }
                  >
                    {renderRich(m.content)}
                    {m.streaming && (
                      <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-foreground/50" />
                    )}
                  </div>
                )}

                {/* 工具状态（已有正文时显示在气泡下方一行） */}
                {m.role === "assistant" && m.content && m.status && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {m.status}
                  </div>
                )}

                {m.recommendations && m.recommendations.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {m.recommendations.map((r) => (
                      <div key={r.id} className="rounded-lg border p-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <a
                            href={googleMapsUrl(r)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="truncate font-medium hover:underline"
                          >
                            {r.name} ↗
                          </a>
                          <button
                            onClick={() => {
                              onLocate(r);
                              setOpen(false);
                            }}
                            className="shrink-0 text-xs text-blue-600 hover:underline"
                          >
                            地图定位
                          </button>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {r.rating != null && <>⭐ {r.rating} </>}
                          {r.cuisine && <>· {cuisineLabel(r.cuisine)} </>}
                          {r.distanceKm != null && (
                            <>· 🏠 {r.distanceKm.toFixed(1)}km</>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 待确认的写操作卡 */}
                {m.actions && m.actions.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {m.actions.map((a, ai) => {
                      const st = m.actionStates?.[ai] ?? "pending";
                      return (
                        <div
                          key={ai}
                          className="flex items-center justify-between gap-2 rounded-lg border border-dashed p-2 text-sm"
                        >
                          <span className="truncate">{actionLabel(a)}</span>
                          {st === "done" ? (
                            <span className="shrink-0 text-xs text-green-600">
                              ✓ 已完成
                            </span>
                          ) : st === "error" ? (
                            <button
                              onClick={() => confirmAction(i, ai, a)}
                              className="shrink-0 text-xs text-red-600 hover:underline"
                            >
                              失败，重试
                            </button>
                          ) : st === "doing" ? (
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                          ) : (
                            <button
                              onClick={() => confirmAction(i, ai, a)}
                              className="flex shrink-0 items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs text-primary-foreground hover:opacity-90"
                            >
                              <Check className="h-3 w-3" /> 确认
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t p-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="想吃什么…"
              className="h-10 flex-1 rounded-full border border-input bg-background px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
