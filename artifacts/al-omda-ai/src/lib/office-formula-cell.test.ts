import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { buildFormulaWorksheetCell } from "./office-formula-cell";

function roundTripCell(cell: Record<string, unknown>) {
  const worksheet = XLSX.utils.aoa_to_sheet([["البند", "القيمة"], ["إجمالي المصروفات", 5000]]);
  worksheet["B2"] = cell;
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "الملخص");
  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const roundTrip = XLSX.read(bytes, { type: "array", cellFormula: true });
  return roundTrip.Sheets["الملخص"]?.["B2"];
}

test("formula cell keeps the model's cached value through the XLSX round trip", () => {
  const cell = buildFormulaWorksheetCell({ t: "n", v: 5000 }, "SUM(المصروفات!B2:B6)");
  const result = roundTripCell(cell as Record<string, unknown>);
  assert.ok(result, "formula cell must survive the round trip");
  assert.equal(result.f, "SUM(المصروفات!B2:B6)");
  assert.ok(Object.is(result.v, 5000), "cached value must be preserved");
});

test("formula cell without a model value still survives the round trip", () => {
  const cell = buildFormulaWorksheetCell(undefined, "SUM(A1:A5)");
  assert.equal(cell.t, "str");
  assert.equal(cell.v, "");
  const result = roundTripCell(cell as Record<string, unknown>);
  assert.ok(result, "placeholder cell must survive the round trip");
  assert.equal(result.f, "SUM(A1:A5)");
});

test("an empty model value is replaced by the placeholder, not dropped", () => {
  const cell = buildFormulaWorksheetCell({ t: "s", v: "" }, "SUM(A1:A5)");
  assert.equal(cell.v, "");
  const result = roundTripCell(cell as Record<string, unknown>);
  assert.ok(result);
  assert.equal(result.f, "SUM(A1:A5)");
});

test("bare formula-only cells used to vanish; the helper never produces one", () => {
  const bare = roundTripCell({ f: "SUM(A1:A5)" });
  assert.equal(bare, undefined, "documents the original bug: { f } alone is dropped by XLSX.write");
});
