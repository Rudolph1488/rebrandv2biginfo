export default function WorkspaceLoading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded-xl bg-slate-200 dark:bg-white/10" />
          <div className="h-4 w-72 rounded-lg bg-slate-200/70 dark:bg-white/5" />
        </div>
        <div className="h-9 w-36 rounded-xl bg-slate-200 dark:bg-white/10" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-28 rounded-2xl border border-slate-200/60 bg-white p-5 dark:border-white/10 dark:bg-[#0d1017]"
          >
            <div className="h-3 w-20 rounded bg-slate-200 dark:bg-white/10" />
            <div className="mt-4 h-7 w-28 rounded-lg bg-slate-200 dark:bg-white/10" />
          </div>
        ))}
      </div>

      <div className="h-72 rounded-2xl border border-slate-200/60 bg-white dark:border-white/10 dark:bg-[#0d1017]" />
    </div>
  );
}
