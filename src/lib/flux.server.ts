// Core Flux operations shared by server functions and the AI assistant executor.
// Every function receives the caller's RLS-scoped client, so per-user isolation is enforced by the database.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  assumeRole,
  classifyAwsError,
  createPrivateBucket,
  listBuckets,
  putUploadCors,
  type ConnectionRow,
} from "./aws.server";

export type Sb = SupabaseClient<Database>;

export const BUCKET_RE = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
export const REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2", "ca-central-1", "eu-west-1", "eu-west-2",
  "eu-central-1", "eu-north-1", "ap-south-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "sa-east-1",
] as const;

export async function getConnection(sb: Sb, id: string): Promise<ConnectionRow> {
  const { data, error } = await sb.from("aws_connections").select("id,user_id,role_arn,external_id,region").eq("id", id).single();
  if (error || !data) throw new Error("AWS connection not found");
  if (!data.role_arn) throw new Error("This AWS connection isn't finished — add the Role ARN and verify it.");
  return data;
}

export async function getBucket(sb: Sb, id: string) {
  const { data, error } = await sb.from("buckets").select("*").eq("id", id).single();
  if (error || !data) throw new Error("Bucket not found");
  const conn = await getConnection(sb, data.connection_id);
  if (conn.user_id !== data.user_id) throw new Error("Bucket ownership mismatch");
  return { bucket: data, conn };
}

export async function verifyConnection(sb: Sb, id: string) {
  const conn = await getConnection(sb, id);
  if (!conn.role_arn) throw new Error("Paste the Role ARN from your AWS stack outputs first.");
  try {
    const { assumedArn } = await assumeRole(conn, [{ actions: ["s3:ListAllMyBuckets"], resources: ["*"] }]);
    const account = assumedArn.split(":")[4] ?? null;
    await sb.from("aws_connections").update({ status: "verified", aws_account_id: account, last_error: null, verified_at: new Date().toISOString() }).eq("id", id);
    return { ok: true as const, account };
  } catch (e) {
    const c = classifyAwsError(e);
    // Platform-side problems are the site owner's to fix; don't mark the customer's connection broken for them.
    if (c.kind !== "platform_missing" && c.kind !== "platform_invalid") {
      await sb.from("aws_connections").update({ status: "error", last_error: c.message }).eq("id", id);
    }
    throw new Error(c.message);
  }
}

export async function discoverBuckets(sb: Sb, connectionId: string) {
  const conn = await getConnection(sb, connectionId);
  let found: Awaited<ReturnType<typeof listBuckets>>;
  try {
    const { creds } = await assumeRole(conn, [{ actions: ["s3:ListAllMyBuckets", "s3:GetBucketLocation"], resources: ["*"] }]);
    found = await listBuckets(creds);
  } catch (e) {
    throw new Error(classifyAwsError(e).message);
  }
  if (found.length) {
    const rows = found.map((b) => ({ user_id: conn.user_id, connection_id: conn.id, name: b.name, region: b.region }));
    const { error } = await sb.from("buckets").upsert(rows, { onConflict: "user_id,name", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  return { count: found.length, names: found.map((b) => b.name) };
}

export async function provisionBucket(sb: Sb, p: { connectionId: string; name: string; region: string; origin?: string | undefined }) {
  if (!BUCKET_RE.test(p.name) || p.name.includes("..")) throw new Error("Invalid bucket name");
  if (!(REGIONS as readonly string[]).includes(p.region)) throw new Error("Unsupported region");
  const conn = await getConnection(sb, p.connectionId);
  const arn = `arn:aws:s3:::${p.name}`;
  const { creds } = await assumeRole(conn, [
    {
      actions: ["s3:CreateBucket", "s3:PutBucketPublicAccessBlock", "s3:PutEncryptionConfiguration", "s3:PutBucketOwnershipControls", "s3:PutBucketCORS"],
      resources: [arn],
    },
  ]);
  await createPrivateBucket(creds, p.name, p.region);
  let browserUploads = false;
  if (p.origin) {
    await putUploadCors(creds, p.name, p.region, [p.origin]);
    browserUploads = true;
  }
  const { data, error } = await sb
    .from("buckets")
    .upsert(
      { user_id: conn.user_id, connection_id: conn.id, name: p.name, region: p.region, provisioned_by_flux: true, browser_uploads: browserUploads },
      { onConflict: "user_id,name" },
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export function checkOrigin(origin: string) {
  const u = new URL(origin);
  if (u.protocol !== "https:" && u.hostname !== "localhost") throw new Error("Origin must be https");
  return u.origin;
}

export async function enableBrowserUploads(sb: Sb, bucketId: string, origin: string) {
  const o = checkOrigin(origin);
  const { bucket, conn } = await getBucket(sb, bucketId);
  const { creds } = await assumeRole(conn, [{ actions: ["s3:PutBucketCORS"], resources: [`arn:aws:s3:::${bucket.name}`] }]);
  await putUploadCors(creds, bucket.name, bucket.region, [o]);
  await sb.from("buckets").update({ browser_uploads: true }).eq("id", bucketId);
  return { ok: true };
}

const ALPHA = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function makeSlug(kind: "flux_v3" | "flux_mini") {
  const n = kind === "flux_mini" ? 7 : 18;
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(bytes, (b) => ALPHA[b % ALPHA.length]).join("");
}

export async function createS3Links(
  sb: Sb,
  p: { bucketId: string; keys: string[]; kind: "flux_v3" | "flux_mini"; expiresDays?: number | null | undefined },
) {
  const { bucket } = await getBucket(sb, p.bucketId);
  const expires_at = p.expiresDays ? new Date(Date.now() + p.expiresDays * 86400_000).toISOString() : null;
  const rows = p.keys.map((key) => ({
    user_id: bucket.user_id,
    slug: makeSlug(p.kind),
    kind: p.kind,
    source: "s3",
    bucket_id: bucket.id,
    object_key: key,
    expires_at,
  }));
  const { data, error } = await sb.from("links").insert(rows).select();
  if (error) throw new Error(error.message);
  return data;
}

export async function createRule(
  sb: Sb,
  p: { name: string; bucketId: string; prefix: string; linkKind: "flux_v3" | "flux_mini"; expiresDays?: number | null | undefined },
) {
  await getBucket(sb, p.bucketId);
  const { data, error } = await sb
    .from("automation_rules")
    .insert({ name: p.name, bucket_id: p.bucketId, prefix: p.prefix, link_kind: p.linkKind, expires_days: p.expiresDays ?? null })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function logActivity(sb: Sb, userId: string, action: string, detail: string) {
  await sb.from("activity").insert({ user_id: userId, action, detail: detail.slice(0, 500) });
}
