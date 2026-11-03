import { describe, expect, it } from "vitest";
import { cloudFormationTemplate } from "@/lib/cfn";
import { LIMITS, rateKey, clientIp } from "@/lib/ratelimit.server";

const T = cloudFormationTemplate("arn:aws:iam::123456789012:user/flux-platform", "a".repeat(32));

describe("customer role template", () => {
  it("denies PutBucketCORS outside flux-* buckets", () => {
    expect(T).toMatch(
      /Effect: Deny\s+Action: s3:PutBucketCORS\s+NotResource: "arn:aws:s3:::flux-\*"/,
    );
  });
  it("keeps exact principal trust and ExternalId", () => {
    expect(T).toContain('AWS: "arn:aws:iam::123456789012:user/flux-platform"');
    expect(T).toContain(`sts:ExternalId: "${"a".repeat(32)}"`);
    expect(T).not.toMatch(/s3:\*|DeleteObject|PutBucketPolicy|PutObjectAcl/);
  });
});

describe("rate limits", () => {
  it("keys by user first, IP as fallback", () => {
    expect(rateKey("links", { userId: "u1", ip: "1.2.3.4" })).toBe("links:u:u1");
    expect(rateKey("redirect", { ip: "1.2.3.4" })).toBe("redirect:ip:1.2.3.4");
    expect(rateKey("redirect", {})).toBe("redirect:ip:unknown");
  });
  it("reads client IP from proxy headers", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }))).toBe("9.9.9.9");
    expect(clientIp(new Headers({ "cf-connecting-ip": "8.8.8.8" }))).toBe("8.8.8.8");
  });
  it("uses the agreed limits", () => {
    expect(LIMITS.redirect).toEqual({ max: 300, windowSeconds: 60 });
    expect(LIMITS.ai_plan.max).toBe(20);
    expect(LIMITS.aws_write.max).toBe(20);
  });
});
