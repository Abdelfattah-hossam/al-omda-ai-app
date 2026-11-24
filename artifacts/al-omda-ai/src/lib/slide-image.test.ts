import assert from "node:assert/strict";
import test from "node:test";
import { createPptxBlob } from "./office-ooxml.js";
import { parsePresentationSize, parseSlideXml } from "./slide-image.js";

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
    const dataStart = offset + 30 + nameLength + extraLength;
    entries[decoder.decode(bytes.subarray(offset + 30, dataStart - extraLength))] = decoder.decode(bytes.subarray(dataStart, dataStart + size));
    offset = dataStart + size;
  }
  return entries;
}

test("parsePresentationSize reads the 16:9 slide size", async () => {
  const blob = createPptxBlob({
    title: "عرض",
    slides: [
      { title: "أ", bullets: ["نقطة"] },
      { title: "ب", bullets: ["نقطة"] },
      { title: "ج", bullets: ["نقطة"] },
    ],
  });
  const entries = await readStoredZip(blob);
  assert.deepEqual(parsePresentationSize(entries["ppt/presentation.xml"]), { cx: 12192000, cy: 6858000 });
  assert.deepEqual(parsePresentationSize("<p:presentation/>"), { cx: 12192000, cy: 6858000 });
});

test("parseSlideXml extracts positioned title, bullets and footer with styles", async () => {
  const blob = createPptxBlob({
    title: "تقرير الموقع",
    slides: [
      { title: "نظرة عامة", bullets: ["البند الأول", "البند الثاني"] },
      { title: "التفاصيل", bullets: ["بند"] },
      { title: "الخاتمة", bullets: ["بند"] },
    ],
  });
  const entries = await readStoredZip(blob);
  const slide = parseSlideXml(entries["ppt/slides/slide1.xml"]);
  assert.equal(slide.background, "#101722");
  assert.equal(slide.shapes.length, 3);

  const title = slide.shapes.find((shape) => shape.name === "Slide title");
  assert.ok(title);
  assert.deepEqual({ x: title.x, y: title.y, cx: title.cx, cy: title.cy }, { x: 500000, y: 350000, cx: 11200000, cy: 1050000 });
  assert.equal(title.paragraphs.length, 1);
  assert.equal(title.paragraphs[0].align, "r");
  assert.equal(title.paragraphs[0].rtl, true);
  assert.equal(title.paragraphs[0].runs[0].text, "نظرة عامة");
  assert.equal(title.paragraphs[0].runs[0].sizePt, 30);
  assert.equal(title.paragraphs[0].runs[0].bold, true);
  assert.equal(title.paragraphs[0].runs[0].color, "#D8B978");

  const content = slide.shapes.find((shape) => shape.name === "Slide content");
  assert.ok(content);
  assert.equal(content.paragraphs.length, 2);
  assert.equal(content.paragraphs[0].bullet, true);
  assert.equal(content.paragraphs[0].runs[0].text, "البند الأول");
  assert.equal(content.paragraphs[1].runs[0].text, "البند الثاني");
  assert.equal(content.paragraphs[0].runs[0].sizePt, 20);

  const footer = slide.shapes.find((shape) => shape.name === "Footer");
  assert.ok(footer);
  assert.equal(footer.paragraphs[0].align, "ctr");
  assert.equal(footer.paragraphs[0].runs[0].text, "Zahin  •  1");
});

test("parseSlideXml unescapes XML entities and skips empty shapes", async () => {
  const blob = createPptxBlob({
    title: "Q & A <Review>",
    slides: [
      { title: "A & B", bullets: ["5 < 6"] },
      { title: "C", bullets: ["بند"] },
      { title: "D", bullets: ["بند"] },
    ],
  });
  const entries = await readStoredZip(blob);
  const slide = parseSlideXml(entries["ppt/slides/slide1.xml"]);
  const title = slide.shapes.find((shape) => shape.name === "Slide title");
  assert.ok(title);
  assert.equal(title.paragraphs[0].runs[0].text, "A & B");
  const content = slide.shapes.find((shape) => shape.name === "Slide content");
  assert.ok(content);
  assert.equal(content.paragraphs[0].runs[0].text, "5 < 6");
  assert.equal(parseSlideXml("<p:sld><p:cSld><p:spTree/></p:cSld></p:sld>").shapes.length, 0);
});

test("parseSlideXml handles English left-aligned slides", async () => {
  const blob = createPptxBlob({
    title: "Site report",
    slides: [
      { title: "Overview", bullets: ["First point", "Second point"] },
      { title: "Details", bullets: ["Point"] },
      { title: "Close", bullets: ["Point"] },
    ],
  });
  const entries = await readStoredZip(blob);
  const slide = parseSlideXml(entries["ppt/slides/slide2.xml"]);
  const title = slide.shapes.find((shape) => shape.name === "Slide title");
  assert.ok(title);
  assert.equal(title.paragraphs[0].align, "l");
  assert.equal(title.paragraphs[0].rtl, false);
  assert.equal(title.paragraphs[0].runs[0].text, "Details");
});
