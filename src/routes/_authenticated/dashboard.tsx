import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Copy, FolderUp, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/Confirm";
import { useUploader } from "@/components/useUploader";
import { createLinksFn, listObjectsFn } from "@/lib/flux.functions";
import { errMsg, fmtBytes, linkUrl, q } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · Flux Links" },
      { name: "description", content: "Make Flux links from your S3 buckets." },
    ],
  }),
  component: Dashboard,
});

type Kind = "flux_v3" | "flux_mini";

function Dashboard() {
  const { data: buckets = [], isLoading: bLoading } = useQuery(q.buckets);
  const { data: conns = [] } = useQuery(q.connections);
  const { data: links = [] } = useQuery(q.links);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const createLinks = useServerFn(createLinksFn);
  const listObjects = useServerFn(listObjectsFn);
  const { state: up, upload } = useUploader();

  const [kind, setKind] = useState<Kind>("flux_v3");
  const [name, setName] = useState("");
  const [bucketId, setBucketId] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const [panelBucket, setPanelBucket] = useState<string>("");
  const [fresh, setFresh] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);

  const activeBucket = bucketId || buckets[0]?.id || "";
  const shownBucket = panelBucket || activeBucket;
  const shownBucketName = buckets.find((b) => b.id === shownBucket)?.name;
  const verified = conns.some((c) => c.status === "verified");

  const panelText = useMemo(() => {
    if (fresh) return fresh.join("\n");
    return links
      .filter((l) => l.bucket_id === shownBucket && !l.revoked)
      .map(linkUrl)
      .join("\n");
  }, [fresh, links, shownBucket]);

  const makeLink = async () => {
    if (!activeBucket) return void toast.error("Connect AWS and add a bucket first");
    if (!files.length) return void toast.error("Choose files or a folder to upload");
    const prefix = name.trim()
      ? `${name
          .trim()
          .replace(/[^\w.\- /]/g, "")
          .replace(/\/+$/, "")}/`
      : "";
    const ok = await confirm({
      risk: "public",
      title: `Upload ${files.length} file(s) and create links?`,
      body: "Anyone who has a Flux link can download that file until you revoke it. Storage and requests are billed by AWS to your account.",
      confirmLabel: "Upload & make links",
    });
    if (!ok) return;
    const keys = await upload(activeBucket, files, prefix);
    if (!keys.length) return void toast.error("No files uploaded");
    try {
      const made = await createLinks({
        data: { bucketId: activeBucket, keys, kind, confirmed: true },
      });
      setPanelBucket(activeBucket);
      setFresh(made.map(linkUrl));
      setFiles([]);
      qc.invalidateQueries({ queryKey: ["links"] });
      toast.success(`${made.length} link(s) ready`);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const generateFor = async (id: string) => {
    setBusy(id);
    try {
      const objs = (await listObjects({ data: { bucketId: id, prefix: "" } })).filter(
        (o) => !o.key.endsWith("/"),
      );
      if (!objs.length) return void toast.info("This bucket has no files yet");
      const ok = await confirm({
        risk: "public",
        title: `Create ${objs.length} ${kind === "flux_v3" ? "Flux V3" : "Flux Mini"} link(s)?`,
        body: "One link per file in this bucket (first 200). Anyone with a link can download that file until you revoke it.",
      });
      if (!ok) return;
      const made = await createLinks({
        data: { bucketId: id, keys: objs.map((o) => o.key), kind, confirmed: true },
      });
      setPanelBucket(id);
      setFresh(made.map(linkUrl));
      qc.invalidateQueries({ queryKey: ["links"] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const copyAll = async () => {
    if (!panelText) return;
    await navigator.clipboard.writeText(panelText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const pct = up.totalBytes ? Math.round((up.doneBytes / up.totalBytes) * 100) : 0;
  const pickedBytes = files.reduce((s, f) => s + f.size, 0);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Flux Links</h1>

      {!verified && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <b>Finish setup:</b> connect your AWS account so Flux Links can reach your buckets.{" "}
          <Link to="/connections" className="text-primary underline-offset-2 hover:underline">
            Open Connections →
          </Link>{" "}
          or{" "}
          <Link to="/ai" className="text-primary underline-offset-2 hover:underline">
            ask Flux AI
          </Link>
          .
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">New Flux link</h2>
          <div className="mt-3 inline-flex rounded-md border border-border p-0.5">
            {(["flux_v3", "flux_mini"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={cn(
                  "rounded px-3 py-1 text-xs font-medium text-muted-foreground",
                  kind === k && "bg-primary text-primary-foreground",
                )}
              >
                {k === "flux_v3" ? "Flux V3" : "Flux Mini"}
              </button>
            ))}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_11rem]">
            <Input
              placeholder="Name (folder for these files)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
            />
            <Select value={activeBucket} onValueChange={setBucketId} disabled={!buckets.length}>
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
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            <input
              ref={(el) => {
                dirRef.current = el;
                el?.setAttribute("webkitdirectory", "");
              }}
              type="file"
              hidden
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Paperclip className="h-3.5 w-3.5" /> Files
            </Button>
            <Button variant="outline" size="sm" onClick={() => dirRef.current?.click()}>
              <FolderUp className="h-3.5 w-3.5" /> Folder
            </Button>
            <span className="text-xs text-muted-foreground">
              {files.length
                ? `${files.length} file(s) · ${fmtBytes(pickedBytes)}`
                : "Nothing selected"}
            </span>
            <Button size="sm" className="ml-auto" onClick={makeLink} disabled={up.running}>
              {up.running ? "Uploading…" : "Make link"}
            </Button>
          </div>
          <div className="mt-3 space-y-1">
            <Progress value={pct} className="h-1.5" />
            <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
              <span>
                {fmtBytes(up.doneBytes)} / {fmtBytes(up.totalBytes)}
              </span>
              <span>
                {up.doneFiles}/{up.totalFiles} files
              </span>
            </div>
            {up.errors.map((e) => (
              <p key={e} className="text-xs text-destructive">
                {e}
              </p>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Your S3 buckets</h2>
            <Link to="/buckets" className="text-xs text-muted-foreground hover:text-foreground">
              Manage
            </Link>
          </div>
          <ul className="mt-3 max-h-56 divide-y divide-border overflow-y-auto">
            {bLoading && <li className="py-2 text-xs text-muted-foreground">Loading…</li>}
            {!bLoading && !buckets.length && (
              <li className="py-2 text-xs text-muted-foreground">
                No buckets yet. Discover or create them on the Storage page after connecting AWS.
              </li>
            )}
            {buckets.map((b) => (
              <li key={b.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm">{b.name}</p>
                  <p className="text-[11px] text-muted-foreground">{b.region}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => navigate({ to: "/buckets", search: { b: b.id } })}
                >
                  Open
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy === b.id}
                  onClick={() => generateFor(b.id)}
                >
                  {busy === b.id ? "…" : "Generate links"}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-sm font-semibold">Links for {shownBucketName ?? "—"}</h2>
          <Button size="sm" variant="outline" onClick={copyAll} disabled={!panelText}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy all
          </Button>
        </div>
        <Textarea
          readOnly
          value={panelText}
          placeholder="Generated links will appear here."
          className="mt-3 min-h-40 font-mono text-xs"
        />
      </section>
    </div>
  );
}
