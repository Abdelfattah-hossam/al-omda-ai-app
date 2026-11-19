import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { once } from "node:events";
import { parsePageOffset, validPayload } from "./collaboration.js";
import collaborationRouter from "./collaboration.js";

test("calendar timestamps are normalized from PostgREST and ISO offsets", () => {
  const payload = validPayload({
    title: "Planning meeting",
    description: "Review project milestones",
    status: "in_progress",
    dueAt: "2026-11-19T13:45:00+00:00",
    metadata: {},
  }, "event");
  assert.equal(payload?.due_at, "2026-11-19T13:45:00.000Z");
  assert.equal(payload?.status, "in_progress");
});

test("calendar records require a valid date", () => {
  assert.equal(validPayload({ title: "Missing date" }, "event"), null);
  assert.equal(validPayload({ title: "Bad date", dueAt: "not-a-date" }, "event"), null);
});

test("all record kinds reject unsupported statuses", () => {
  for (const kind of ["contact", "event", "ticket"] as const) {
    assert.equal(validPayload({ title: "Invalid status", status: "closed", dueAt: kind === "event" ? "2026-11-19T13:45:00Z" : null }, kind), null);
  }
});

test("contact metadata is bounded and string-only", () => {
  assert.equal(validPayload({ title: "Contact", metadata: { email: 123 } }, "contact"), null);
  assert.equal(validPayload({ title: "Contact", metadata: { email: "a@example.com", phone: "+971500000000" } }, "contact")?.metadata.email, "a@example.com");
});

test("titles and descriptions are bounded", () => {
  assert.equal(validPayload({ title: " " }, "ticket"), null);
  assert.equal(validPayload({ title: "x".repeat(161) }, "ticket"), null);
  assert.equal(validPayload({ title: "Ticket", description: "x".repeat(4001) }, "ticket"), null);
});

test("pagination offsets accept only bounded decimal integers", () => {
  assert.equal(parsePageOffset(undefined), 0);
  assert.equal(parsePageOffset("0"), 0);
  assert.equal(parsePageOffset("100"), 100);
  assert.equal(parsePageOffset("100000"), 100000);
  assert.equal(parsePageOffset("0100000"), 100000);
  for (const invalid of ["", " ", "0x10", "1e3", "-1", "100001", "999999", ["1", "2"], 4]) {
    assert.equal(parsePageOffset(invalid), null);
  }
});

test("audit API rejects requests without a signed-in session", async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousPublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const previousAnonKey = process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  process.env.SUPABASE_ANON_KEY = "test-anon-key";

  const app = express();
  app.use(collaborationRouter);
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const origin = "http://127.0.0.1:" + address.port;
    const response = await fetch(origin + "/collaboration/audit", { headers: { origin } });
    assert.equal(response.status, 401);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
    if (previousPublishableKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = previousPublishableKey;
    if (previousAnonKey === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = previousAnonKey;
  }
});
