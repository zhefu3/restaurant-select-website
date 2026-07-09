"use client";

/**
 * 小红书收藏入口：
 *   - 贴帖子**链接**（best-effort 抓公开摘要，反爬抓不到会提示改贴文字/截图）
 *   - 贴帖子文字 → Anthropic 提取
 *   - 或直接贴/拖/选**截图** → Claude vision 识别（刷到→截图→丢进来，最顺手）
 * 提取后 Places 反查 → 列候选点选确认 → 加入「想去吃」，并把「评价摘要+推荐菜」存到店上。
 */

import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import type { PlaceResult } from "@/lib/google-places";

interface Candidate {
  captureId: number;
  extractedName: string;
  note: string | null;
  summary: string | null;
  dishes: string[];
  places: PlaceResult[];
}

const ALLOWED = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export function XhsPasteBox({ onChanged }: { onChanged?: () => void }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submitBody(body: Record<string, string>) {
    setLoading(true);
    setError(null);
    setNotice(null);
    setCandidates([]);
    try {
      const res = await fetch("/api/xhs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "提取失败");
      setCandidates(data.candidates ?? []);
      if (data.notice) setNotice(data.notice);
      if ((data.candidates ?? []).length === 0 && !data.notice) {
        setError("没识别到餐厅。");
      }
      // 大列表自动入库：清空输入并刷新列表。
      if (data.added && data.added > 0) {
        setText("");
        setImagePreview(null);
        onChanged?.();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleImageFile(file: File) {
    if (!ALLOWED.includes(file.type)) {
      setError(`不支持的图片类型：${file.type}`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setImagePreview(dataUrl);
      const base64 = dataUrl.split(",")[1];
      submitBody({ imageBase64: base64, mediaType: file.type });
    };
    reader.readAsDataURL(file);
  }

  function onPaste(e: React.ClipboardEvent) {
    const item = [...e.clipboardData.items].find((i) =>
      i.type.startsWith("image/"),
    );
    if (item) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) handleImageFile(file);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) handleImageFile(file);
  }

  async function resolve(
    captureId: number,
    action: "resolve" | "reject",
    place?: PlaceResult,
  ) {
    await fetch("/api/xhs/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ captureId, action, place }),
    });
    setCandidates((prev) => prev.filter((c) => c.captureId !== captureId));
    if (action === "resolve") {
      setText("");
      setImagePreview(null);
      onChanged?.();
    }
  }

  return (
    <div className="space-y-3">
      <div onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          placeholder="贴小红书帖子链接 🔗 或文字，或直接粘贴/拖入截图 📸 …"
          rows={4}
        />
      </div>

      {imagePreview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imagePreview}
          alt="截图预览"
          className="max-h-32 rounded-md border"
        />
      )}

      <div className="flex items-center gap-2">
        <Button
          onClick={() => submitBody({ text })}
          disabled={loading || !text.trim()}
        >
          {loading ? "识别中…" : "提取餐厅"}
        </Button>
        <Button
          variant="outline"
          size="icon"
          title="上传截图"
          disabled={loading}
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlus className="h-4 w-4" />
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept={ALLOWED.join(",")}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImageFile(f);
            e.target.value = "";
          }}
        />
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>

      {notice && (
        <p className="rounded-md bg-amber-50 dark:bg-amber-950/40 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-300">
          {notice}
        </p>
      )}

      {candidates.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            识别到 {candidates.length} 家，点选确认：
          </p>
          {candidates.map((c) => (
            <Card key={c.captureId}>
              <CardContent className="space-y-2 p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium">
                    {c.extractedName}
                    {c.note && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {c.note}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => resolve(c.captureId, "reject")}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    跳过
                  </button>
                </div>

                {(c.summary || c.dishes.length > 0) && (
                  <div className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-2 py-1.5 text-xs text-rose-800 dark:text-rose-200">
                    <span className="font-medium">📕 小红书：</span>
                    {c.summary}
                    {c.dishes.length > 0 && (
                      <span className="text-rose-600 dark:text-rose-400">
                        {c.summary ? " ｜ " : ""}推荐：{c.dishes.join("、")}
                      </span>
                    )}
                  </div>
                )}

                {c.places.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Google 上没查到匹配的店。
                  </p>
                ) : (
                  <div className="space-y-1">
                    {c.places.map((p) => (
                      <button
                        key={p.placeId}
                        onClick={() => resolve(c.captureId, "resolve", p)}
                        className="flex w-full items-center justify-between rounded-md border border-input px-3 py-2 text-left text-sm hover:bg-accent"
                      >
                        <span>
                          <span className="font-medium">{p.name}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {p.rating != null && `⭐ ${p.rating} `}
                            {p.address}
                          </span>
                        </span>
                        <span className="text-xs text-primary">加入 →</span>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
