import assert from "node:assert/strict";
import test from "node:test";
import { isSalesCsvAssetName, parseSalesCsv } from "./sales-csv.js";
import {formatSalesCsvError} from './sales-csv-messages.js';

test("isSalesCsvAssetName accepts plain and UUID-prefixed sales CSV names", () => {
  assert.equal(isSalesCsvAssetName("sales-november.csv"), true);
  assert.equal(isSalesCsvAssetName("ab6b1343-0ca1-4f10-9f91-e0b11928cdc4-sales-qa-check.csv"), true);
  assert.equal(isSalesCsvAssetName("SALES-REPORT.CSV"), true);
  assert.equal(isSalesCsvAssetName("sales-november.xlsx"), false);
  assert.equal(isSalesCsvAssetName("notes.csv"), false);
  assert.equal(isSalesCsvAssetName("sales.csv"), false);
  assert.equal(isSalesCsvAssetName("mysales-report.csv"), false);
});

test("parseSalesCsv parses a valid export and reports row errors", () => {
  const result = parseSalesCsv("date,amount,currency,status,channel,reference\n2026-11-20,150.00,AED,paid,Website,QA-001\n2026-11-21,40.00,AED,refunded,Store,QA-002\n");
  assert.equal(result.errors.length, 0);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].amount, 150);
  assert.equal(result.rows[1].status, "refunded");
  const bad = parseSalesCsv("date,amount,currency,status,channel,reference\nnot-a-date,abc,AED,paid,X,R1\n");
  assert.equal(bad.rows.length, 0);
  assert.ok(bad.errors.length > 0);
});

test('sales CSV errors have Arabic display messages without weakening validation',()=>{
 const cases=[
  'x'.repeat(2*1024*1024+1),
  'date,amount,currency,status\n"2026-11-22,1,AED,paid',
  'date,amount,currency,status',
  'date,amount\n2026-11-22,1',
  'date,amount,currency,status\n2026-11-22,1,AED',
  'date,amount,currency,status\nbad,abc,FAKE,unknown',
 ];
 for(const csv of cases){const result=parseSalesCsv(csv);assert.equal(result.rows.length,0);assert.ok(result.errors.length);for(const error of result.errors){const label=formatSalesCsvError(error.message,'ar');assert.match(label,/[\u0600-\u06ff]/);assert.doesNotMatch(label,/must be|exceeds|contains|Column count/);assert.equal(formatSalesCsvError(error.message,'en'),error.message);}}
 const limit=parseSalesCsv('date,amount,currency,status\n2026-11-22,1,AED,paid',0);
 assert.match(formatSalesCsvError(limit.errors[0].message,'ar'),/0 صف/);
 const combined=formatSalesCsvError(parseSalesCsv(cases[5]).errors[0].message,'ar');
 for(const term of ['التاريخ','المبلغ','العملة','الحالة'])assert.ok(combined.includes(term));
 assert.match(formatSalesCsvError('Unexpected future error','ar'),/تحقق/);
 assert.ok(formatSalesCsvError('Missing required columns: currency, status','ar').endsWith('currency, status'));
});
