import { describe, expect, test } from "bun:test";
import { buildContentSecurityPolicy, generateNonce } from "@/lib/csp";

function scriptSrc(policy: string): string {
  const directives = policy.split(";").map((part) => part.trim());
  return directives.find((part) => part.startsWith("script-src")) ?? "";
}

describe("generateNonce", () => {
  test("returns a base64 string accepted by Next's nonce parser", () => {
    const nonce = generateNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(nonce.length).toBeGreaterThanOrEqual(20);
  });

  test("returns a fresh value per call", () => {
    expect(generateNonce()).not.toBe(generateNonce());
  });
});

describe("buildContentSecurityPolicy", () => {
  const nonce = "dGVzdC1ub25jZQ==";
  const policy = buildContentSecurityPolicy(nonce, { dev: false });

  test("puts the nonce in script-src and keeps strict-dynamic", () => {
    expect(scriptSrc(policy)).toContain(`'nonce-${nonce}'`);
    expect(scriptSrc(policy)).toContain("'strict-dynamic'");
  });

  test("does not allow unsafe-inline scripts", () => {
    expect(scriptSrc(policy)).not.toContain("'unsafe-inline'");
  });

  test("allows unsafe-inline styles for Tailwind/MapLibre runtime styles", () => {
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
  });

  test("keeps every external host from the previous policy", () => {
    for (const host of [
      "https://images.data.gov.sg",
      "https://datamall2.mytransport.sg",
      "https://dm-traffic-camera-itsc.s3.ap-southeast-1.amazonaws.com",
      "https://tiles.openfreemap.org",
      "https://thumb.wikimedia.org",
      "https://upload.wikimedia.org",
      "https://www.nea.gov.sg",
      "https://fonts.gstatic.com",
    ]) {
      expect(policy).toContain(host);
    }
  });

  test("keeps the MapLibre worker and document hardening directives", () => {
    expect(policy).toContain("worker-src 'self'");
    expect(policy).toContain("child-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("object-src 'none'");
  });

  test("adds unsafe-eval only in development", () => {
    expect(scriptSrc(policy)).not.toContain("'unsafe-eval'");
    expect(scriptSrc(buildContentSecurityPolicy(nonce, { dev: true }))).toContain(
      "'unsafe-eval'",
    );
  });
});
