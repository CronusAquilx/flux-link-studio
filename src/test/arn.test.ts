import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseRoleArn, parseUserArn, ARN_MAX } from "@/lib/arn";
import { roleNameFor } from "@/lib/cfn";

const EXTERNAL_ID = "ab12cd34ef56ab12cd34ef56ab12cd34";

describe("Role ARN validation", () => {
  it("accepts the exact ARN our CloudFormation template produces", () => {
    const role = roleNameFor(EXTERNAL_ID);
    expect(role).toBe("FluxLinksAccess-ab12cd34ef56");
    const r = parseRoleArn(`arn:aws:iam::123456789012:role/${role}`);
    expect(r.ok).toBe(true);
  });

  it("trims surrounding whitespace and stores the trimmed ARN", () => {
    const r = parseRoleArn("  arn:aws:iam::123456789012:role/FluxLinksAccess-ab12cd34ef56 \n");
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.arn).toBe("arn:aws:iam::123456789012:role/FluxLinksAccess-ab12cd34ef56");
  });

  it("rejects a missing or empty ARN", () => {
    expect(parseRoleArn("").ok).toBe(false);
    expect(parseRoleArn("   ").ok).toBe(false);
  });

  it("rejects an account that is not exactly 12 digits", () => {
    expect(parseRoleArn("arn:aws:iam::12345678901:role/FluxLinksAccess").ok).toBe(false);
    expect(parseRoleArn("arn:aws:iam::1234567890123:role/FluxLinksAccess").ok).toBe(false);
    expect(parseRoleArn("arn:aws:iam::12345678901a:role/FluxLinksAccess").ok).toBe(false);
  });

  it("rejects a resource that is not a role", () => {
    expect(parseRoleArn("arn:aws:iam::123456789012:user/FluxLinksAccess").ok).toBe(false);
    expect(parseRoleArn("arn:aws:iam::123456789012:FluxLinksAccess").ok).toBe(false);
    expect(parseRoleArn("arn:aws:s3:::my-bucket").ok).toBe(false);
  });

  it("rejects spaces inside the ARN and characters IAM does not allow", () => {
    expect(parseRoleArn("arn:aws:iam::123456789012:role/Flux Links").ok).toBe(false);
    expect(parseRoleArn("arn:aws:iam::123456789012:role/Flux#Links").ok).toBe(false);
    expect(parseRoleArn("arn:aws:iam::123456789012:role/").ok).toBe(false);
  });

  it("rejects a role name longer than AWS allows", () => {
    const long = "a".repeat(65);
    expect(parseRoleArn(`arn:aws:iam::123456789012:role/${long}`).ok).toBe(false);
    expect(parseRoleArn(`arn:aws:iam::123456789012:role/${"a".repeat(64)}`).ok).toBe(true);
  });

  it("accepts a role name that sits under a path", () => {
    expect(parseRoleArn("arn:aws:iam::123456789012:role/aws-service-role/FluxLinksAccess").ok).toBe(
      true,
    );
  });

  it("rejects an ARN longer than the database column allows", () => {
    expect(parseRoleArn("arn:aws:iam::123456789012:role/" + "a".repeat(ARN_MAX)).ok).toBe(false);
  });

  it("validates the platform user ARN separately from role ARNs", () => {
    expect(parseUserArn("arn:aws:iam::123456789012:user/flux-links-platform").ok).toBe(true);
    expect(parseUserArn("arn:aws:iam::123456789012:role/flux-links-platform").ok).toBe(false);
    expect(parseUserArn("arn:aws:iam::123456789012:root").ok).toBe(false);
  });
});

// PostgreSQL rejects repetition counts above 255, which is what broke saving a
// Role ARN: the guard trigger used `{1,512}` and every write failed.
describe("Database guard patterns stay PostgreSQL-safe", () => {
  const dir = "drizzle/migrations";
  // Comments may quote the old broken pattern, and earlier migrations are
  // superseded history, so only the newest definition of the guard counts.
  const codeOf = (f: string) =>
    readFileSync(`${dir}/${f}`, "utf8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");

  it("has a guard definition that PostgreSQL can compile", () => {
    const defs = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .filter((f) => codeOf(f).includes("function public.aws_connections_guard"));
    expect(defs.length).toBeGreaterThan(0);
    const current = codeOf(defs.at(-1)!);
    const offenders = [...current.matchAll(/\{(\d+),(\d+)\}/g)]
      .filter(([, , max]) => Number(max) > 255)
      .map((m) => m[0]);
    expect(offenders).toEqual([]);
    expect(current).toContain("char_length(new.role_arn) > 512");
  });
});
