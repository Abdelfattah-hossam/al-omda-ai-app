import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import test from "node:test";
import { extractDocxText, extractPptxText, extractXlsxText, officeKindFromMime, readZipEntries } from "./office-reader.js";

/** Minimal zip writer for tests: one entry per file, stored or deflate. */
function buildZip(files: Array<{ name: string; content: string; deflate?: boolean }>): Buffer {
  const encoder = new TextEncoder();
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf-8");
    const raw = Buffer.from(encoder.encode(file.content));
    const data = file.deflate ? deflateRawSync(raw) : raw;
    const method = file.deflate ? 8 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, name, data);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(method, 10);
    directory.writeUInt32LE(0, 14);
    directory.writeUInt32LE(data.length, 20);
    directory.writeUInt32LE(raw.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(0, 38);
    directory.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([directory, name]));
    offset += 30 + name.length + data.length;
  }
  const centralStart = offset;
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralStart, 16);
  return Buffer.concat([...parts, ...central, end]);
}

test("readZipEntries reads stored and deflate entries", () => {
  const zip = buildZip([
    { name: "a.txt", content: "hello" },
    { name: "b.txt", content: "world ".repeat(50), deflate: true },
  ]);
  const entries = readZipEntries(zip);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].data.toString(), "hello");
  assert.equal(entries[1].data.toString(), "world ".repeat(50));
});

test("readZipEntries rejects non-zip buffers", () => {
  assert.throws(() => readZipEntries(Buffer.from("not a zip at all, definitely")), /zip/);
});

test("extractDocxText joins paragraph runs and decodes entities", () => {
  const docx = buildZip([{
    name: "word/document.xml",
    content: '<w:document><w:body><w:p><w:r><w:t>الفقرة الأولى</w:t></w:r><w:r><w:t> مع نص &amp; رموز</w:t></w:r></w:p><w:p><w:r><w:t>Second line</w:t></w:r></w:p></w:body></w:document>',
  }]);
  const text = extractDocxText(docx);
  assert.ok(text.includes("الفقرة الأولى مع نص & رموز"));
  assert.ok(text.includes("Second line"));
});

test("extractXlsxText resolves shared strings and keeps row order", () => {
  const xlsx = buildZip([
    { name: "xl/workbook.xml", content: '<workbook><sheets><sheet name="المبيعات" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { name: "xl/sharedStrings.xml", content: '<sst><si><t>name</t></si><si><t>alpha</t></si><si><t>beta</t></si></sst>' },
    {
      name: "xl/worksheets/sheet1.xml",
      content: '<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row><c r="A2" t="s"><v>2</v></c><c r="B2"><v>25</v></c></row></sheetData></worksheet>',
      deflate: true,
    },
  ]);
  const text = extractXlsxText(xlsx);
  // Exact lines, not substrings: a wrapper tag such as <sst> must never leak
  // into extracted values (regression: the run pattern matched <sst> as a
  // prefix-less text run).
  assert.equal(text, "Sheet: المبيعات\nname,alpha\nbeta,25");
});

test("extractPptxText extracts slide runs in slide order", () => {
  const pptx = buildZip([
    { name: "ppt/slides/slide2.xml", content: '<p:sld><a:t>الشريحة الثانية</a:t></p:sld>' },
    { name: "ppt/slides/slide1.xml", content: '<p:sld><a:t>الشريحة الأولى</a:t><a:t>عنوان فرعي</a:t></p:sld>' },
  ]);
  const text = extractPptxText(pptx);
  assert.ok(text.indexOf("Slide 1:\nالشريحة الأولى\nعنوان فرعي") < text.indexOf("Slide 2:\nالشريحة الثانية"));
});

test("officeKindFromMime maps OOXML types only", () => {
  assert.equal(officeKindFromMime("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), "xlsx");
  assert.equal(officeKindFromMime("application/vnd.openxmlformats-officedocument.wordprocessingml.document"), "docx");
  assert.equal(officeKindFromMime("application/vnd.openxmlformats-officedocument.presentationml.presentation"), "pptx");
  assert.equal(officeKindFromMime("text/csv"), null);
  assert.equal(officeKindFromMime(null), null);
});
