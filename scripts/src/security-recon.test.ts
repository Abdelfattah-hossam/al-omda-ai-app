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
