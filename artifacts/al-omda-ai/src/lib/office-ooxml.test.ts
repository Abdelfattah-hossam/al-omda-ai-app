import assert from "node:assert/strict";
import test from "node:test";
import { createDocxBlob, createPptxBlob, createXlsxBlob } from "./office-ooxml.js";

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

test("rejects dangerous Excel formula functions and external workbook references", () => {
  for (const formula of ['=WEBSERVICE("https://example.com")', '=HYPERLINK("https://example.com","open")', "=DDE(\\\"cmd\\\",\\\"/c calc\\\",\\\"\\\")", "='[other.xlsx]Sheet1'!A1"]) {
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
