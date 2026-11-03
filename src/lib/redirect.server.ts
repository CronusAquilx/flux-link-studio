import { assumeRole, presign } from "./aws.server";

function page(status: number, title: string, msg: string) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title} · Flux Links</title><meta name="robots" content="noindex"><style>body{background:#0b0d12;color:#e6e8ee;font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0}div{text-align:center;max-width:28rem;padding:2rem}h1{color:#7cf5c8;font-size:1.25rem}p{color:#8b93a7}</style></head><body><div><h1>${title}</h1><p>${msg}</p></div></body></html>`,
    {
      status,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    },
  );
}

/** Signed URLs live 60s–1h: rows are owner-writable and STS session credentials expire after 1h anyway. */
export function clampSignSeconds(n: number) {
  return Math.min(3600, Math.max(60, Number.isFinite(n) ? Math.floor(n) : 300));
}

/** Resolve a Flux link. Privileged lookup by unguessable slug only; never returns row data. */
export async function resolveLink(
  slug: string,
  kind: "flux_v3" | "flux_mini",
  headers?: Headers,
) {
  try {
    const { enforceRateLimit, clientIp } = await import("./ratelimit.server");
    await enforceRateLimit("redirect", { ip: clientIp(headers) });
  } catch {
    return page(429, "Slow down", "Too many requests from your network. Try again in a minute.");
  }
  if (!/^[A-Za-z0-9]{5,32}$/.test(slug))
    return page(404, "Link not found", "This Flux link doesn't exist.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: link } = await supabaseAdmin
    .from("links")
    .select("*")
    .eq("slug", slug)
    .eq("kind", kind)
    .maybeSingle();
  if (!link) return page(404, "Link not found", "This Flux link doesn't exist.");
  if (link.revoked) return page(410, "Link revoked", "The owner has turned this link off.");
  if (link.expires_at && new Date(link.expires_at) < new Date())
    return page(410, "Link expired", "This link has expired.");

  let target: string;
  if (link.source === "project") {
    if (!link.target_url) return page(404, "Link not found", "No destination.");
    // Links rows are user-writable, so re-validate here: only published https *.lovable.app destinations (no open redirect).
    let u: URL;
    try {
      u = new URL(link.target_url);
    } catch {
      return page(404, "Link not found", "Invalid destination.");
    }
    if (
      u.protocol !== "https:" ||
      !(u.hostname === "lovable.app" || u.hostname.endsWith(".lovable.app"))
    )
      return page(404, "Link not found", "Invalid destination.");
    target = u.toString();
  } else {
    const { data: bucket } = await supabaseAdmin
      .from("buckets")
      .select("*")
      .eq("id", link.bucket_id!)
      .maybeSingle();
    if (!bucket || bucket.user_id !== link.user_id || !link.object_key)
      return page(404, "Link not found", "File unavailable.");
    const { data: conn } = await supabaseAdmin
      .from("aws_connections")
      .select("id,user_id,role_arn,external_id,region")
      .eq("id", bucket.connection_id)
      .maybeSingle();
    if (!conn || conn.user_id !== link.user_id)
      return page(404, "Link not found", "File unavailable.");
    try {
      const { creds } = await assumeRole(conn, [
        {
          actions: ["s3:GetObject"],
          resources: [`arn:aws:s3:::${bucket.name}/${link.object_key}`],
        },
      ]);
      target = await presign(
        creds,
        bucket.name,
        bucket.region,
        link.object_key,
        "GET",
        clampSignSeconds(link.sign_seconds),
      );
    } catch {
      return page(
        503,
        "Temporarily unavailable",
        "The file's storage couldn't be reached. Try again shortly.",
      );
    }
  }
  await supabaseAdmin
    .from("links")
    .update({ clicks: link.clicks + 1 })
    .eq("id", link.id);
  return new Response(null, {
    status: 302,
    headers: { location: target, "cache-control": "no-store", "referrer-policy": "no-referrer" },
  });
}
