import assert from "node:assert/strict";
import test from "node:test";
import { validPayload } from "./collaboration.js";

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
