import test from "node:test";
import assert from "node:assert/strict";
import { parseSalesCsv } from "../../artifacts/al-omda-ai/src/lib/sales-csv.js";

test("parses valid sales rows, quoted channels, and aliases", () => {
  const result = parseSalesCsv('transaction_date,total,currency_code,payment_status,source,order_id\n2026-11-01,125.50,AED,paid,"Web, UAE",A-1\n2026-11-02,25,AED,refunded,Store,A-2');
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].channel, "Web, UAE");
  assert.equal(result.rows[0].amount, 125.5);
  assert.equal(result.rows[1].status, "refunded");
});

test("rejects missing required columns and invalid calendar dates", () => {
  const missing = parseSalesCsv("date,amount\n2026-11-01,10");
  assert.match(missing.errors[0].message, /Missing required columns/);
  const invalid = parseSalesCsv("date,amount,currency,status\n2026-02-30,10,AED,paid");
  assert.match(invalid.errors[0].message, /real ISO date/);
  const unsupported = parseSalesCsv("date,amount,currency,status\n2026-11-01,10,ZZZ,paid");
  assert.match(unsupported.errors[0].message, /supported 3-letter ISO code/);
});

test("rejects unsupported statuses, malformed row widths, and negative amounts", () => {
  const result = parseSalesCsv("date,amount,currency,status\n2026-11-01,-1,AED,paid\n2026-11-02,2,AED,unknown,extra");
  assert.equal(result.errors.length, 2);
});

test("enforces row and file limits", () => {
  assert.match(parseSalesCsv("date,amount,currency,status\n2026-11-01,1,AED,paid", 0).errors[0].message, /row limit/);
  assert.match(parseSalesCsv("x".repeat(2 * 1024 * 1024 + 1)).errors[0].message, /2 MB/);
});

test("handles quoted commas, escaped quotes, and CRLF line endings", () => {
  const result = parseSalesCsv('date,amount,currency,status,channel\r\n2026-11-01,5,AED,paid,"Shop ""A"", UAE"\r\n');
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows[0].channel, 'Shop "A", UAE');
});
