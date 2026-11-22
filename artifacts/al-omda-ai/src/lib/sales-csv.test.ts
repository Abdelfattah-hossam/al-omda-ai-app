import assert from "node:assert/strict";
import test from "node:test";
import { isSalesCsvAssetName, parseSalesCsv } from "./sales-csv.js";

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
