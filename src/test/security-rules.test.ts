import { describe, expect, it } from "vitest";
import { assertCorsBucket, checkOrigin } from "@/lib/flux.server";
import { clampSignSeconds } from "@/lib/redirect.server";
import { assertSafeKey } from "@/lib/aws.server";

describe("browser-upload CORS", () => {
  it("only allows flux-* buckets", () => {
    expect(() => assertCorsBucket("flux-team-files")).not.toThrow();
    expect(() => assertCorsBucket("company-backups")).toThrow(/flux-/);
  });
  it("requires https and the caller's own origin", () => {
    expect(checkOrigin("https://app.example.com/x", "https://app.example.com")).toBe(
      "https://app.example.com",
    );
    expect(() => checkOrigin("http://evil.com", "http://evil.com")).toThrow(/https/);
    expect(() => checkOrigin("https://evil.com", "https://app.example.com")).toThrow();
    expect(() => checkOrigin("https://evil.com", null)).toThrow();
  });
});

describe("share link signing lifetime", () => {
  it("clamps to 60s..3600s", () => {
    expect(clampSignSeconds(5)).toBe(60);
    expect(clampSignSeconds(300)).toBe(300);
    expect(clampSignSeconds(999999)).toBe(3600);
    expect(clampSignSeconds(Number.NaN)).toBe(300);
  });
});

describe("object keys", () => {
  it("rejects path traversal", () => {
    expect(() => assertSafeKey("a/../b")).toThrow();
    expect(() => assertSafeKey("folder/file.pdf")).not.toThrow();
  });
});
