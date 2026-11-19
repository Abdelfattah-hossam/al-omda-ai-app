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

test("parses complete HSTS max-age values, quoted digits, and duplicate directives", () => {
  const quoted = analyzeSecurityHeaders({ "strict-transport-security": 'max-age="31536000"' });
  assert.ok(!quoted.missing.includes("strict-transport-security"));
  assert.equal(quoted.findings.length, 0);
  const trailing = analyzeSecurityHeaders({ "strict-transport-security": "max-age=31536000junk" });
  assert.ok(trailing.missing.includes("strict-transport-security"));
  assert.ok(trailing.findings.some((item) => item.header === "strict-transport-security"));
  const duplicate = analyzeSecurityHeaders({ "strict-transport-security": "max-age=31536000; max-age=0" });
  assert.ok(duplicate.missing.includes("strict-transport-security"));
  assert.ok(duplicate.findings.some((item) => item.header === "strict-transport-security"));
});

test("does not flag unsafe-inline when a nonce or hash makes it ineffective", () => {
  const nonce = analyzeSecurityHeaders({ "content-security-policy": "script-src 'nonce-YWJjZA==' 'unsafe-inline'" });
  const hash = analyzeSecurityHeaders({ "content-security-policy": "script-src 'sha256-YWJjZA==' 'unsafe-inline'" });
  assert.ok(!nonce.findings.some((item) => item.header === "content-security-policy" && item.issue.includes("unsafe-inline")));
  assert.ok(!hash.findings.some((item) => item.header === "content-security-policy" && item.issue.includes("unsafe-inline")));
  const unsafe = analyzeSecurityHeaders({ "content-security-policy": "script-src 'self' 'unsafe-inline'" });
  assert.ok(unsafe.findings.some((item) => item.header === "content-security-policy" && item.issue.includes("unsafe-inline")));
});

test("uses the last recognized Referrer-Policy token", () => {
  const protectedLast = analyzeSecurityHeaders({ "referrer-policy": "unsafe-url, no-referrer" });
  const unsafeLast = analyzeSecurityHeaders({ "referrer-policy": "no-referrer, unsafe-url" });
  const unknownLast = analyzeSecurityHeaders({ "referrer-policy": "no-referrer, unknown-token" });
  assert.ok(!protectedLast.findings.some((item) => item.header === "referrer-policy"));
  assert.ok(unsafeLast.findings.some((item) => item.header === "referrer-policy"));
  assert.ok(!unknownLast.findings.some((item) => item.header === "referrer-policy"));
});

test("keeps the first duplicate CSP directive as required by CSP", () => {
  const permissiveFirst = analyzeSecurityHeaders({ "content-security-policy": "script-src 'unsafe-inline'; script-src 'none'" });
  const restrictiveFirst = analyzeSecurityHeaders({ "content-security-policy": "script-src 'none'; script-src 'unsafe-inline'" });
  assert.ok(permissiveFirst.findings.some((item) => item.issue.includes("unsafe-inline")));
  assert.ok(!restrictiveFirst.findings.some((item) => item.issue.includes("unsafe-inline")));
});

test("rejects malformed nonce and hash payloads as unsafe-inline suppressors", () => {
  const nonce = analyzeSecurityHeaders({ "content-security-policy": "script-src 'nonce-!!!' 'unsafe-inline'" });
  const hash = analyzeSecurityHeaders({ "content-security-policy": "script-src 'sha256-!!!' 'unsafe-inline'" });
  assert.ok(nonce.findings.some((item) => item.issue.includes("unsafe-inline")));
  assert.ok(hash.findings.some((item) => item.issue.includes("unsafe-inline")));
});

test("evaluates element and attribute specific inline policy overrides", () => {
  const elementOverride = analyzeSecurityHeaders({ "content-security-policy": "script-src 'none'; script-src-elem 'unsafe-inline'" });
  const attributeOverride = analyzeSecurityHeaders({ "content-security-policy": "script-src 'unsafe-inline'; script-src-attr 'none'" });
  const restrictiveElementOverride = analyzeSecurityHeaders({ "content-security-policy": "script-src 'unsafe-inline'; script-src-elem 'none'; script-src-attr 'none'" });
  assert.ok(elementOverride.findings.some((item) => item.issue.includes("unsafe-inline")));
  assert.ok(attributeOverride.findings.some((item) => item.issue.includes("unsafe-inline")));
  assert.ok(!restrictiveElementOverride.findings.some((item) => item.issue.includes("unsafe-inline")));
});

test("accepts CSP nonce values by grammar without imposing decoded-length rules", () => {
  const nonce = analyzeSecurityHeaders({ "content-security-policy": "script-src 'nonce-abcdefghijklmnopqrstuvwxyzabcdefg' 'unsafe-inline'" });
  assert.ok(!nonce.findings.some((item) => item.issue.includes("unsafe-inline")));
  const illegal = analyzeSecurityHeaders({ "content-security-policy": "script-src 'nonce-abc!def' 'unsafe-inline'" });
  assert.ok(illegal.findings.some((item) => item.issue.includes("unsafe-inline")));
});

test("applies strict-dynamic only to script inline policies", () => {
  const scriptAttribute = analyzeSecurityHeaders({ "content-security-policy": "script-src 'none'; script-src-attr 'unsafe-inline' 'strict-dynamic'" });
  const styleControl = analyzeSecurityHeaders({ "content-security-policy": "style-src-attr 'unsafe-inline' 'strict-dynamic'" });
  assert.ok(!scriptAttribute.findings.some((item) => item.issue.includes("unsafe-inline")));
  assert.ok(styleControl.findings.some((item) => item.issue.includes("unsafe-inline")));
});
