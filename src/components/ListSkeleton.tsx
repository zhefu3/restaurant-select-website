/** 列表加载占位骨架，首屏/切地区时用，避免空白。 */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
          <div className="h-14 w-14 shrink-0 animate-pulse rounded-lg bg-muted" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="h-4 w-40 animate-pulse rounded bg-muted" />
              <div className="h-4 w-12 animate-pulse rounded bg-muted/70" />
            </div>
            <div className="mt-2 h-3 w-56 animate-pulse rounded bg-muted/60" />
            <div className="mt-1.5 h-3 w-64 animate-pulse rounded bg-muted/40" />
          </div>
        </div>
      ))}
    </div>
  );
}
