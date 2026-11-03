import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/Confirm";
import { supabase } from "@/integrations/supabase/client";
import { createRuleFn } from "@/lib/flux.functions";
import { errMsg, log, q } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/automations")({
  head: () => ({
    meta: [
      { title: "Automations · Flux Links" },
      { name: "description", content: "Rules and presets for uploads and links." },
    ],
  }),
  component: Automations,
});

type Kind = "flux_v3" | "flux_mini";
const days = (s: string) => (s ? Number(s) : null);

function Automations() {
  const { data: rules = [], isLoading } = useQuery(q.rules);
  const { data: presets = [] } = useQuery(q.presets);
  const { data: buckets = [] } = useQuery(q.buckets);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const createRule = useServerFn(createRuleFn);
  const [r, setR] = useState({
    name: "Upload complete → links",
    bucketId: "",
    prefix: "",
    kind: "flux_mini" as Kind,
    days: "",
  });
  const [p, setP] = useState({ name: "", prefix: "", kind: "flux_mini" as Kind, days: "" });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["rules"] });
    qc.invalidateQueries({ queryKey: ["presets"] });
  };

  const addRule = async () => {
    const bucketId = r.bucketId || buckets[0]?.id;
    if (!bucketId) return void toast.error("Add a bucket first");
    if (!r.name.trim()) return void toast.error("Give the rule a name");
    const ok = await confirm({
      risk: "public",
      title: "Create automation rule?",
      body: "Every completed upload matching this rule automatically gets a shareable link. Anyone with the link can download the file.",
    });
    if (!ok) return;
    try {
      await createRule({
        data: {
          name: r.name.trim(),
          bucketId,
          prefix: r.prefix,
          linkKind: r.kind,
          expiresDays: days(r.days),
          confirmed: true,
        },
      });
      toast.success("Rule created");
      refresh();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const toggle = async (id: string, enabled: boolean) => {
    if (
      enabled &&
      !(await confirm({
        risk: "public",
        title: "Enable rule?",
        body: "Matching uploads will get public share links automatically.",
      }))
    )
      return;
    const { error } = await supabase.from("automation_rules").update({ enabled }).eq("id", id);
    if (error) return void toast.error(error.message);
    await log(enabled ? "rule.enabled" : "rule.disabled", id);
    refresh();
  };

  const del = async (table: "automation_rules" | "presets", id: string, name: string) => {
    if (
      !(await confirm({
        risk: "destructive",
        title: `Delete "${name}"?`,
        body: "Links already created are not affected.",
        confirmLabel: "Delete",
      }))
    )
      return;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return void toast.error(error.message);
    await log(table === "presets" ? "preset.deleted" : "rule.deleted", name);
    refresh();
  };

  const addPreset = async () => {
    if (!p.name.trim()) return void toast.error("Preset needs a name");
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("presets").insert({
      user_id: u.user!.id,
      name: p.name.trim(),
      key_prefix: p.prefix,
      link_kind: p.kind,
      expires_days: days(p.days),
    });
    if (error) return void toast.error(error.message);
    setP({ name: "", prefix: "", kind: "flux_mini", days: "" });
    refresh();
  };

  const KindSel = ({ v, on }: { v: Kind; on: (k: Kind) => void }) => (
    <Select value={v} onValueChange={(x) => on(x as Kind)}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="flux_v3">Flux V3</SelectItem>
        <SelectItem value="flux_mini">Flux Mini</SelectItem>
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Automations</h1>
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Trigger: upload complete → generate link</h2>
        <div className="grid gap-2 sm:grid-cols-5">
          <Input
            value={r.name}
            onChange={(e) => setR({ ...r, name: e.target.value })}
            placeholder="Rule name"
          />
          <Select
            value={r.bucketId || buckets[0]?.id || ""}
            onValueChange={(v) => setR({ ...r, bucketId: v })}
            disabled={!buckets.length}
          >
            <SelectTrigger>
              <SelectValue placeholder="No buckets" />
            </SelectTrigger>
            <SelectContent>
              {buckets.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={r.prefix}
            onChange={(e) => setR({ ...r, prefix: e.target.value })}
            placeholder="Key prefix (blank = all)"
          />
          <KindSel v={r.kind} on={(k) => setR({ ...r, kind: k })} />
          <Input
            value={r.days}
            onChange={(e) => setR({ ...r, days: e.target.value.replace(/\D/g, "") })}
            placeholder="Expire days (blank = never)"
          />
        </div>
        <Button size="sm" onClick={addRule}>
          Add rule
        </Button>
        {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
        {!isLoading && !rules.length && (
          <p className="text-xs text-muted-foreground">No rules yet.</p>
        )}
        <ul className="divide-y divide-border">
          {rules.map((x) => (
            <li key={x.id} className="flex items-center gap-3 py-2 text-sm">
              <Switch checked={x.enabled} onCheckedChange={(v) => toggle(x.id, v)} />
              <div className="min-w-0 flex-1">
                <p className="truncate">{x.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {buckets.find((b) => b.id === x.bucket_id)?.name}/{x.prefix || "*"} ·{" "}
                  {x.link_kind === "flux_v3" ? "Flux V3" : "Flux Mini"} ·{" "}
                  {x.expires_days ? `${x.expires_days}d` : "no expiry"}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => del("automation_rules", x.id, x.name)}
                aria-label="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Saved upload / link presets</h2>
        <div className="grid gap-2 sm:grid-cols-4">
          <Input
            value={p.name}
            onChange={(e) => setP({ ...p, name: e.target.value })}
            placeholder="Preset name"
          />
          <Input
            value={p.prefix}
            onChange={(e) => setP({ ...p, prefix: e.target.value })}
            placeholder="Folder prefix"
          />
          <KindSel v={p.kind} on={(k) => setP({ ...p, kind: k })} />
          <Input
            value={p.days}
            onChange={(e) => setP({ ...p, days: e.target.value.replace(/\D/g, "") })}
            placeholder="Expire days"
          />
        </div>
        <Button size="sm" variant="secondary" onClick={addPreset}>
          Save preset
        </Button>
        <ul className="divide-y divide-border">
          {presets.map((x) => (
            <li key={x.id} className="flex items-center gap-2 py-2 text-sm">
              <span className="flex-1 truncate">
                {x.name}{" "}
                <span className="text-xs text-muted-foreground">
                  · {x.key_prefix || "/"} · {x.link_kind === "flux_v3" ? "V3" : "Mini"} ·{" "}
                  {x.expires_days ? `${x.expires_days}d` : "∞"}
                </span>
              </span>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => del("presets", x.id, x.name)}
                aria-label="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
