import test from "node:test";
import assert from "node:assert/strict";
import { assemblePdfFromJpegPages, computeColumnWidths } from "./table-pdf";

const fakeJpeg = (n: number) => new Uint8Array(Array.from({ length: n }, (_, i) => (i * 7) % 256));

test("PDF structure: header, page count, xref offsets point at the right objects", () => {
  const pdf = assemblePdfFromJpegPages([
    { jpeg: fakeJpeg(300), width: 1488, height: 2105 },
    { jpeg: fakeJpeg(120), width: 1488, height: 2105 },
  ]);
  const text = Buffer.from(pdf).toString("latin1");
  assert.ok(text.startsWith("%PDF-1.4"));
  assert.ok(text.trimEnd().endsWith("%%EOF"));
  assert.match(text, /\/Count 2 /);
  const xrefAt = Number(text.match(/startxref\n(\d+)\n/)![1]);
  assert.ok(text.slice(xrefAt).startsWith("xref\n0 9\n"));
  const entries = text.slice(xrefAt).split("\n").slice(2, 2 + 9);
  assert.equal(entries[0], "0000000000 65535 f ");
  for (let id = 1; id <= 8; id += 1) {
    const offset = Number(entries[id].slice(0, 10));
    assert.ok(text.slice(offset).startsWith(id + " 0 obj\n"), "object " + id + " offset");
  }
  // Declared stream lengths match the image bytes.
  assert.match(text, /\/Filter \/DCTDecode \/Length 300 >>/);
  assert.match(text, /\/Filter \/DCTDecode \/Length 120 >>/);
});

test("PDF needs at least one page", () => {
  assert.throws(() => assemblePdfFromJpegPages([]));
});

test("column widths always fill the table and respect minimums when content is wide", () => {
  const filled = computeColumnWidths([100, 200], [50, 50], 600);
  assert.ok(Math.abs(filled.reduce((a, b) => a + b, 0) - 600) < 1e-6);
  assert.ok(filled[1] > filled[0]);
  const wide = computeColumnWidths([600, 600], [100, 100], 500);
  assert.ok(Math.abs(wide.reduce((a, b) => a + b, 0) - 500) < 1e-6);
  assert.ok(wide.every((width) => width >= 100));
  const tight = computeColumnWidths([900, 100], [300, 80], 500);
  assert.ok(tight[0] > tight[1] && tight[1] >= 80);
});
