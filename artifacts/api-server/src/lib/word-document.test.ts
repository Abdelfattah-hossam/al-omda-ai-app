import test from "node:test";
import assert from "node:assert/strict";
import { parseWordDocument } from "./word-document.js";

const json = (value: unknown) => JSON.stringify(value);

test("parses a structured Word document with paragraphs and a table", () => {
  const result = parseWordDocument(json({
    title: "Project report",
    paragraphs: ["Introduction", { heading: "Scope", content: "The project covers three phases." }],
    columns: ["Task", "Owner"],
    rows: [["Design", "Team A"]],
  }), false, false, true);
  assert.equal(result?.title, "Project report");
  assert.deepEqual(result?.paragraphs, ["Introduction", "Scope\n\nThe project covers three phases."]);
  assert.deepEqual(result?.columns, ["Task", "Owner"]);
  assert.deepEqual(result?.rows, [["Design", "Team A"]]);
});

test("accepts plain prose fallback only for normal Word documents", () => {
  const prose = "# Project overview\n\nThis is a sufficiently long paragraph that should be preserved as a Word document when a provider returns prose instead of JSON.";
  const result = parseWordDocument(prose, false, false);
  assert.equal(result?.title, "Project overview");
  assert.equal(result?.paragraphs.length, 2);
  assert.equal(parseWordDocument(prose, true, false), null);
  assert.equal(parseWordDocument(prose, false, false, true), null);
});

test("accepts wrapped JSON and alternative document field names", () => {
  const result = parseWordDocument("Here is the document:\n" + json({
    name: "Meeting notes",
    body: "First paragraph.\n\nSecond paragraph.",
    table: { headers: ["Name", "Status"], rows: [{ Name: "A", Status: "Done" }] },
  }), false, false, true);
  assert.equal(result?.title, "Meeting notes");
  assert.deepEqual(result?.columns, ["Name", "Status"]);
  assert.deepEqual(result?.rows, [["A", "Done"]]);
});

test("enforces exactly seven columns when the request requires seven", () => {
  const seven = { title: "Form", columns: ["A", "B", "C", "D", "E", "F", "G"], rows: [["1", "2", "3", "4", "5", "6", "7"]] };
  assert.equal(parseWordDocument(json(seven), true, false, true)?.columns.length, 7);
  assert.equal(parseWordDocument(json({ ...seven, columns: seven.columns.slice(0, 6), rows: [["1", "2", "3", "4", "5", "6"]] }), true, false, true), null);
});

test("creates a blank eight-row table only for table-only requests", () => {
  const result = parseWordDocument(json({ title: "Blank form", columns: ["Name", "Date"], rows: [] }), false, true, true);
  assert.equal(result?.paragraphs.length, 0);
  assert.equal(result?.rows.length, 8);
  assert.deepEqual(result?.rows[0], ["", ""]);
});

test("rejects tables in prose-only mode and prose in table-only mode", () => {
  const table = json({ title: "Table", columns: ["A"], rows: [["1"]] });
  assert.equal(parseWordDocument(table, false, false), null);
  assert.equal(parseWordDocument(json({ title: "Empty", paragraphs: ["Text"], columns: [], rows: [] }), false, true), null);
});

test("rejects malformed, oversized, and structurally inconsistent documents", () => {
  assert.equal(parseWordDocument("{broken", false, false), null);
  assert.equal(parseWordDocument("x".repeat(70001), false, false), null);
  assert.equal(parseWordDocument(json({ title: "Bad", paragraphs: ["x".repeat(8001)] }), false, false), null);
  assert.equal(parseWordDocument(json({ title: "Bad", columns: Array.from({ length: 13 }, (_, i) => "C" + i), rows: [Array(13).fill("x")] }), false, false, true), null);
  assert.equal(parseWordDocument(json({ title: "Bad", columns: ["A", "B"], rows: [["only one"]] }), false, false, true), null);
  assert.equal(parseWordDocument(json({ title: "Bad", columns: ["A"], rows: [["x".repeat(2001)]] }), false, false, true), null);
});
