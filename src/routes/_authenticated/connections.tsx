import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, ExternalLink, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfirm } from "@/components/Confirm";
import { createConnectionFn, discoverBucketsFn, getSetupStatus, verifyConnectionFn } from "@/lib/flux.functions";
import { download, errMsg, log, q } from "@/lib/data";
import { cloudFormationTemplate } from "@/lib/cfn";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/connections")({
  head: () => ({ meta: [{ title: "Connections · Flux Links" }, { name: "description", content: "Connect your AWS account with a least-privilege role." }] }),
  component: Connections,
});

const REGIONS = ["us-east-1", "us-east-2", "us-west-1", "us-west-2", "ca-central-1", "eu-west-1", "eu-west-2", "eu-central-1", "eu-north-1", "ap-south-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "sa-east-1"] as const;
type Region = (typeof REGIONS)[number];

function Connections() {
  const getStatus = useServerFn(getSetupStatus);
  const status = useQuery({ queryKey: ["setup-status"], queryFn: () => getStatus() });
  const { data: conns = [], isLoading } = useQuery(q.connections);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const create = useServerFn(createConnectionFn);
  const verify = useServerFn(verifyConnectionFn);
  const discover = useServerFn(discoverBucketsFn);
  const [label, setLabel] = useState("My AWS account");
  const [region, setRegion] = useState<Region>("us-east-1");
  const [arns, setArns] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["connections"] });
  const acct = status.data?.platformAccountId;

  const start = async () => {
    setBusy("new");
    try {
      await create({ data: { label: label.trim() || "AWS account", region, roleArn: "" } });
      await log("connection.started", label);
      refresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const saveArn = async (id: string) => {
    const arn = (arns[id] ?? "").trim();
    if (!/^arn:aws:iam::\d{12}:role\/[\w+=,.@/-]+$/.test(arn)) return toast.error("That doesn't look like a role ARN");
    const { error } = await supabase.from("aws_connections").update({ role_arn: arn }).eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
    toast.success("Role ARN saved — now verify");
  };

  const run = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(id);
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
      refresh();
      qc.invalidateQueries({ queryKey: ["buckets"] });
    }
  };

  const remove = async (id: string, name: string) => {
    const ok = await confirm({ risk: "destructive", title: `Remove "${name}"?`, body: "Flux Links forgets this connection and its buckets and links stop working. Nothing in your AWS account is deleted — remove the IAM role there yourself if you want.", confirmLabel: "Remove" });
    if (!ok) return;
    const { error } = await supabase.from("aws_connections").delete().eq("id", id);
    if (error) return toast.error(error.message);
    await log("connection.removed", name);
    refresh();
    qc.invalidateQueries({ queryKey: ["buckets"] });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Connections</h1>
        <p className="text-sm text-muted-foreground">Connect your own AWS account. You create a scoped IAM role in your account; we never ask for root or access keys.</p>
      </div>

      {status.isLoading ? (
        <p className="text-sm text-muted-foreground">Checking site configuration…</p>
      ) : !status.data?.awsConfigured || status.data.platformError ? (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <b>AWS connections are not available yet.</b> The site owner still needs to configure the platform's AWS identity on the server.
          {status.data?.platformError && <p className="mt-1 font-mono text-xs text-muted-foreground">{status.data.platformError}</p>}
          <p className="mt-1 text-muted-foreground">You can still start a connection below, but the setup template needs the platform account ID, and verification won't work until this is fixed.</p>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 text-sm">
          <ShieldCheck className="h-4 w-4 text-success" /> Flux Links platform AWS account: <span className="font-mono">{acct}</span>
        </div>
      )}

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Start a new connection</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} aria-label="Label" />
          <Select value={region} onValueChange={(v) => setRegion(v as Region)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{REGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={start} disabled={busy === "new"}>{busy === "new" ? "Creating…" : "Start"}</Button>
        </div>
      </section>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && !conns.length && <p className="text-sm text-muted-foreground">No connections yet.</p>}

      {conns.map((c) => (
        <section key={c.id} className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{c.label}</h3>
            <Badge variant={c.status === "verified" ? "default" : c.status === "error" ? "destructive" : "secondary"}>
              {c.status === "verified" ? `Verified · ${c.aws_account_id}` : c.status === "error" ? "Verification failed" : "Not verified"}
            </Badge>
            <span className="text-xs text-muted-foreground">{c.region}</span>
            <Button size="icon" variant="ghost" className="ml-auto" onClick={() => remove(c.id, c.label)} aria-label="Remove"><Trash2 className="h-4 w-4" /></Button>
          </div>
          {c.last_error && c.status === "error" && <p className="rounded bg-destructive/10 p-2 font-mono text-xs text-destructive">{c.last_error}</p>}

          <ol className="list-decimal space-y-3 pl-5 text-sm">
            <li>
              Your unique External ID: <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{c.external_id}</code>
              <span className="block text-xs text-muted-foreground">Keep it private — it stops anyone else from using your role through Flux Links.</span>
            </li>
            <li>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={!acct} onClick={() => download("flux-links-role.yaml", cloudFormationTemplate(acct!, c.external_id), "text/yaml")}>
                  <Download className="h-3.5 w-3.5" /> Download CloudFormation template
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={`https://console.aws.amazon.com/cloudformation/home?region=${c.region}#/stacks/create`} target="_blank" rel="noreferrer">
                    Open AWS CloudFormation <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </div>
              <span className="mt-1 block text-xs text-muted-foreground">
                In AWS: Create stack → Upload a template file → choose the downloaded file → Next → (optionally limit BucketPattern, e.g. <code>flux-*</code>) → tick "I acknowledge that AWS CloudFormation might create IAM resources" → Submit. This is the one-time authorization of Flux Links in your account.
              </span>
            </li>
            <li>
              When the stack finishes, copy <b>RoleArn</b> from its Outputs tab:
              <div className="mt-1 flex gap-2">
                <Input className="font-mono text-xs" placeholder="arn:aws:iam::123456789012:role/FluxLinksAccess" value={arns[c.id] ?? c.role_arn} onChange={(e) => setArns({ ...arns, [c.id]: e.target.value })} />
                <Button size="sm" variant="secondary" onClick={() => saveArn(c.id)}>Save</Button>
              </div>
            </li>
            <li className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!c.role_arn || busy === c.id} onClick={() => run(c.id, () => verify({ data: { id: c.id } }), "Connection verified")}>
                {busy === c.id ? "Working…" : "Verify connection"}
              </Button>
              <Button size="sm" variant="outline" disabled={c.status !== "verified" || busy === c.id} onClick={() => run(c.id, () => discover({ data: { connectionId: c.id } }), "Buckets discovered")}>
                Discover buckets
              </Button>
            </li>
          </ol>
        </section>
      ))}
    </div>
  );
}
