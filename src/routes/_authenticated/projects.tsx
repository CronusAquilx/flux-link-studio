import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/Confirm";
import { supabase } from "@/integrations/supabase/client";
import { checkProjectUrlFn, createProjectLinkFn } from "@/lib/flux.functions";
import { errMsg, linkUrl, log, q } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({
    meta: [
      { title: "Projects · Flux Links" },
      { name: "description", content: "Share published Lovable apps with Flux links." },
    ],
  }),
  component: Projects,
});

function Projects() {
  const { data: projects = [], isLoading } = useQuery(q.projects);
  const { data: links = [] } = useQuery(q.links);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const check = useServerFn(checkProjectUrlFn);
  const create = useServerFn(createProjectLinkFn);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<"flux_v3" | "flux_mini">("flux_mini");
  const [checkMsg, setCheckMsg] = useState<{ ok: boolean; reason: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["links"] });
  };

  const doCheck = async () => {
    try {
      new URL(url);
    } catch {
      return void toast.error("Enter a full https:// URL");
    }
    setBusy(true);
    try {
      setCheckMsg(await check({ data: { url } }));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const doCreate = async () => {
    if (!name.trim()) return void toast.error("Name the project");
    try {
      new URL(url);
    } catch {
      return void toast.error("Enter a full https:// URL");
    }
    const ok = await confirm({
      risk: "public",
      title: "Create a public share link?",
      body: "Anyone with the Flux link is redirected to this published Lovable app. You can disable it anytime.",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await create({ data: { name: name.trim(), url, kind, confirmed: true } });
      await navigator.clipboard.writeText(linkUrl(r.link)).catch(() => {});
      toast.success("Link created and copied");
      setName("");
      setUrl("");
      setCheckMsg(null);
      refresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const setDisabled = async (pid: string, linkId: string | null, disabled: boolean) => {
    const ok = await confirm(
      disabled
        ? {
            risk: "destructive",
            title: "Disable this share link?",
            body: "Visitors will see a 'link revoked' page.",
            confirmLabel: "Disable",
          }
        : {
            risk: "public",
            title: "Re-enable this share link?",
            body: "Anyone with the link can open the app again.",
          },
    );
    if (!ok) return;
    await supabase.from("projects").update({ disabled }).eq("id", pid);
    if (linkId) await supabase.from("links").update({ revoked: disabled }).eq("id", linkId);
    await log(disabled ? "project.disabled" : "project.enabled", pid);
    refresh();
  };

  const setExpiry = async (linkId: string, v: string) => {
    const { error } = await supabase
      .from("links")
      .update({ expires_at: v ? new Date(v).toISOString() : null })
      .eq("id", linkId);
    if (error) return void toast.error(error.message);
    toast.success("Expiry updated");
    refresh();
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Projects</h1>
        <p className="text-sm text-muted-foreground">
          Paste the URL of a Lovable app that is already published. Flux Links creates a branded
          redirect to it — it does not create or publish Lovable projects.
        </p>
      </div>
      <section className="space-y-2 rounded-lg border border-border bg-card p-4">
        <div className="grid gap-2 sm:grid-cols-[12rem_1fr_9rem]">
          <Input
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />
          <Input
            placeholder="https://your-app.lovable.app"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setCheckMsg(null);
            }}
          />
          <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="flux_v3">Flux V3</SelectItem>
              <SelectItem value="flux_mini">Flux Mini</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {checkMsg && (
          <p className={`text-xs ${checkMsg.ok ? "text-success" : "text-destructive"}`}>
            {checkMsg.reason}
          </p>
        )}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={doCheck} disabled={busy}>
            Check URL
          </Button>
          <Button size="sm" onClick={doCreate} disabled={busy}>
            {busy ? "Working…" : "Create Flux link"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Connecting your Lovable account to pick projects automatically isn't available yet.
        </p>
      </section>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && !projects.length && (
        <p className="text-sm text-muted-foreground">No projects yet.</p>
      )}
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {projects.map((p) => {
          const l = links.find((x) => x.id === p.link_id);
          return (
            <li key={p.id} className="flex flex-col gap-2 p-3 md:flex-row md:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{p.name}</span>
                  {p.disabled ? (
                    <Badge variant="destructive">Disabled</Badge>
                  ) : (
                    <Badge>Active</Badge>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">{p.lovable_url}</p>
                {l && (
                  <p className="truncate font-mono text-xs">
                    {linkUrl(l)} · {l.clicks} click(s)
                  </p>
                )}
              </div>
              {l && (
                <Input
                  type="date"
                  className="h-8 w-36 text-xs"
                  defaultValue={l.expires_at?.slice(0, 10) ?? ""}
                  onBlur={(e) =>
                    e.target.value !== (l.expires_at?.slice(0, 10) ?? "") &&
                    setExpiry(l.id, e.target.value)
                  }
                  aria-label="Expiry date"
                />
              )}
              {l && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    navigator.clipboard.writeText(linkUrl(l)).then(() => toast.success("Copied"))
                  }
                >
                  Copy
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDisabled(p.id, p.link_id, !p.disabled)}
              >
                {p.disabled ? "Enable" : "Disable"}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
