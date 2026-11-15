import test from "node:test";
import assert from "node:assert/strict";
import { validateOoxmlPackage } from "./ooxml-validation.js";

const encoder = new TextEncoder();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(files: Array<[string, string]>): Blob {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let localOffset = 0;
  const u16 = (view: DataView, offset: number, value: number) => view.setUint16(offset, value, true);
  const u32 = (view: DataView, offset: number, value: number) => view.setUint32(offset, value, true);
  for (const [name, text] of files) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(text);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0); u16(lv, 8, 0);
    u32(lv, 14, crc); u32(lv, 18, data.length); u32(lv, 22, data.length);
    u16(lv, 26, nameBytes.length); u16(lv, 28, 0);
    local.set(nameBytes, 30); local.set(data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20); u16(cv, 8, 0); u16(cv, 10, 0);
    u32(cv, 16, crc); u32(cv, 20, data.length); u32(cv, 24, data.length);
    u16(cv, 28, nameBytes.length); u16(cv, 30, 0); u16(cv, 32, 0); u32(cv, 42, localOffset);
    central.set(nameBytes, 46); centrals.push(central);
    localOffset += local.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  u32(ev, 0, 0x06054b50); u16(ev, 8, files.length); u16(ev, 10, files.length);
  u32(ev, 12, centralSize); u32(ev, 16, localOffset);
  return new Blob([...locals, ...centrals, end], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

const contentTypes = '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>';
const rootRels = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="word/document.xml"/></Relationships>';

test("validates Word package XML and confirms generated text and table cells", async () => {
  const files: Array<[string, string]> = [
    ["[Content_Types].xml", contentTypes], ["_rels/.rels", rootRels],
    ["word/document.xml", '<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Project report</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:t>Task</w:t></w:tc><w:tc><w:t>Owner</w:t></w:tc></w:tr><w:tr><w:tc><w:t>Design</w:t></w:tc><w:tc><w:t>Team A</w:t></w:tc></w:tr></w:tbl></w:body></w:document>'],
    ["word/styles.xml", '<w:styles xmlns:w="w"/>'],
    ["word/_rels/document.xml.rels", '<Relationships xmlns="r"><Relationship Id="rId1" Target="styles.xml"/></Relationships>'],
    ["word/header1.xml", '<w:hdr xmlns:w="w"><w:p><w:r><w:t>Header title</w:t></w:r></w:p></w:hdr>'],
    ["word/footer1.xml", '<w:ftr xmlns:w="w"><w:p><w:r><w:t>Page</w:t></w:r></w:p></w:ftr>'],
  ];
  const result = await validateOoxmlPackage(zip(files), {
    requiredEntries: ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/header1.xml", "word/footer1.xml"],
    expectedText: ["Project report", "Task", "Owner", "Design", "Team A", "Header title"],
  });
  assert.equal(result, true);
});

test("rejects missing expected text and malformed XML despite valid ZIP structure", async () => {
  const files: Array<[string, string]> = [
    ["[Content_Types].xml", contentTypes], ["_rels/.rels", rootRels],
    ["word/document.xml", '<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Actual text</w:t></w:r></w:p></w:body></w:document>'],
    ["word/styles.xml", '<w:styles xmlns:w="w"/>'],
    ["word/header1.xml", '<w:hdr xmlns:w="w"/>'], ["word/footer1.xml", '<w:ftr xmlns:w="w"/>'],
  ];
  const options = { requiredEntries: ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/header1.xml", "word/footer1.xml"] };
  assert.equal(await validateOoxmlPackage(zip(files), { ...options, expectedText: ["Not in document"] }), false);
  files[2] = ["word/document.xml", '<w:document><w:body><w:p></w:body></w:document>'];
  assert.equal(await validateOoxmlPackage(zip(files), options), false);
});

test("validates PowerPoint slide and notes counts and text payload", async () => {
  const files: Array<[string, string]> = [
    ["[Content_Types].xml", contentTypes], ["_rels/.rels", '<Relationships xmlns="r"><Relationship Id="rId1" Target="ppt/presentation.xml"/></Relationships>'],
    ["ppt/presentation.xml", '<p:presentation xmlns:p="p"/>'],
    ["ppt/_rels/presentation.xml.rels", '<Relationships xmlns="r"/>'],
    ["ppt/slides/slide1.xml", '<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><a:t>Quarterly results</a:t><a:t>Revenue increased</a:t></p:cSld></p:sld>'],
    ["ppt/notesSlides/notesSlide1.xml", '<p:notes xmlns:p="p" xmlns:a="a"><a:t>Discuss forecast</a:t></p:notes>'],
  ];
  assert.equal(await validateOoxmlPackage(zip(files), {
    requiredEntries: ["[Content_Types].xml", "_rels/.rels", "ppt/presentation.xml", "ppt/_rels/presentation.xml.rels"],
    expectedSlideCount: 1, expectedNotesCount: 1,
    expectedText: ["Quarterly results", "Revenue increased", "Discuss forecast"],
  }), true);
  assert.equal(await validateOoxmlPackage(zip(files), {
    requiredEntries: ["[Content_Types].xml", "_rels/.rels", "ppt/presentation.xml", "ppt/_rels/presentation.xml.rels"],
    expectedSlideCount: 2, expectedNotesCount: 1,
  }), false);
});

test("rejects duplicate ZIP paths and path traversal entries", async () => {
  const files: Array<[string, string]> = [
    ["[Content_Types].xml", contentTypes], ["_rels/.rels", rootRels],
    ["word/document.xml", "<w:document><w:body/></w:document>"],
    ["word/document.xml", "<w:document><w:body/></w:document>"],
  ];
  const options = { requiredEntries: ["[Content_Types].xml", "_rels/.rels", "word/document.xml"] };
  assert.equal(await validateOoxmlPackage(zip(files), options), false);
  files.pop(); files.push(["../evil.xml", "<x/>"]);
  assert.equal(await validateOoxmlPackage(zip(files), options), false);
});

test("rejects internal relationships that point to missing package parts", async () => {
  const files: Array<[string, string]> = [
    ["[Content_Types].xml", contentTypes], ["_rels/.rels", rootRels],
    ["word/document.xml", '<w:document xmlns:w="w"><w:body/></w:document>'],
    ["word/styles.xml", '<w:styles xmlns:w="w"/>'],
    ["word/header1.xml", '<w:hdr xmlns:w="w"/>'], ["word/footer1.xml", '<w:ftr xmlns:w="w"/>'],
    ["word/_rels/document.xml.rels", '<Relationships xmlns="r"><Relationship Id="rId1" Target="missing.xml"/></Relationships>'],
  ];
  assert.equal(await validateOoxmlPackage(zip(files), {
    requiredEntries: ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/header1.xml", "word/footer1.xml"],
  }), false);
});
