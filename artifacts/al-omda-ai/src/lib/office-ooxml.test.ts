import assert from "node:assert/strict";
import test from "node:test";
import { createDocxBlob, createPptxBlob, createXlsxBlob } from "./office-ooxml.js";
async function readStoredZip(blob: Blob): Promise<Record<string, string>> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const entries: Record<string, string> = {};
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    assert.equal(method, 0);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    entries[name] = decoder.decode(bytes.subarray(dataStart, dataStart + size));
    offset = dataStart + size;
  }
  return entries;
}


test("creates a real DOCX with Arabic text and a multi-column table", async () => {
  const blob = createDocxBlob({
    title: "تقرير المشروع",
    paragraphs: ["ملخص التنفيذ", "النتائج والخطوات التالية"],
    columns: ["المهمة", "المسؤول", "الحالة"],
    rows: [["التصميم", "الفريق", "مكتمل"]],
  });
  assert.equal(blob.type, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  const entries = await readStoredZip(blob);
  assert.match(entries["word/document.xml"], /تقرير المشروع/);
  assert.match(entries["word/document.xml"], /المسؤول/);
  assert.match(entries["word/document.xml"], /مكتمل/);
});

test("creates a real XLSX workbook with multiple sheets and formulas", async () => {
  const blob = createXlsxBlob({
    title: "المبيعات",
    columns: ["البند", "القيمة"],
    rows: [["إجمالي", 12]],
    sheets: [
      { name: "ملخص", columns: ["البند", "القيمة"], rows: [["إجمالي", 12]], formulas: { B2: "=SUM(B3:B4)" } },
      { name: "التفاصيل", columns: ["المنتج", "العدد"], rows: [["منتج أ", 5], ["منتج ب", 7]] },
    ],
  });
  assert.equal(blob.type, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  const entries = await readStoredZip(blob);
  assert.match(entries["xl/workbook.xml"], /ملخص/);
  assert.match(entries["xl/workbook.xml"], /التفاصيل/);
  assert.match(entries["xl/worksheets/sheet2.xml"], /منتج أ/);
  assert.match(entries["xl/worksheets/sheet1.xml"], /<f>SUM\(B3:B4\)<\/f>/);
});

test("removes XML 1.0 control characters from Office text", async () => {
  const blob = createDocxBlob({ title: "Report\u0000", paragraphs: ["Safe\u0001text"], columns: [], rows: [] });
  const entries = await readStoredZip(blob);
  assert.doesNotMatch(entries["word/document.xml"], /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
  assert.match(entries["word/document.xml"], /Report/);
});

test("rejects dangerous Excel formula functions and external workbook references", () => {
  for (const formula of ['=WEBSERVICE("https://example.com")', '=HYPERLINK("https://example.com","open")', "=DDE(\\\"cmd\\\",\\\"/c calc\\\",\\\"\\\")", "='[other.xlsx]Sheet1'!A1", "=cmd|' /C calc'!A0"]) {
    assert.throws(() => createXlsxBlob({
      title: "Unsafe",
      columns: ["Value"],
      rows: [[1]],
      formulas: { A2: formula },
    }), /Unsafe Excel formula rejected/);
  }
});

test("creates an editable PowerPoint with the requested slide count and RTL text", async () => {
  const blob = createPptxBlob({
    title: "خطة العمل",
    slides: [
      { title: "الهدف", bullets: ["تحديد الأولويات", "توزيع المسؤوليات"] },
      { title: "التنفيذ", bullets: ["بناء المنتج", "اختبار الجودة"] },
      { title: "النتائج", bullets: ["إطلاق النسخة", "قياس الأداء"] },
    ],
  });
  assert.equal(blob.type, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  const signature = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  assert.deepEqual([...signature], [0x50, 0x4b, 0x03, 0x04]);
  const entries = await readStoredZip(blob);
  assert.match(entries["ppt/presentation.xml"], /<p:sldId /);
  assert.match(entries["ppt/slides/slide1.xml"], /الهدف/);
  assert.match(entries["ppt/slides/slide1.xml"], /توزيع المسؤوليات/);
  assert.match(entries["ppt/slides/slide3.xml"], /النتائج/);
});

test("rejects malformed PowerPoint data instead of creating a broken file", () => {
  assert.throws(() => createPptxBlob({ title: "Invalid", slides: [{ title: "Only one", bullets: ["Bullet"] }] }));
});
