import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assumeRole,
  classifyAwsError,
  getPlatformIdentity,
  isPlatformConfigured,
  PLATFORM_USER_POLICY,
  listObjects as s3ListObjects,
  presign,
  RECOMMENDED_PERMISSIONS,
  assertSafeKey,
  MAX_UPLOAD_BYTES,
} from "./aws.server";
import {
  createRule,
  createS3Links,
  discoverBuckets,
  enableBrowserUploads,
  getBucket,
  makeSlug,
  provisionBucket,
  REGIONS,
  verifyConnection,
  BUCKET_RE,
  logActivity,
  type Sb,
} from "./flux.server";

const uuid = z.string().uuid();
const kind = z.enum(["flux_v3", "flux_mini"]);

export const getSetupStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const configured = isPlatformConfigured();
    let platformAccountId: string | null = null;
    let platformArn: string | null = null;
    let platformError: string | null = null;
    let platformState: "missing" | "invalid" | "ok" | "error" = configured ? "ok" : "missing";
    if (configured) {
      try {
        const id = await getPlatformIdentity();
        platformAccountId = id.account;
        platformArn = id.arn;
        // Assumed-role/root identities are not acceptable as the platform identity: require a dedicated IAM user.
        if (!/^arn:aws:iam::\d{12}:user\//.test(id.arn)) {
          platformState = "error";
          platformError = "The platform keys must belong to a dedicated IAM user (not root or a role).";
        }
      } catch (e) {
        const c = classifyAwsError(e);
        platformState = c.kind === "platform_invalid" ? "invalid" : "error";
        platformError = c.message;
      }
    }
    return {
      awsConfigured: configured,
      platformState,
      platformAccountId,
      platformArn,
      platformError,
      platformUserPolicy: PLATFORM_USER_POLICY,
      aiConfigured: Boolean(process.env["LOVABLE_API_KEY"]),
      recommendedPermissions: RECOMMENDED_PERMISSIONS("*"),
    };
  });

export const createConnectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ label: z.string().min(1).max(80), roleArn: z.string().max(600).default(""), region: z.enum(REGIONS) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("aws_connections")
      .insert({ label: data.label, role_arn: data.roleArn.trim(), region: data.region, user_id: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const verifyConnectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const r = await verifyConnection(context.supabase, data.id);
    await logActivity(context.supabase, context.userId, "connection.verified", `AWS account ${r.account}`);
    return r;
  });

export const discoverBucketsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ connectionId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const r = await discoverBuckets(context.supabase, data.connectionId);
    await logActivity(context.supabase, context.userId, "buckets.discovered", `${r.count} bucket(s)`);
    return r;
  });

export const provisionBucketFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        connectionId: uuid,
        name: z.string().regex(BUCKET_RE),
        region: z.enum(REGIONS),
        origin: z.string().url().optional(),
        confirmed: z.literal(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const b = await provisionBucket(context.supabase, data);
    await logActivity(context.supabase, context.userId, "bucket.created", `${b.name} (${b.region}, private)`);
    return b;
  });

export const enableBrowserUploadsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ bucketId: uuid, origin: z.string().url(), confirmed: z.literal(true) }).parse(d))
  .handler(async ({ data, context }) => {
    const r = await enableBrowserUploads(context.supabase, data.bucketId, data.origin);
    await logActivity(context.supabase, context.userId, "bucket.cors", `Browser uploads enabled for ${data.origin}`);
    return r;
  });

export const listObjectsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ bucketId: uuid, prefix: z.string().max(512).default("") }).parse(d))
  .handler(async ({ data, context }) => {
    const { bucket, conn } = await getBucket(context.supabase, data.bucketId);
    const { creds } = await assumeRole(conn, [{ actions: ["s3:ListBucket"], resources: [`arn:aws:s3:::${bucket.name}`] }]);
    return s3ListObjects(creds, bucket.name, bucket.region, data.prefix);
  });

export const createUploadUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        bucketId: uuid,
        key: z.string().min(1).max(900),
        size: z.number().int().min(0).max(MAX_UPLOAD_BYTES),
        contentType: z.string().max(200).regex(/^[\w.+-]+\/[\w.+-]+$/).default("application/octet-stream"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { bucket, conn } = await getBucket(context.supabase, data.bucketId);
    const key = data.key.replace(/^\/+/, "");
    assertSafeKey(key);
    const { creds } = await assumeRole(conn, [
      { actions: ["s3:PutObject"], resources: [`arn:aws:s3:::${bucket.name}/${key}`] },
    ]);
    return { url: await presign(creds, bucket.name, bucket.region, key, "PUT", 900, { contentType: data.contentType, size: data.size }), key, contentType: data.contentType };
  });

