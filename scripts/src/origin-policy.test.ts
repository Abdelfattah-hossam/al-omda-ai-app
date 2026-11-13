import { test } from "node:test";
import { strict as assert } from "node:assert";
import { isAllowedBrowserOrigin, parseAllowedOrigins } from "./origin-policy.js";

test("accepts only exact HTTPS origins and local development origins", () => {
  const allowed = parseAllowedOrigins(" https://app.example.com, http://localhost:5173, http://127.0.0.1:3000 ");
  assert.equal(allowed.size, 3);
  assert.equal(isAllowedBrowserOrigin("https://app.example.com", allowed), true);
  assert.equal(isAllowedBrowserOrigin("https://app.example.com.evil.test", allowed), false);
  assert.equal(isAllowedBrowserOrigin("https://app.example.com/", allowed), false);
});

test("ignores wildcard, opaque, malformed, credentialed, and path-based entries", () => {
  const allowed = parseAllowedOrigins("*,null,https://app.example.com/path,https://user:pass@app.example.com,ftp://app.example.com,not-a-url");
  assert.equal(allowed.size, 0);
  assert.equal(isAllowedBrowserOrigin("null", allowed), false);
  assert.equal(isAllowedBrowserOrigin(undefined, allowed), false);
});

test("requires a configured exact origin", () => {
  const allowed = parseAllowedOrigins(undefined);
  assert.equal(allowed.size, 0);
  assert.equal(isAllowedBrowserOrigin("https://app.example.com", allowed), false);
});
