// Fixed-window rate limits backed by the database (public.flux_rate_limit_hit, service-role only).
// Keys are per signed-in user when available, otherwise per client IP.

export const LIMITS = {
  connection: { max: 20, windowSeconds: 3600 },
  aws_read: { max: 120, windowSeconds: 600 },
  aws_write: { max: 20, windowSeconds: 3600 },
  upload_sign: { max: 600, windowSeconds: 600 },
  links: { max: 60, windowSeconds: 600 },
  project: { max: 30, windowSeconds: 3600 },
  ai_plan: { max: 20, windowSeconds: 3600 },
  ai_run: { max: 60, windowSeconds: 3600 },
  redirect: { max: 300, windowSeconds: 60 },
} as const;
export type LimitName = keyof typeof LIMITS;

export class RateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super(
      `Too many requests. Please wait about ${Math.ceil(retryAfterSeconds / 60)} minute(s) and try again.`,
    );
  }
}

/** Builds the counter key: user id wins; IP is the fallback for signed-out callers. */
export function rateKey(name: LimitName, who: { userId?: string | null; ip?: string | null }) {
  if (who.userId) return `${name}:u:${who.userId}`;
  const ip = (who.ip ?? "").trim().slice(0, 64);
  return `${name}:ip:${ip || "unknown"}`;
}

export function clientIp(headers: Headers | undefined | null) {
  if (!headers) return null;
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    null
  );
}

/** Throws RateLimitError when over the limit. Fails open (logged) if the counter itself is unavailable,
 *  so a database hiccup can't lock every user out. */
export async function enforceRateLimit(
  name: LimitName,
  who: { userId?: string | null; ip?: string | null },
) {
  const l = LIMITS[name];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("flux_rate_limit_hit", {
    _key: rateKey(name, who),
    _max: l.max,
    _window_seconds: l.windowSeconds,
  });
  if (error) {
    console.error(`[rate-limit] counter unavailable for ${name}: ${error.message}`);
    return;
  }
  if (data === false) throw new RateLimitError(l.windowSeconds);
}