/** Called after an upload completes: applies enabled automation rules for that bucket. */
export const recordUploadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ bucketId: uuid, key: z.string().min(1), size: z.number().int().min(0) }).parse(d))
  .handler(async ({ data, context }) => {
    await getBucket(context.supabase, data.bucketId);
    await context.supabase.from("uploads").insert({ user_id: context.userId, bucket_id: data.bucketId, object_key: data.key, size_bytes: data.size });
    const { data: rules } = await context.supabase
      .from("automation_rules")
      .select("*")
      .eq("bucket_id", data.bucketId)
      .eq("enabled", true);
    const created = [];
    for (const r of rules ?? []) {
      if (!data.key.startsWith(r.prefix)) continue;
      const links = await createS3Links(context.supabase, {
        bucketId: data.bucketId,
        keys: [data.key],
        kind: r.link_kind as "flux_v3" | "flux_mini",
        expiresDays: r.expires_days,
      });
      created.push(...links.map((l) => ({ ...l, rule: r.name })));
    }
    return created;
  });

export const createLinksFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        bucketId: uuid,
        keys: z.array(z.string().min(1)).min(1).max(500),
        kind,
        expiresDays: z.number().int().min(1).max(3650).nullable().optional(),
        confirmed: z.literal(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const links = await createS3Links(context.supabase, data);
    await logActivity(context.supabase, context.userId, "links.created", `${links.length} ${data.kind === "flux_v3" ? "Flux V3" : "Flux Mini"} link(s)`);
    return links;
  });

export const createRuleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        name: z.string().min(1).max(80),
        bucketId: uuid,
        prefix: z.string().max(512),
        linkKind: kind,
        expiresDays: z.number().int().min(1).max(3650).nullable().optional(),
        confirmed: z.literal(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const r = await createRule(context.supabase, data);
    await logActivity(context.supabase, context.userId, "rule.created", r.name);
    return r;
  });

const LOVABLE_HOST = /^[a-z0-9-]+\.lovable\.app$/i;

export const checkProjectUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ url: z.string().url() }).parse(d))
  .handler(async ({ data }) => {
    const u = new URL(data.url);
    if (u.protocol !== "https:" || !LOVABLE_HOST.test(u.hostname) || u.hostname.startsWith("id-preview--")) {
      return { ok: false, status: 0, reason: "Use a published https://<name>.lovable.app URL (preview links are not shareable)." };
    }
    try {
      const res = await fetch(u.origin + u.pathname, { method: "GET", redirect: "manual" });
      const ok = res.status >= 200 && res.status < 400;
      return { ok, status: res.status, reason: ok ? "Reachable" : `The site responded with HTTP ${res.status}.` };
    } catch (e) {
      return { ok: false, status: 0, reason: e instanceof Error ? e.message : "Unreachable" };
    }
  });

export const createProjectLinkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ name: z.string().min(1).max(80), url: z.string().url(), kind, confirmed: z.literal(true) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const u = new URL(data.url);
    if (u.protocol !== "https:" || !LOVABLE_HOST.test(u.hostname) || u.hostname.startsWith("id-preview--")) {
      throw new Error("Only published https://<name>.lovable.app URLs are accepted.");
    }
    const res = await fetch(u.toString(), { method: "GET", redirect: "manual" }).catch(() => null);
    const status = res?.status ?? 0;
    if (!res || status >= 400 || status === 0) throw new Error(`That project isn't reachable (HTTP ${status}). Publish it first.`);
    const { data: link, error } = await context.supabase
      .from("links")
      .insert({ user_id: context.userId, slug: makeSlug(data.kind), kind: data.kind, source: "project", target_url: u.toString() })
      .select()
      .single();
    if (error) throw new Error(error.message);
    const { data: proj, error: e2 } = await context.supabase
      .from("projects")
      .insert({ user_id: context.userId, name: data.name, lovable_url: u.toString(), link_id: link.id, last_check_status: status })
      .select()
      .single();
    if (e2) throw new Error(e2.message);
    await logActivity(context.supabase, context.userId, "project.linked", `${data.name} → ${u.hostname}`);
    return { project: proj, link };
  });

// ---------------- AI setup assistant ----------------

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("verify_connection"), params: z.object({ connectionId: uuid }) }),
  z.object({ type: z.literal("discover_buckets"), params: z.object({ connectionId: uuid }) }),
  z.object({
    type: z.literal("create_bucket"),
    params: z.object({ connectionId: uuid, name: z.string().regex(BUCKET_RE), region: z.enum(REGIONS) }),
  }),
  z.object({ type: z.literal("enable_browser_uploads"), params: z.object({ bucketId: uuid }) }),
  z.object({
    type: z.literal("create_rule"),
    params: z.object({
      name: z.string().min(1).max(80),
      bucketId: uuid,
      prefix: z.string().max(512),
      linkKind: kind,
      expiresDays: z.number().int().min(1).max(3650).nullable(),
    }),
  }),
]);
type PlanAction = z.infer<typeof actionSchema>;

// Risk is decided by Flux, never by the model.
const RISK: Record<PlanAction["type"], "safe" | "billable" | "permission" | "public"> = {
  verify_connection: "safe",
  discover_buckets: "safe",
  create_bucket: "billable",
  enable_browser_uploads: "permission",
  create_rule: "public",
};

