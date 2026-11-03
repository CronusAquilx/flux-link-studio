import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { Folder, FileIcon, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConfirm } from "@/components/Confirm";
import {
  createLinksFn,
  discoverBucketsFn,
  enableBrowserUploadsFn,
  listObjectsFn,
  provisionBucketFn,
} from "@/lib/flux.functions";
import { errMsg, fmtBytes, linkUrl, q } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/buckets")({
  validateSearch: z.object({ b: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Storage · Flux Links" },
      { name: "description", content: "Browse and manage your S3 buckets." },
    ],
  }),
  component: Buckets,
});

const REGIONS = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "ca-central-1",
  "eu-west-1",
  "eu-west-2",
  "eu-central-1",
  "eu-north-1",
  "ap-south-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "sa-east-1",
] as const;
type Region = (typeof REGIONS)[number];

function Buckets() {
  const { b } = Route.useSearch();
  const navigate = useNavigate({ from: "/buckets" });
  const { data: buckets = [], isLoading } = useQuery(q.buckets);
  const { data: conns = [] } = useQuery(q.connections);
  const verified = conns.filter((c) => c.status === "verified");
  const qc = useQueryClient();
  const confirm = useConfirm();
  const discover = useServerFn(discoverBucketsFn);
  const provision = useServerFn(provisionBucketFn);
  const enableUploads = useServerFn(enableBrowserUploadsFn);
  const listObjects = useServerFn(listObjectsFn);
  const createLinks = useServerFn(createLinksFn);

  const selected = buckets.find((x) => x.id === b) ?? null;
  const [prefix, setPrefix] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<"flux_v3" | "flux_mini">("flux_mini");
  const [days, setDays] = useState("7");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [nb, setNb] = useState({ name: "", region: "us-east-1" as Region, conn: "", cors: true });

  const objects = useQuery({
    queryKey: ["objects", selected?.id, prefix],
    queryFn: () => listObjects({ data: { bucketId: selected!.id, prefix } }),
    enabled: !!selected,
    retry: false,
  });

  const { folders, files } = useMemo(() => {
    const fo = new Set<string>();
    const fi: { key: string; size: number; lastModified: string | null }[] = [];
    for (const o of objects.data ?? []) {
      const rest = o.key.slice(prefix.length);
      const i = rest.indexOf("/");
      if (i >= 0) fo.add(prefix + rest.slice(0, i + 1));
      else if (rest) fi.push(o);
    }
    return { folders: [...fo].sort(), files: fi };
  }, [objects.data, prefix]);

  const select = (id: string) => {
    setPrefix("");
    setPicked(new Set());
    setOut("");
    navigate({ search: { b: id } });
  };

  const doDiscover = async () => {
    setBusy(true);
    try {
      let n = 0;
      for (const c of verified) n += (await discover({ data: { connectionId: c.id } })).count;
      toast.success(`Found ${n} bucket(s)`);
      qc.invalidateQueries({ queryKey: ["buckets"] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const doCreate = async () => {
    const name = nb.name.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(name) || name.includes(".."))
      return void toast.error("Bucket names: 3–63 lowercase letters, numbers, dots or dashes");
    const connectionId = nb.conn || verified[0]?.id;
    if (!connectionId) return void toast.error("Verify an AWS connection first");
    const ok = await confirm({
      risk: "billable",
      title: `Create bucket "${name}" in ${nb.region}?`,
      body: (
        <ul className="list-disc space-y-1 pl-4">
          <li>Created in your AWS account; S3 storage and requests are billed to you by AWS.</li>
          <li>Private: all public access blocked, default AES-256 encryption, ACLs disabled.</li>
          {nb.cors && <li>Allows browser uploads (PUT only) from {window.location.origin}.</li>}
        </ul>
      ),
      confirmLabel: "Create bucket",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const row = await provision({
        data: {
          connectionId,
          name,
          region: nb.region,
          confirmed: true,
          ...(nb.cors ? { origin: window.location.origin } : {}),
        },
      });
      toast.success("Private bucket created");
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["buckets"] });
      select(row.id);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const doCors = async () => {
    if (!selected) return;
    const ok = await confirm({
      risk: "permission",
      title: "Enable browser uploads?",
      body: `Sets this bucket's CORS rule to allow PUT uploads from ${window.location.origin}. It does not make anything public. This replaces any existing CORS rules on the bucket.`,
    });
    if (!ok) return;
    try {
      await enableUploads({
        data: { bucketId: selected.id, origin: window.location.origin, confirmed: true },
      });
      toast.success("Browser uploads enabled");
      qc.invalidateQueries({ queryKey: ["buckets"] });
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const doLinks = async () => {
    if (!selected || !picked.size) return;
    const d = days ? Number(days) : null;
    if (d !== null && (!Number.isInteger(d) || d < 1 || d > 3650))
      return void toast.error("Expiry must be 1–3650 days, or empty for none");
    const ok = await confirm({
      risk: "public",
      title: `Create ${picked.size} link(s)?`,
      body: `Anyone with a link can download that file${d ? ` for ${d} day(s)` : " until you revoke it"}.`,
    });
    if (!ok) return;
    try {
      const made = await createLinks({
        data: { bucketId: selected.id, keys: [...picked], kind, expiresDays: d, confirmed: true },
      });
      setOut(made.map(linkUrl).join("\n"));
      setPicked(new Set());
      qc.invalidateQueries({ queryKey: ["links"] });
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const toggle = (k: string) =>
    setPicked((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold">Storage</h1>
        <Button
          size="sm"
          variant="outline"
          onClick={doDiscover}
          disabled={busy || !verified.length}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Discover
        </Button>
        <Button size="sm" onClick={() => setOpen(true)} disabled={!verified.length}>
          <Plus className="h-3.5 w-3.5" /> New bucket
        </Button>
      </div>
      {!verified.length && (
        <p className="text-sm text-muted-foreground">
          Verify an AWS connection on the Connections page to discover or create buckets.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {isLoading && <li className="p-3 text-xs text-muted-foreground">Loading…</li>}
          {!isLoading && !buckets.length && (
            <li className="p-3 text-xs text-muted-foreground">No buckets yet.</li>
          )}
          {buckets.map((x) => (
            <li key={x.id}>
              <button
                onClick={() => select(x.id)}
                className={`w-full p-3 text-left hover:bg-accent ${x.id === b ? "bg-accent" : ""}`}
              >
                <p className="truncate font-mono text-sm">{x.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {x.region}
                  {x.provisioned_by_flux ? " · created here" : ""}
                </p>
              </button>
            </li>
          ))}
        </ul>

        <section className="min-w-0 rounded-lg border border-border bg-card p-4">
          {!selected ? (
            <p className="text-sm text-muted-foreground">Select a bucket to browse its files.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-mono text-sm font-semibold">{selected.name}</h2>
                <Badge variant="secondary">{selected.region}</Badge>
                {selected.browser_uploads ? (
                  <Badge>Browser uploads on</Badge>
                ) : (
                  <Button size="sm" variant="outline" onClick={doCors}>
                    Enable browser uploads
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1 font-mono text-xs">
                <button onClick={() => setPrefix("")} className="text-primary hover:underline">
                  /
                </button>
                {prefix
                  .split("/")
                  .filter(Boolean)
                  .map((seg, i, arr) => (
                    <button
                      key={i}
                      onClick={() => setPrefix(arr.slice(0, i + 1).join("/") + "/")}
                      className="text-primary hover:underline"
                    >
                      {seg}/
                    </button>
                  ))}
              </div>
              {objects.isLoading && <p className="text-xs text-muted-foreground">Loading files…</p>}
              {objects.error && (
                <p className="rounded bg-destructive/10 p-2 text-xs text-destructive">
                  {errMsg(objects.error)}
                </p>
              )}
              {objects.data && !folders.length && !files.length && (
                <p className="text-xs text-muted-foreground">Empty.</p>
              )}
              <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                {folders.map((f) => (
                  <li key={f}>
                    <button
                      onClick={() => setPrefix(f)}
                      className="flex w-full items-center gap-2 py-1.5 text-sm hover:text-primary"
                    >
                      <Folder className="h-4 w-4" />
                      {f.slice(prefix.length)}
                    </button>
                  </li>
                ))}
                {files.map((f) => (
                  <li key={f.key} className="flex items-center gap-2 py-1.5 text-sm">
                    <Checkbox checked={picked.has(f.key)} onCheckedChange={() => toggle(f.key)} />
                    <FileIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{f.key.slice(prefix.length)}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {fmtBytes(f.size)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPicked(new Set(files.map((f) => f.key)))}
                  disabled={!files.length}
                >
                  Select all
                </Button>
                <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                  <SelectTrigger className="h-8 w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flux_v3">Flux V3</SelectItem>
                    <SelectItem value="flux_mini">Flux Mini</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1 text-xs">
                  <Input
                    className="h-8 w-16"
                    value={days}
                    onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))}
                    placeholder="∞"
                  />{" "}
                  days
                </div>
                <Button size="sm" onClick={doLinks} disabled={!picked.size}>
                  Generate {picked.size || ""} link(s)
                </Button>
              </div>
              {out && (
                <div className="space-y-2">
                  <Textarea readOnly value={out} className="min-h-28 font-mono text-xs" />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      navigator.clipboard.writeText(out).then(() => toast.success("Copied"))
                    }
                  >
                    Copy all
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New private bucket</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                value={nb.name}
                onChange={(e) => setNb({ ...nb, name: e.target.value })}
                placeholder="flux-myteam-files-2026"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Region</Label>
                <Select
                  value={nb.region}
                  onValueChange={(v) => setNb({ ...nb, region: v as Region })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REGIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Connection</Label>
                <Select
                  value={nb.conn || verified[0]?.id || ""}
                  onValueChange={(v) => setNb({ ...nb, conn: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {verified.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={nb.cors}
                onCheckedChange={(v) => setNb({ ...nb, cors: v === true })}
              />{" "}
              Allow uploads from this website
            </label>
            <p className="text-xs text-muted-foreground">
              Public access is always blocked and encryption is on. Costs are billed by AWS to your
              account.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={doCreate} disabled={busy}>
              {busy ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
