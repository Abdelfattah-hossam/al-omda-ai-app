import assert from "node:assert/strict";
import test from "node:test";
import { createDocxBlob, createPptxBlob, createXlsxBlob } from "./office-ooxml.js";
import { previewOfficeDocument } from "./office-preview.js";

test("creates a real DOCX with Arabic text and a multi-column table", async () => {
  const blob = createDocxBlob({
    title: "تقرير المشروع",
    paragraphs: ["ملخص التنفيذ", "النتائج والخطوات التالية"],
    columns: ["المهمة", "المسؤول", "الحالة"],
    rows: [["التصميم", "الفريق", "مكتمل"]],
  });
  assert.equal(blob.type, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  const text = await previewOfficeDocument(new File([blob], "report.docx"), "docx");
  assert.match(text, /تقرير المشروع/);
  assert.match(text, /المسؤول/);
  assert.match(text, /مكتمل/);
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
  const text = await previewOfficeDocument(new File([blob], "sales.xlsx"), "xlsx");
  assert.match(text, /ملخص/);
  assert.match(text, /التفاصيل/);
  assert.match(text, /منتج أ/);
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
  const text = await previewOfficeDocument(new File([blob], "plan.pptx"), "pptx");
  assert.match(text, /الهدف/);
  assert.match(text, /توزيع المسؤوليات/);
  assert.match(text, /النتائج/);
});

test("rejects malformed PowerPoint data instead of creating a broken file", () => {
  assert.throws(() => createPptxBlob({ title: "Invalid", slides: [{ title: "Only one", bullets: ["Bullet"] }] }));
});
