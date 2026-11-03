import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { FolderUp, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUploader } from "@/components/useUploader";
import { fmtBytes, q } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/uploads")({
  head: () => ({
    meta: [
      { title: "Uploads · Flux Links" },
      { name: "description", content: "Upload files and folders to your buckets." },
    ],
  }),
  component: Uploads,
});

function Uploads() {
  const { data: buckets = [] } = useQuery(q.buckets);
  const { data: presets = [] } = useQuery(q.presets);
  const { data: history = [], isLoading } = useQuery(q.uploads);
  const { state, upload } = useUploader();
  const [bucketId, setBucketId] = useState("");
  const [prefix, setPrefix] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const bid = bucketId || buckets[0]?.id || "";
  const total = files.reduce((s, f) => s + f.size, 0);
  const historyBytes = history.reduce((s, u) => s + Number(u.size_bytes), 0);

  const go = async () => {
    if (!bid) return void toast.error("Add a bucket first");
    if (!files.length) return void toast.error("Choose files or a folder");
    const p = prefix.trim() ? prefix.trim().replace(/^\/+/, "").replace(/\/?$/, "/") : "";
    const keys = await upload(bid, files, p);
    if (keys.length)
      toast.success(`${keys.length} file(s) uploaded. Matching automation rules ran.`);
    setFiles([]);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Uploads</h1>
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <Select value={bid} onValueChange={setBucketId} disabled={!buckets.length}>
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
            placeholder="Folder prefix (optional)"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
          />
          <Select
            onValueChange={(id) => {
              const p = presets.find((x) => x.id === id);
              if (p) setPrefix(p.key_prefix);
            }}
            disabled={!presets.length}
          >
            <SelectTrigger>
              <SelectValue placeholder={presets.length ? "Apply preset" : "No presets"} />
            </SelectTrigger>
            <SelectContent>
              {presets.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
          <input
            id="dir-pick"
            type="file"
            hidden
            ref={(el) => el?.setAttribute("webkitdirectory", "")}
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Paperclip className="h-3.5 w-3.5" /> Files
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => document.getElementById("dir-pick")?.click()}
          >
            <FolderUp className="h-3.5 w-3.5" /> Folder
          </Button>
          <span className="text-xs text-muted-foreground">
            {files.length} file(s) · {fmtBytes(total)}
          </span>
          <Button size="sm" className="ml-auto" onClick={go} disabled={state.running}>
            {state.running ? "Uploading…" : "Upload"}
          </Button>
        </div>
        {total > 1024 ** 3 && (
          <p className="text-xs text-warning">
            Large upload: over 1 GB will add to your AWS S3 storage bill.
          </p>
        )}
        <Progress
          value={state.totalBytes ? (state.doneBytes / state.totalBytes) * 100 : 0}
          className="h-1.5"
        />
        <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
          <span>
            {fmtBytes(state.doneBytes)} / {fmtBytes(state.totalBytes)}
          </span>
          <span>
            {state.doneFiles}/{state.totalFiles} files
          </span>
        </div>
        {state.errors.map((e) => (
          <p key={e} className="text-xs text-destructive">
            {e}
          </p>
        ))}
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">
          History{" "}
          <span className="font-normal text-muted-foreground">
            · {history.length} files · {fmtBytes(historyBytes)}
          </span>
        </h2>
        {isLoading && <p className="mt-2 text-xs text-muted-foreground">Loading…</p>}
        {!isLoading && !history.length && (
          <p className="mt-2 text-xs text-muted-foreground">No uploads yet.</p>
        )}
        <ul className="mt-2 max-h-96 divide-y divide-border overflow-y-auto">
          {history.map((u) => (
            <li key={u.id} className="flex gap-2 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate font-mono text-xs">
                {buckets.find((b) => b.id === u.bucket_id)?.name}/{u.object_key}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {fmtBytes(Number(u.size_bytes))}
              </span>
              <span className="hidden text-[11px] text-muted-foreground sm:inline">
                {new Date(u.created_at).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