export const planSetupFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ prompt: z.string().min(3).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { generateResponse } = await import("@lovable.dev/ai-gateway");
    const [{ data: conns }, { data: buckets }] = await Promise.all([
      context.supabase.from("aws_connections").select("id,label,region,status,role_arn"),
      context.supabase.from("buckets").select("id,name,region,browser_uploads,connection_id"),
    ]);
    const stateJson = JSON.stringify({ connections: conns ?? [], buckets: buckets ?? [], awsConfiguredOnSite: isPlatformConfigured() });
    const instructions = `You are the Flux Links setup assistant. Plan concrete setup actions for the user's AWS S3 link-sharing setup.
Only use these action types: verify_connection{connectionId}, discover_buckets{connectionId}, create_bucket{connectionId,name,region}, enable_browser_uploads{bucketId}, create_rule{name,bucketId,prefix,linkKind:"flux_v3"|"flux_mini",expiresDays:number|null}.
Only reference ids that exist in the provided state. Never invent ids. Buckets Flux creates are always private. If there is no AWS connection, return no actions and explain the user must add one on the Connections page (Flux never accepts root or access keys — only an IAM role with an External ID).
Bucket names: lowercase, 3-63 chars, globally unique — suggest a suffix.
Respond ONLY with JSON: {"summary": string, "actions": [{"type": string, "params": object, "reason": string}]}.
Current state: ${stateJson}`;
    const res = await generateResponse({
      model: "openai/gpt-6-astra",
      instructions,
      input: data.prompt,
    });
    let text = "";
    for (const item of res.output ?? []) {
      if (item.type === "message") {
        for (const c of item.content) if (c.type === "output_text") text += c.text;
      }
    }
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    let parsed: { summary?: unknown; actions?: unknown[] } = {};
    try {
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      parsed = {};
    }
    const connIds = new Set((conns ?? []).map((c) => c.id));
    const bucketIds = new Set((buckets ?? []).map((b) => b.id));
    const actions = (Array.isArray(parsed.actions) ? parsed.actions : [])
      .map((raw) => {
        const r = actionSchema.safeParse(raw);
        if (!r.success) return null;
        const p = r.data.params as Record<string, unknown>;
        const cid = p["connectionId"], bid = p["bucketId"];
        if (typeof cid === "string" && !connIds.has(cid)) return null;
        if (typeof bid === "string" && !bucketIds.has(bid)) return null;
        const reason = typeof (raw as { reason?: unknown }).reason === "string" ? (raw as { reason: string }).reason : "";
        return { id: crypto.randomUUID(), ...r.data, reason, risk: RISK[r.data.type], status: "pending", result: null as string | null };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null)
      .slice(0, 10);
    const summary = typeof parsed.summary === "string" ? parsed.summary : text.slice(0, 600) || "No plan produced.";
    const { data: plan, error } = await context.supabase
      .from("assistant_plans")
      .insert({ user_id: context.userId, prompt: data.prompt, summary, actions })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return plan;
  });

export const runPlanActionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ planId: uuid, actionId: uuid, decision: z.enum(["approve", "reject"]), confirmed: z.boolean(), origin: z.string().url() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb: Sb = context.supabase;
    const { data: plan, error } = await sb.from("assistant_plans").select("*").eq("id", data.planId).single();
    if (error || !plan) throw new Error("Plan not found");
    const actions = plan.actions as Array<PlanAction & { id: string; risk: string; status: string; result: string | null }>;
    const a = actions.find((x) => x.id === data.actionId);
    if (!a) throw new Error("Action not found");
    if (a.status !== "pending" && a.status !== "failed") throw new Error("Action already handled");
    const save = async () => {
      await sb.from("assistant_plans").update({ actions }).eq("id", plan.id);
      return a;
    };
    if (data.decision === "reject") {
      a.status = "rejected";
      return save();
    }
    const checked = actionSchema.parse({ type: a.type, params: a.params });
    if (RISK[checked.type] !== "safe" && !data.confirmed) throw new Error("This action needs explicit confirmation.");
    try {
      switch (checked.type) {
        case "verify_connection": {
          const r = await verifyConnection(sb, checked.params.connectionId);
          a.result = `Verified AWS account ${r.account}`;
          break;
        }
        case "discover_buckets": {
          const r = await discoverBuckets(sb, checked.params.connectionId);
          a.result = `Found ${r.count} bucket(s)`;
          break;
        }
        case "create_bucket": {
          const b = await provisionBucket(sb, { ...checked.params, origin: data.origin });
          a.result = `Created private bucket ${b.name}`;
          break;
        }
        case "enable_browser_uploads":
          await enableBrowserUploads(sb, checked.params.bucketId, data.origin);
          a.result = "Browser uploads enabled for this app's origin";
          break;
        case "create_rule": {
          const r = await createRule(sb, checked.params);
          a.result = `Rule "${r.name}" created`;
          break;
        }
      }
      a.status = "done";
      await logActivity(sb, context.userId, `ai.${checked.type}`, a.result ?? "");
    } catch (e) {
      a.status = "failed";
      a.result = e instanceof Error ? e.message : String(e);
    }
    return save();
  });
