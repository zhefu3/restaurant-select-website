"use client";

/** 排位赛：两两对决 + 实时排行榜（Beli 式）。 */

import { useCallback, useEffect, useState } from "react";
import { Swords, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cuisineLabel } from "@/lib/cuisine";
import { useEscape } from "@/lib/use-escape";

interface Ranked {
  id: number;
  name: string;
  cuisine: string | null;
  elo: number;
  wins: number;
  losses: number;
  duelCount: number;
}

interface DuelState {
  pair: [Ranked, Ranked] | null;
  rankings: Ranked[];
  visitedCount: number;
}

export function DuelModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [state, setState] = useState<DuelState | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/duel");
      setState(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);
  useEscape(open, onClose);

  if (!open) return null;

  async function vote(winnerId: number, loserId: number) {
    setLoading(true);
    try {
      const res = await fetch("/api/duel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winnerId, loserId }),
      });
      setState(await res.json());
    } finally {
      setLoading(false);
    }
  }

  const ranked = (state?.rankings ?? []).filter((r) => r.duelCount > 0);

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 font-semibold">
            <Swords className="h-4 w-4" /> 排位赛
          </h3>
          <button onClick={onClose} className="text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {state && state.visitedCount < 2 ? (
          <p className="text-sm text-muted-foreground">
            至少给 2 家店打过「吃过」评分才能开始排位。去地图上点几家你吃过的店打个分吧！
          </p>
        ) : state?.pair ? (
          <div className="space-y-3">
            <p className="text-center text-sm text-muted-foreground">
              哪家更好吃？
            </p>
            <div className="grid grid-cols-2 gap-3">
              {state.pair.map((r, idx) => {
                const other = state.pair![1 - idx];
                return (
                  <button
                    key={r.id}
                    disabled={loading}
                    onClick={() => vote(r.id, other.id)}
                    className="rounded-lg border-2 border-input p-3 text-left transition-colors hover:border-amber-400 hover:bg-amber-50 disabled:opacity-50"
                  >
                    <div className="font-medium leading-tight">{r.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {r.cuisine ? cuisineLabel(r.cuisine) : ""}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-center text-xs text-muted-foreground">
              点一家 → 自动进入下一组
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">加载中…</p>
        )}

        {ranked.length > 0 && (
          <div className="mt-5 border-t pt-3">
            <h4 className="mb-2 text-sm font-semibold">🏆 我的排行榜</h4>
            <ol className="space-y-1">
              {ranked.slice(0, 10).map((r, i) => (
                <li key={r.id} className="flex items-center justify-between text-sm">
                  <span>
                    <span className="mr-1.5 inline-block w-5 text-right font-mono text-muted-foreground">
                      {i + 1}.
                    </span>
                    {r.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {Math.round(r.elo)} · {r.wins}胜{r.losses}负
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {state && state.pair && (
          <div className="mt-3 text-right">
            <Button variant="ghost" size="sm" onClick={onClose}>
              今天先排到这
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
