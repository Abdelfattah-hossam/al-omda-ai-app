import test from "node:test";
import assert from "node:assert/strict";
import { parseExcelWorkbook } from "./excel-workbook.js";

const valid = {
  title: "Budget",
  sheets: [
    { name: "Summary", columns: ["Item", "Amount"], rows: [["Rent", "1000"], ["Total", ""]], formulas: { B3: "SUM(B2:B2)" } },
    { name: "Transactions", columns: ["Date", "Item", "Amount"], rows: [["2026-01-01", "Rent", "1000"]] }
  ]
};
const json = (value: unknown) => JSON.stringify(value);

test("accepts multiple worksheets and keeps formulas", () => {
  const result = parseExcelWorkbook(json(valid));
  assert.equal(result?.sheets?.length, 2);
  assert.equal(result?.sheets?.[0].name, "Summary");
  assert.equal(result?.sheets?.[0].formulas?.B3, "SUM(B2:B2)");
  assert.equal(result?.columns[0], "Item");
});

test("preserves numeric and boolean values as typed Excel cells", () => {
  const result = parseExcelWorkbook(json({ title: "Typed", sheets: [{ name: "Data", columns: ["Amount", "Paid"], rows: [[125.5, true]] }] }));
  assert.equal(typeof result?.rows[0][0], "number");
  assert.equal(typeof result?.rows[0][1], "boolean");
});

test("supports the legacy single-sheet schema", () => {
  const result = parseExcelWorkbook(json({ title: "Old", columns: ["A"], rows: [["1"]] }));
  assert.equal(result?.sheets?.[0].name, "Sheet1");
  assert.equal(result?.rows[0][0], "1");
});

test("rejects duplicate worksheet names", () => {
  const value = { title: "Bad", sheets: [valid.sheets[0], { ...valid.sheets[1], name: "summary" }] };
  assert.equal(parseExcelWorkbook(json(value)), null);
});

test("rejects mismatched row widths", () => {
  const value = { title: "Bad", sheets: [{ name: "Data", columns: ["A", "B"], rows: [["only one"]] }] };
  assert.equal(parseExcelWorkbook(json(value)), null);
});

test("rejects formulas that reference external workbook syntax", () => {
  const value = { title: "Bad", sheets: [{ name: "Data", columns: ["A"], rows: [[""]], formulas: { A2: "SUM([Other.xlsx]Sheet1!A1:A2)" } }] };
  assert.equal(parseExcelWorkbook(json(value)), null);
});

test("rejects dangerous external or dynamic formula functions", () => {
  const value = { title: "Bad", sheets: [{ name: "Data", columns: ["A"], rows: [[""]], formulas: { A2: "HYPERLINK(\"https://example.com\",\"click\")" } }] };
  assert.equal(parseExcelWorkbook(json(value)), null);
});

test("rejects formulas outside the declared sheet dimensions", () => {
  const value = { title: "Bad", sheets: [{ name: "Data", columns: ["A"], rows: [[""]], formulas: { C99: "SUM(A1:A2)" } }] };
  assert.equal(parseExcelWorkbook(json(value)), null);
});

test("rejects invalid Excel worksheet names", () => {
  const value = { title: "Bad", sheets: [{ name: "Bad/Name", columns: ["A"], rows: [["1"]] }] };
  assert.equal(parseExcelWorkbook(json(value)), null);
});

test("rejects unbalanced formulas", () => {
  const value = { title: "Bad", sheets: [{ name: "Data", columns: ["A"], rows: [[""]], formulas: { A2: "SUM(A1:A2" } }] };
  assert.equal(parseExcelWorkbook(json(value)), null);
});
