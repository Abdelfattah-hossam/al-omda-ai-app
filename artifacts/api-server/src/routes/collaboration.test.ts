import assert from "node:assert/strict";
import test from "node:test";
import express, { type Request } from "express";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { buildAuditPage, parseAuditCursor, parsePageOffset, validPayload } from "./collaboration.js";
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

test("audit cursors validate and normalize timestamp/id pairs", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  assert.deepEqual(parseAuditCursor("2026-11-19T13:45:00+00:00", id), {
    createdAt: "2026-11-19T13:45:00+00:00",
    id,
  });
  assert.equal(parseAuditCursor(undefined, undefined), null);
  assert.equal(parseAuditCursor("not-a-date", id), undefined);
  assert.equal(parseAuditCursor("2026-11-19T13:45:00.123456+00:00", id)?.createdAt, "2026-11-19T13:45:00.123456+00:00");
  assert.equal(parseAuditCursor("2026-11-19T13:45:00.1234567+00:00", id), undefined);
  assert.equal(parseAuditCursor("2026-02-30T13:45:00Z", id), undefined);
  assert.equal(parseAuditCursor("2024-02-29T13:45:00Z", id)?.createdAt, "2024-02-29T13:45:00Z");
  assert.equal(parseAuditCursor("2026-11-19T13:45:00Z", "not-a-uuid"), undefined);
  assert.equal(parseAuditCursor("2026-11-19T13:45:00Z", undefined), undefined);
});

test("audit keyset pagination returns a stable cursor from the last visible row", () => {
  const rows = Array.from({ length: 3 }, (_, index) => ({
    id: `123e4567-e89b-42d3-a456-42661417400${index}`,
    created_at: `2026-11-19T13:45:0${index}.000Z`,
  }));
  const page = buildAuditPage(rows, 2);
  assert.equal(page.rows.length, 2);
  assert.deepEqual(page.nextCursor, { createdAt: rows[1].created_at, id: rows[1].id });
  const lastPage = buildAuditPage(rows.slice(0, 2), 2);
  assert.equal(lastPage.nextCursor, null);
});

test("audit API returns a user-scoped page and a stable microsecond cursor", async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousPublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const previousAnonKey = process.env.SUPABASE_ANON_KEY;
  const previousFetch = globalThis.fetch;
  const userId = "123e4567-e89b-42d3-a456-426614174999";
  const makeUuid = (index: number) => "123e4567-e89b-42d3-a456-" + String(index).padStart(12, "0");
  const rows = Array.from({ length: 101 }, (_, index) => ({
    id: makeUuid(index),
    action: "created" as const,
    record_kind: "contact" as const,
    record_id: makeUuid(index + 1000),
    created_at: new Date(Date.UTC(2026, 10, 19, 13, 45, 59 - index)).toISOString().replace(".000Z", ".123456+00:00"),
  }));
  const supabaseRequests: URL[] = [];
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  process.env.SUPABASE_ANON_KEY = "test-anon-key";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/user") {
      return new Response(JSON.stringify({ id: userId, email: "audit-test@example.com" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname === "/rest/v1/collaboration_audit_events") {
      supabaseRequests.push(url);
      return new Response(JSON.stringify(url.searchParams.has("or") ? rows.slice(100) : rows), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error("Unexpected Supabase request: " + url.pathname);
  }) as typeof fetch;

  const app = express();
  app.use((req, _res, next) => {
    (req as Request & { cookies: Record<string, string> }).cookies = { omda_access: "test-access-token" };
    next();
  });
  app.use(collaborationRouter);
  const server = app.listen(0, "127.0.0.1");

  function getJson(url: string, origin: string): Promise<{ status: number; body: any }> {
    return new Promise((resolve, reject) => {
      const request = httpRequest(url, { headers: { origin } }, response => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", chunk => { body += chunk; });
        response.on("end", () => {
          try { resolve({ status: response.statusCode ?? 0, body: JSON.parse(body) }); }
          catch (error) { reject(error); }
        });
      });
      request.on("error", reject);
      request.end();
    });
  }

  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const origin = "http://127.0.0.1:" + address.port;
    const first = await getJson(origin + "/collaboration/audit", origin);
    assert.equal(first.status, 200);
    assert.equal(first.body.events.length, 100);
    assert.deepEqual(first.body.nextCursor, { createdAt: rows[99].created_at, id: rows[99].id });
    assert.equal(supabaseRequests[0].searchParams.get("user_id"), "eq." + userId);
    assert.equal(supabaseRequests[0].searchParams.get("limit"), "101");
    assert.equal(supabaseRequests[0].searchParams.get("order"), "created_at.desc,id.desc");

    const cursor = first.body.nextCursor;
    const query = new URLSearchParams({ beforeCreatedAt: cursor.createdAt, beforeId: cursor.id });
    const second = await getJson(origin + "/collaboration/audit?" + query.toString(), origin);
    assert.equal(second.status, 200);
    assert.equal(second.body.events.length, 1);
    assert.equal(second.body.events[0].id, rows[100].id);
    assert.equal(second.body.nextCursor, null);
    assert.match(supabaseRequests[1].searchParams.get("or") ?? "", /\.123456\+00:00/);
    assert.match(supabaseRequests[1].searchParams.get("or") ?? "", new RegExp("id\\.lt\\." + rows[99].id));
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
    if (previousPublishableKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = previousPublishableKey;
    if (previousAnonKey === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = previousAnonKey;
  }
});
