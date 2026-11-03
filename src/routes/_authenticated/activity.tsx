import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { q } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({
    meta: [
      { title: "Activity · Flux Links" },
      { name: "description", content: "Audit history of your account." },
    ],
  }),
  component: ActivityPage,
});

function ActivityPage() {
  const { data = [], isLoading, error } = useQuery(q.activity);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Activity</h1>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {!isLoading && !data.length && (
        <p className="text-sm text-muted-foreground">
          Nothing yet — actions you take will be recorded here.
        </p>
      )}
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {data.map((a) => (
          <li key={a.id} className="flex flex-col gap-0.5 p-3 sm:flex-row sm:items-center sm:gap-3">
            <span className="w-44 shrink-0 font-mono text-[11px] text-muted-foreground">
              {new Date(a.created_at).toLocaleString()}
            </span>
            <span className="w-44 shrink-0 font-mono text-xs text-primary">{a.action}</span>
            <span className="min-w-0 truncate text-sm">{a.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
