import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useConfirm, type Risk } from "@/components/Confirm";
import { getSetupStatus, planSetupFn, runPlanActionFn } from "@/lib/flux.functions";
import { errMsg, q } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/ai")({
  head: () => ({
    meta: [
      { title: "Flux AI · Flux Links" },
      { name: "description", content: "Your setup assistant." },
    ],
  }),
  component: Ai,
});

type Action = {
  id: string;
  type: string;
  params: Record<string, unknown>;
  reason: string;
  risk: Risk;
  status: string;
  result: string | null;
};
const LABEL: Record<string, string> = {
  verify_connection: "Verify AWS connection",
  discover_buckets: "Discover buckets",
  create_bucket: "Create private bucket",
  enable_browser_uploads: "Enable browser uploads",
  create_rule: "Create automation rule",
};

function Ai() {
  const getStatus = useServerFn(getSetupStatus);
  const status = useQuery({ queryKey: ["setup-status"], queryFn: () => getStatus() });
  const { data: plans = [] } = useQuery(q.plans);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const plan = useServerFn(planSetupFn);
  const run = useServerFn(runPlanActionFn);
  const [prompt, setPrompt] = useState(
    "Set me up: verify my AWS connection, find my buckets, and make new uploads get 7-day Flux Mini links.",
  );
  const [busy, setBusy] = useState<string | null>(null);

  const ask = async () => {
    if (prompt.trim().length < 3) return;
    setBusy("plan");
    try {
      await plan({ data: { prompt: prompt.trim() } });
      qc.invalidateQueries({ queryKey: ["plans"] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const act = async (planId: string, a: Action, decision: "approve" | "reject") => {
    let confirmed = false;
    if (decision === "approve") {
      confirmed = await confirm({
        risk: a.risk,
        title: `${LABEL[a.type] ?? a.type}?`,
        body: (
          <pre className="whitespace-pre-wrap font-mono text-xs">
            {JSON.stringify(a.params, null, 2)}
          </pre>
        ),
        confirmLabel: "Approve & run",
      });
      if (!confirmed) return;
    }
    setBusy(a.id);
    try {
      const r = await run({
        data: { planId, actionId: a.id, decision, confirmed, origin: window.location.origin },
      });
      if (r.status === "failed") toast.error(r.result ?? "Failed");
      else if (r.status === "done") toast.success(r.result ?? "Done");
      qc.invalidateQueries();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Bot className="h-5 w-5 text-primary" /> Flux AI
        </h1>
        <p className="text-sm text-muted-foreground">
          Looks only at your own connections and buckets, proposes steps, and runs a step only after
          you approve it.
        </p>
      </div>
      {status.data && !status.data.aiConfigured ? (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          Flux AI isn't configured on this site yet. Meanwhile, follow the manual guide: Connections
          → download template → create stack in AWS → paste Role ARN → Verify → Storage → Discover →
          Automations.
        </div>
      ) : (
        <section className="space-y-2 rounded-lg border border-border bg-card p-4">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={2000}
            className="min-h-20"
          />
          <Button onClick={ask} disabled={busy === "plan"}>
            {busy === "plan" ? "Planning…" : "Propose a plan"}
          </Button>
        </section>
      )}
      {!plans.length && <p className="text-sm text-muted-foreground">No plans yet.</p>}
      {plans.map((p) => {
        const actions = (p.actions as unknown as Action[]) ?? [];
        return (
          <section key={p.id} className="space-y-2 rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">
              {new Date(p.created_at).toLocaleString()} · “{p.prompt}”
            </p>
            <p className="whitespace-pre-wrap text-sm">{p.summary}</p>
            {!actions.length && (
              <p className="text-xs text-muted-foreground">No runnable steps proposed.</p>
            )}
            <ul className="divide-y divide-border">
              {actions.map((a) => (
                <li key={a.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      {LABEL[a.type] ?? a.type}
                      <Badge variant={a.risk === "safe" ? "secondary" : "outline"}>{a.risk}</Badge>
                      <Badge
                        variant={
                          a.status === "done"
                            ? "default"
                            : a.status === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {a.status}
                      </Badge>
                    </div>
                    {a.reason && <p className="text-xs text-muted-foreground">{a.reason}</p>}
                    {a.result && <p className="text-xs">{a.result}</p>}
                  </div>
                  {(a.status === "pending" || a.status === "failed") && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={busy === a.id}
                        onClick={() => act(p.id, a, "approve")}
                      >
                        {busy === a.id ? "Running…" : "Approve"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === a.id}
                        onClick={() => act(p.id, a, "reject")}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
