import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error SheetJS ships types for its package entry, not its ESM subpath.
import * as XLSX from 'xlsx/xlsx.mjs';
import { ensureWorkbookRecalculation } from './office-workbook-recalculation';

test('recalculation settings are present in actual ZIP bytes and formulas survive', () => {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([['القيمة'], [10], [20], [30]]);
  sheet.A4 = { t: 'n', v: 30, f: 'SUM(A2:A3)' };
  XLSX.utils.book_append_sheet(book, sheet, 'بيانات');
  book.Workbook = { CalcPr: { calcMode: 'auto', fullCalcOnLoad: true } };
  const raw = XLSX.write(book, { bookType: 'xlsx', type: 'array' });
  const oldArchive = XLSX.CFB.read(new Uint8Array(raw), { type: 'array' });
  assert.doesNotMatch(new TextDecoder().decode(XLSX.CFB.find(oldArchive, '/xl/workbook.xml').content), /<calcPr/);
  const bytes = ensureWorkbookRecalculation(raw, XLSX.CFB);
  const archive = XLSX.CFB.read(bytes, { type: 'array' });
  const xml = new TextDecoder().decode(XLSX.CFB.find(archive, '/xl/workbook.xml').content);
  assert.match(xml, /<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"\/>/);
  const result = XLSX.read(bytes, { type: 'array' });
  assert.equal(result.Sheets['بيانات'].A2.v, 10);
  assert.equal(result.Sheets['بيانات'].A3.v, 20);
  assert.equal(result.Sheets['بيانات'].A4.f, 'SUM(A2:A3)');
  assert.equal(result.Sheets['بيانات'].A4.v, 30);
  const twice = ensureWorkbookRecalculation(bytes, XLSX.CFB);
  const repeated = XLSX.CFB.read(twice, { type: 'array' });
  assert.equal((new TextDecoder().decode(XLSX.CFB.find(repeated, '/xl/workbook.xml').content).match(/<calcPr/g) || []).length, 1);
});
