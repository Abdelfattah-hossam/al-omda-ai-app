import test from "node:test";
import assert from "node:assert/strict";
import { buildWriteProposal, hasApprovedWrite, writeDecisionNote, WRITE_TOOL_NAME, type WriteProposalInput } from "./write-tools.js";

const base: WriteProposalInput = {
  taskId: "11111111-1111-4111-8111-111111111111",
  taskTitle: "خطة تسويق",
  stepId: "step-1",
  stepNumber: 2,
  stepText: "تحليل السوق",
  result: "النتيجة الأولى\n- نقطة",
};

test("proposal is deterministic, ASCII-keyed, and discloses tool, input and blast radius", async () => {
  const a = await buildWriteProposal(base);
  const b = await buildWriteProposal({ ...base });
  assert.ok(a && b);
  assert.equal(a.inputHash, b.inputHash);
  assert.match(a.inputHash, /^[0-9a-f]{64}$/);
  assert.equal(a.filename, "stage-2-result.md");
  assert.ok(/^[\x20-\x7e]+$/.test(a.filename));
  assert.equal(a.riskClass, "write");
  assert.ok(a.content.startsWith("# خطة تسويق\n\n## المرحلة 2: تحليل السوق\n\nالنتيجة الأولى"));
  assert.equal(a.disclosure.length, 4);
  assert.ok(a.disclosure[0].includes(WRITE_TOOL_NAME));
  assert.ok(a.disclosure[2].includes("نتيجة-المرحلة-2.md"));
});

test("any change to the result, step or task changes the hash (revision after disclosure is refused)", async () => {
  const a = await buildWriteProposal(base);
  const revised = await buildWriteProposal({ ...base, result: base.result + " معدّلة" });
  const otherStep = await buildWriteProposal({ ...base, stepId: "step-2" });
  const otherTask = await buildWriteProposal({ ...base, taskId: "22222222-2222-4222-8222-222222222222" });
  assert.ok(a && revised && otherStep && otherTask);
  assert.notEqual(a.inputHash, revised.inputHash);
  assert.notEqual(a.inputHash, otherStep.inputHash);
  assert.notEqual(a.inputHash, otherTask.inputHash);
});

test("no proposal for an empty result or oversized content", async () => {
  assert.equal(await buildWriteProposal({ ...base, result: "   " }), null);
  assert.equal(await buildWriteProposal({ ...base, result: "x".repeat(200_001) }), null);
});

test("approved writes are detected by exact hash for idempotency; rejections and other hashes are not", async () => {
  const p = await buildWriteProposal(base);
  assert.ok(p);
  const approved = writeDecisionNote(p.displayName, { decision: "approved", inputHash: p.inputHash, detail: "1.2 KB" });
  const rejected = writeDecisionNote(p.displayName, { decision: "rejected", inputHash: p.inputHash });
  const failed = writeDecisionNote(p.displayName, { decision: "failed", inputHash: p.inputHash, detail: "HTTP 500" });
  assert.equal(hasApprovedWrite([{ author: "system", text: approved }], p.inputHash), true);
  assert.equal(hasApprovedWrite([{ author: "system", text: rejected }], p.inputHash), false);
  assert.equal(hasApprovedWrite([{ author: "system", text: failed }], p.inputHash), false);
  assert.equal(hasApprovedWrite([{ author: "user", text: approved }], p.inputHash), false);
  assert.equal(hasApprovedWrite([{ author: "system", text: approved }], "f".repeat(64)), false);
  assert.equal(hasApprovedWrite(undefined, p.inputHash), false);
});
