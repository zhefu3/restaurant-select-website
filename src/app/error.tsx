"use client";

/** 全局错误边界：渲染出错时给个体面的重试页，而不是白屏。 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <div className="text-3xl">🍽️</div>
      <h2 className="mt-3 text-lg font-semibold">出了点问题</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        页面遇到错误，多半是网络或数据加载失败。
      </p>
      <button
        onClick={reset}
        className="mt-4 rounded-md border border-input px-4 py-2 text-sm hover:bg-accent"
      >
        重试
      </button>
    </div>
  );
}
