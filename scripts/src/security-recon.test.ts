import { test } from "node:test";
import { strict as assert } from "node:assert";
import { analyzeSecurityHeaders } from "./security-recon.js";

test("identifies missing security headers and provides actionable guidance", () => {
  const result = analyzeSecurityHeaders({ "content-type": "text/html", "x-content-type-options": "nosniff" });
  assert.deepEqual(result.present, ["x-content-type-options"]);
  assert.ok(result.missing.includes("strict-transport-security"));
  assert.ok(result.missing.includes("frame-protection"));
  assert.equal(result.recommendations.length, result.missing.length);
});

test("accepts CSP frame-ancestors as frame protection", () => {
  const result = analyzeSecurityHeaders({
    "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
    "strict-transport-security": "max-age=31536000",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=()",
  });
  assert.ok(!result.missing.includes("frame-protection"));
  assert.equal(result.missing.length, 0);
});

test("flags weak header values and risky CSP directives", () => {
  const result = analyzeSecurityHeaders({
    "strict-transport-security": "max-age=60",
    "x-content-type-options": "off",
    "x-frame-options": "ALLOW-FROM https://example.test",
    "content-security-policy": "default-src *; script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "referrer-policy": "unsafe-url",
  });
  assert.ok(result.findings.some((item) => item.header === "strict-transport-security" && item.severity === "medium"));
  assert.ok(result.findings.some((item) => item.header === "x-content-type-options"));
  assert.ok(result.findings.some((item) => item.header === "x-frame-options"));
  assert.ok(result.findings.some((item) => item.header === "content-security-policy" && item.severity === "high"));
  assert.ok(result.findings.some((item) => item.header === "referrer-policy" && item.severity === "low"));
  assert.ok(result.missing.includes("x-content-type-options"));
  assert.ok(result.missing.includes("frame-protection"));
});

test("accepts valid HSTS duration and valid frame protection", () => {
  const result = analyzeSecurityHeaders({
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-frame-options": "DENY",
    "x-content-type-options": "nosniff",
  });
  assert.ok(!result.missing.includes("strict-transport-security"));
  assert.ok(!result.missing.includes("frame-protection"));
  assert.equal(result.findings.length, 0);
});

test("does not accept malformed HSTS or an empty frame-ancestors directive", () => {
  const result = analyzeSecurityHeaders({
    "strict-transport-security": "max-age=31536000garbage",
    "x-frame-options": "ALLOW-FROM https://example.test",
    "content-security-policy": "default-src 'self'; frame-ancestors ;",
  });
  assert.ok(result.missing.includes("strict-transport-security"));
  assert.ok(result.missing.includes("frame-protection"));
  assert.ok(result.findings.some((item) => item.header === "x-frame-options"));
});
