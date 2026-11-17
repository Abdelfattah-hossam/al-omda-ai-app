import test from "node:test";
import assert from "node:assert/strict";
import { requireSameOriginRead } from "../../artifacts/api-server/src/lib/supabase.js";

function invoke(headers: Record<string, string>, method = "GET") {
  let statusCode = 200;
  let payload: unknown;
  let nextCalled = false;
  const req = {
    method,
    get(name: string) {
      return headers[name.toLowerCase()];
    },
  } as unknown as Parameters<typeof requireSameOriginRead>[0];
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      payload = value;
      return this;
    },
  } as unknown as Parameters<typeof requireSameOriginRead>[1];
  requireSameOriginRead(req, res, (() => { nextCalled = true; }) as Parameters<typeof requireSameOriginRead>[2]);
  return { statusCode, payload, nextCalled };
}

test("allows a same-origin GET when the browser omits Origin but sends Fetch Metadata", () => {
  const result = invoke({ host: "app.example.com", "sec-fetch-site": "same-origin" });
  assert.equal(result.nextCalled, true);
  assert.equal(result.statusCode, 200);
});

test("allows a same-origin GET with a matching Referer fallback", () => {
  const result = invoke({ host: "app.example.com", referer: "https://app.example.com/chat" });
  assert.equal(result.nextCalled, true);
});

test("rejects cross-site and unclassified origin-less GET requests", () => {
  const crossSite = invoke({ host: "app.example.com", "sec-fetch-site": "cross-site" });
  const unknown = invoke({ host: "app.example.com" });
  assert.equal(crossSite.statusCode, 403);
  assert.equal(unknown.statusCode, 403);
  assert.equal(crossSite.nextCalled, false);
  assert.equal(unknown.nextCalled, false);
});

test("rejects an explicit cross-origin Origin header", () => {
  const result = invoke({ host: "app.example.com", origin: "https://attacker.example" });
  assert.equal(result.statusCode, 403);
  assert.equal(result.nextCalled, false);
});
