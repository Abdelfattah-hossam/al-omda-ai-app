import assert from "node:assert/strict";
import test from "node:test";
import { validateMessages } from "./chat-history.js";

test("persists presentation, source, and sanitized agent execution warnings", () => {
  const messages = validateMessages([{
    role: "assistant",
    content: "Some tools failed; see the warning.",
    provider: "Local Agent",
    toolExecutionStatus: "with_warnings",
    toolFailures: [{ callId: "read-1", tool: "files.read", message: "ENOENT: file not found" }],
    presentationData: { title: "Quarterly plan", slides: [{ title: "Overview", bullets: ["Revenue", "Costs"], notes: "Check assumptions" }] },
    sourceData: { title: "Source code", name: "al-omda-source.ts", language: "typescript", code: "export const ok = true;" },
  }]);
  assert.ok(messages);
  assert.equal(messages[0].toolExecutionStatus, "with_warnings");
  assert.equal(messages[0].toolFailures?.[0].tool, "files.read");
  assert.equal(messages[0].presentationData?.slides[0].title, "Overview");
  assert.equal(messages[0].sourceData?.name, "al-omda-source.ts");
});

test("rejects malformed or oversized tool warnings and unsafe source filenames", () => {
  assert.equal(validateMessages([{
    role: "assistant", content: "warning",
    toolExecutionStatus: "success",
  }]), null);
  assert.equal(validateMessages([{
    role: "assistant", content: "warning",
    toolFailures: Array.from({ length: 21 }, (_, index) => ({ callId: String(index), tool: "files.read", message: "failed" })),
  }]), null);
  assert.equal(validateMessages([{
    role: "assistant", content: "source",
    sourceData: { title: "Source", name: "../secret.ts", language: "typescript", code: "x" },
  }]), null);
});

test("preserves numeric spreadsheet cells, formulas, and multiple sheets", () => {
  const messages = validateMessages([{
    role: "assistant", content: "Workbook",
    spreadsheetData: {
      title: "Budget",
      columns: ["Item", "Amount"],
      rows: [["Rent", 1200], ["Paid", true]],
      formulas: { B3: "=SUM(B1:B2)" },
      sheets: [{ name: "Summary", columns: ["Metric", "Value"], rows: [["Total", 1200]], formulas: { B2: "=SUM(B1:B1)" } }],
    },
  }]);
  assert.ok(messages);
  assert.equal(messages[0].spreadsheetData?.rows[0][1], 1200);
  assert.equal(messages[0].spreadsheetData?.formulas?.B3, "=SUM(B1:B2)");
  assert.equal(messages[0].spreadsheetData?.sheets?.[0].name, "Summary");
});
