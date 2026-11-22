import test from "node:test";
import assert from "node:assert/strict";
import { EXCEL_DATA_INTEGRITY_RULES, parseExcelWorkbook } from "./excel-workbook.js";

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

test("pads short rows with blank cells instead of rejecting the workbook", () => {
  const value = { title: "Repaired", sheets: [{ name: "Data", columns: ["A", "B", "C"], rows: [["only one"], []] }] };
  const result = parseExcelWorkbook(json(value));
  assert.deepEqual(result?.sheets?.[0].rows, [["only one", "", ""], ["", "", ""]]);
});

test("rejects rows wider than the column count", () => {
  const value = { title: "Bad", sheets: [{ name: "Data", columns: ["A", "B"], rows: [["one", "two", "three"]] }] };
  assert.equal(parseExcelWorkbook(json(value)), null);
});

test("accepts formulas that reference non-ASCII sheet names", () => {
  const value = {
    title: "مبيعات",
    sheets: [
      { name: "الملخص", columns: ["البند", "القيمة"], rows: [["إجمالي", ""]], formulas: { B2: "SUM('البيانات'!A1:A2)" } },
      { name: "البيانات", columns: ["المبلغ"], rows: [[100], [200]] }
    ]
  };
  const result = parseExcelWorkbook(json(value));
  assert.equal(result?.sheets?.[0].formulas?.B2, "SUM('البيانات'!A1:A2)");
});

test("still rejects dangerous formulas with unicode characters nearby", () => {
  const value = { title: "Bad", sheets: [{ name: "Data", columns: ["A"], rows: [["1"]], formulas: { A2: "WEBSERVICE('الرابط'!A1)" } }] };
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


test("rejects duplicate formula addresses with different letter casing", () => {
  const value = {
    title: "Bad",
    sheets: [{ name: "Data", columns: ["Amount"], rows: [[""]], formulas: { A2: "SUM(A1:A1)", a2: "SUM(A1:A1)" } }]
  };
  assert.equal(parseExcelWorkbook(json(value)), null);
});

test("rejects oversized workbook payloads before parsing", () => {
  assert.equal(parseExcelWorkbook(" ".repeat(1_000_001)), null);
});


test("provides strict shared data-provenance rules for every Excel generation path", () => {
  assert.match(EXCEL_DATA_INTEGRITY_RULES, /NEVER invent or guess customer names/);
  assert.match(EXCEL_DATA_INTEGRITY_RULES, /A schema example is not customer data/);
  assert.match(EXCEL_DATA_INTEGRITY_RULES, /leave every unknown data cell blank/);
  assert.match(EXCEL_DATA_INTEGRITY_RULES, /only when the customer explicitly asks for sample/);
});

test("accepts a genuinely blank template without filling invented records", () => {
  const result = parseExcelWorkbook(json({
    title: "Customer Register",
    sheets: [{ name: "Customers", columns: ["Customer name", "Phone", "Email"], rows: [["", "", ""]] }]
  }));
  assert.deepEqual(result?.rows, [["", "", ""]]);
  assert.deepEqual(result?.sheets?.[0].rows, [["", "", ""]]);
});


test("rejects formulas overwriting the header row", () => {
  const bad = { title: "QA", sheets: [{ name: "ملخص", columns: ["المجموع"], rows: [[""]], formulas: { A1: "SUM(بيانات!B2:B3)" } }] };
  assert.equal(parseExcelWorkbook(json(bad)), null);
  const good = { title: "QA", sheets: [{ name: "ملخص", columns: ["المجموع"], rows: [[30]], formulas: { A2: "SUM(بيانات!B2:B3)" } }] };
  const parsed = parseExcelWorkbook(json(good));
  assert.equal(parsed?.sheets?.[0].columns[0], "المجموع");
  assert.equal(parsed?.sheets?.[0].formulas?.A2, "SUM(بيانات!B2:B3)");
  assert.equal(parsed?.sheets?.[0].rows[0][0], 30);
});
