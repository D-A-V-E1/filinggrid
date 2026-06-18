export default function CompareLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <div className="h-9 w-64 animate-pulse rounded bg-slate-200" />
        <div className="h-9 w-28 animate-pulse rounded bg-slate-100" />
        <div className="h-9 w-36 animate-pulse rounded bg-slate-100" />
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-slate-50 p-4 md:block">
          <div className="h-3 w-20 animate-pulse rounded bg-slate-300" />
          <div className="mt-3 space-y-2">
            <div className="h-7 w-full animate-pulse rounded bg-slate-200" />
            <div className="h-7 w-full animate-pulse rounded bg-slate-200" />
            <div className="h-7 w-full animate-pulse rounded bg-slate-200" />
          </div>
        </aside>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex min-h-0 flex-col border-r border-slate-200 bg-slate-50/60">
              <div className="border-b border-slate-200 bg-white px-4 py-3">
                <div className="h-5 w-20 animate-pulse rounded bg-slate-200" />
                <div className="mt-2 h-3 w-40 animate-pulse rounded bg-slate-100" />
              </div>
              <div className="p-4">
                <div className="h-28 animate-pulse rounded bg-brand-100/60" />
                <div className="mt-4 h-24 animate-pulse rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
