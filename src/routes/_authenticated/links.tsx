import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/Confirm";
import { supabase } from "@/integrations/supabase/client";
import { download, linkUrl, log, q } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/links")({
  head: () => ({
    meta: [
      { title: "Links · Flux Links" },
      { name: "description", content: "Your Flux link history." },
    ],
  }),
  component: Links,
});

function Links() {
  const { data: links = [], isLoading } = useQuery(q.links);
  const { data: buckets = [] } = useQuery(q.buckets);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "off">("all");
  const now = Date.now();
  const rows = useMemo(
    () =>
      links.filter((l) => {
        const off = l.revoked || (!!l.expires_at && new Date(l.expires_at).getTime() < now);
        if (status === "active" && off) return false;
        if (status === "off" && !off) return false;
        const f = filter.toLowerCase();
        return (
          !f ||
          (l.object_key ?? l.target_url ?? "").toLowerCase().includes(f) ||
          l.slug.toLowerCase().includes(f)
        );
      }),
    [links, filter, status, now],
  );

  const setRevoked = async (id: string, revoked: boolean) => {
    const ok = await confirm(
      revoked
        ? {
            risk: "destructive",
            title: "Revoke this link?",
            body: "It stops working immediately for everyone.",
            confirmLabel: "Revoke",
          }
        : {
            risk: "public",
            title: "Re-enable this link?",
            body: "Anyone with the link can use it again.",
          },
    );
    if (!ok) return;
    const { error } = await supabase.from("links").update({ revoked }).eq("id", id);
    if (error) return void toast.error(error.message);
    await log(revoked ? "link.revoked" : "link.enabled", id);
    qc.invalidateQueries({ queryKey: ["links"] });
  };

  const setExpiry = async (id: string, v: string) => {
    const { error } = await supabase
      .from("links")
      .update({ expires_at: v ? new Date(v).toISOString() : null })
      .eq("id", id);
    if (error) return void toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["links"] });
    toast.success("Expiry updated");
  };

  const exportCsv = () => {
    const head = "url,kind,source,target,clicks,expires_at,revoked,created_at";
    const body = rows.map((l) =>
      [
        linkUrl(l),
        l.kind,
        l.source,
        JSON.stringify(l.object_key ?? l.target_url ?? ""),
        l.clicks,
        l.expires_at ?? "",
        l.revoked,
        l.created_at,
      ].join(","),
    );
    download("flux-links.csv", [head, ...body].join("\n"), "text/csv");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold">Links</h1>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            navigator.clipboard
              .writeText(rows.map(linkUrl).join("\n"))
              .then(() => toast.success("Copied"))
          }
          disabled={!rows.length}
        >
          <Copy className="h-3.5 w-3.5" /> Copy all
        </Button>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={!rows.length}>
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          placeholder="Search file, URL or slug"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {(["all", "active", "off"] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={status === s ? "secondary" : "ghost"}
            onClick={() => setStatus(s)}
          >
            {s === "off" ? "Revoked/expired" : s[0]!.toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && !rows.length && <p className="text-sm text-muted-foreground">No links.</p>}
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {rows.map((l) => {
          const expired = !!l.expires_at && new Date(l.expires_at).getTime() < now;
          return (
            <li key={l.id} className="flex flex-col gap-2 p-3 md:flex-row md:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{l.kind === "flux_v3" ? "V3" : "Mini"}</Badge>
                  {l.revoked ? (
                    <Badge variant="destructive">Revoked</Badge>
                  ) : expired ? (
                    <Badge variant="destructive">Expired</Badge>
                  ) : (
                    <Badge>Active</Badge>
                  )}
                  <span className="truncate font-mono text-xs">{linkUrl(l)}</span>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {l.source === "s3"
                    ? `${buckets.find((b) => b.id === l.bucket_id)?.name ?? "?"}/${l.object_key}`
                    : l.target_url}{" "}
                  · {l.clicks} click(s)
                </p>
              </div>
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
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  navigator.clipboard.writeText(linkUrl(l)).then(() => toast.success("Copied"))
                }
              >
                Copy
              </Button>
              <Button
                size="sm"
                variant={l.revoked ? "secondary" : "outline"}
                onClick={() => setRevoked(l.id, !l.revoked)}
              >
                {l.revoked ? "Enable" : "Revoke"}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
