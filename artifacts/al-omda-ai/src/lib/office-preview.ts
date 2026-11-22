type ZipEntry = { name: string; method: number; compressedSize: number; uncompressedSize: number; localOffset: number; crc32: number };

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let value = n;
    for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

async function readZipEntry(bytes: Uint8Array, entry: ZipEntry): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = entry.localOffset;
  if (offset < 0 || offset + 30 > bytes.length || view.getUint32(offset, true) !== 0x04034b50) {
    throw new Error("Invalid Office archive entry.");
  }
  const flags = view.getUint16(offset + 6, true);
  const method = view.getUint16(offset + 8, true);
  const nameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const localName = new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + nameLength));
  if (localName !== entry.name || method !== entry.method || (flags & 1) !== 0) {
    throw new Error("Office archive entry metadata is inconsistent or encrypted.");
  }
  const start = offset + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > bytes.length) throw new Error("Office archive entry is truncated.");
  const compressed = bytes.slice(start, end);
  let output: Uint8Array;
  if (entry.method === 0) output = compressed;
  else if (entry.method === 8) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("This browser cannot preview compressed Office files. Download the file instead.");
    }
    try {
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat));
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > entry.uncompressedSize || total > 8 * 1024 * 1024) {
          await reader.cancel();
          throw new Error("Office preview content exceeds the safe size limit.");
        }
        chunks.push(value);
      }
      output = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        output.set(chunk, offset);
        offset += chunk.byteLength;
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("safe size limit")) throw error;
      throw new Error("This browser cannot decompress this Office file. Download it to preview in its native app.");
    }
  } else throw new Error("Unsupported Office compression method.");
  if (output.byteLength !== entry.uncompressedSize) throw new Error("Office archive entry is incomplete.");
  if (crc32(output) !== entry.crc32) throw new Error("Office archive entry failed its integrity check.");
  return new TextDecoder("utf-8").decode(output);
}

async function readZipEntries(file: Blob): Promise<Map<string, string>> {
  if (file.size > 25 * 1024 * 1024) throw new Error("Office preview is limited to 25 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = Math.max(0, bytes.length - 65557); i <= bytes.length - 22; i++) {
    if (view.getUint32(i, true) === 0x06054b50) end = i;
  }
  if (end < 0) throw new Error("This is not a valid Office document.");
  const count = view.getUint16(end + 10, true);
  const directoryOffset = view.getUint32(end + 16, true);
  const directorySize = view.getUint32(end + 12, true);
  if (directoryOffset + directorySize > end || directoryOffset > bytes.length) {
    throw new Error("Invalid Office archive directory bounds.");
  }
  const entries = new Map<string, string>();
  let expandedTotal = 0;
  let cursor = directoryOffset;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error("Invalid Office directory.");
    }
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const crc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const recordEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (recordEnd > directoryOffset + directorySize || recordEnd > bytes.length) {
      throw new Error("Invalid Office directory entry bounds.");
    }
    const name = new TextDecoder().decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    const wanted = name === "word/document.xml" || name === "xl/workbook.xml" ||
      name === "xl/_rels/workbook.xml.rels" || name === "xl/sharedStrings.xml" ||
      name === "ppt/presentation.xml" || name === "ppt/_rels/presentation.xml.rels" ||
      /^xl\/worksheets\/sheet\d+\.xml$/.test(name) ||
      /^ppt\/slides\/slide\d+\.xml$/.test(name);
    if (wanted) {
      expandedTotal += uncompressedSize;
      if (uncompressedSize > 8 * 1024 * 1024 || expandedTotal > 32 * 1024 * 1024) {
        throw new Error("Office preview content exceeds the safe size limit.");
      }
      if ((flags & 1) !== 0) throw new Error("Encrypted Office archives cannot be previewed.");
      const entry = { name, method, compressedSize, uncompressedSize, localOffset, crc32: crc };
      entries.set(name, await readZipEntry(bytes, entry));
    }
    cursor = recordEnd;
  }
  return entries;
}

function xmlDocument(source: string): Document {
  const parsed = new DOMParser().parseFromString(source, "application/xml");
  if (parsed.querySelector("parsererror")) throw new Error("The Office document contains invalid XML.");
  return parsed;
}

function textOf(node: Element): string {
  return Array.from(node.getElementsByTagNameNS("*", "t")).map(item => item.textContent ?? "").join("");
}

function resolvePackageTarget(baseDirectory: string, target: string): string | null {
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.includes("\\0")) return null;
  const absolutePackagePath = target.startsWith("/");
  const segments = absolutePackagePath ? [] : baseDirectory.split("/").filter(Boolean);
  for (const part of target.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!segments.length) return null;
      segments.pop();
    } else {
      segments.push(part);
    }
  }
  return segments.join("/");
}

function relationshipMap(source: string, baseDirectory: string): Map<string, string> {
  const document = xmlDocument(source);
  const relationships = new Map<string, string>();
  for (const relation of Array.from(document.getElementsByTagNameNS("*", "Relationship"))) {
    if (relation.getAttribute("TargetMode") === "External") continue;
    const id = relation.getAttribute("Id");
    const target = resolvePackageTarget(baseDirectory, relation.getAttribute("Target") ?? "");
    if (id && target) relationships.set(id, target);
  }
  return relationships;
}

export async function previewOfficeDocument(file: Blob, extension: string): Promise<string> {
  const entries = await readZipEntries(file);
  if (extension === "docx") {
    const xml = entries.get("word/document.xml");
    if (!xml) throw new Error("Word document content was not found.");
    const doc = xmlDocument(xml);
    const paragraphs = Array.from(doc.getElementsByTagNameNS("*", "p"))
      .map(p => textOf(p).trim()).filter(Boolean);
    return paragraphs.join("\n\n") || "This Word document has no readable text.";
  }
  if (extension === "xlsx") {
    const workbook = entries.get("xl/workbook.xml");
    if (!workbook) throw new Error("Excel workbook content was not found.");
    const sharedXml = entries.get("xl/sharedStrings.xml");
    const shared = sharedXml ? Array.from(xmlDocument(sharedXml).getElementsByTagNameNS("*", "si")).map(textOf) : [];
    const workbookDoc = xmlDocument(workbook);
    const relationsXml = entries.get("xl/_rels/workbook.xml.rels");
    if (!relationsXml) throw new Error("Excel worksheet relationships were not found.");
    const relations = relationshipMap(relationsXml, "xl");
    const sheets = Array.from(workbookDoc.getElementsByTagNameNS("*", "sheet")).map((sheet, index) => {
      const relationId = sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || sheet.getAttribute("r:id");
      const path = relationId ? relations.get(relationId) : undefined;
      if (!path || !/^xl\/worksheets\/[^/]+\.xml$/.test(path) || !entries.has(path)) {
        throw new Error("An Excel worksheet could not be resolved safely.");
      }
      return { name: sheet.getAttribute("name") || "Sheet " + (index + 1), path };
    });
    if (!sheets.length) throw new Error("No readable worksheets were found.");
    return sheets.map(sheet => {
      const doc = xmlDocument(entries.get(sheet.path)!);
      const rows = Array.from(doc.getElementsByTagNameNS("*", "row")).map(row =>
        Array.from(row.getElementsByTagNameNS("*", "c")).map(cell => {
          const value = cell.getElementsByTagNameNS("*", "v")[0]?.textContent ?? textOf(cell);
          return cell.getAttribute("t") === "s" ? (shared[Number(value)] ?? "") :
            cell.getAttribute("t") === "inlineStr" ? textOf(cell) : value;
        }).join(" | ")
      );
      return sheet.name + "\n" + rows.join("\n");
    }).join("\n\n");
  }
  if (extension === "pptx") {
    const presentation = entries.get("ppt/presentation.xml");
    const relationsXml = entries.get("ppt/_rels/presentation.xml.rels");
    if (!presentation || !relationsXml) throw new Error("Presentation slide relationships were not found.");
    const relations = relationshipMap(relationsXml, "ppt");
    const presentationDoc = xmlDocument(presentation);
    const slides = Array.from(presentationDoc.getElementsByTagNameNS("*", "sldId")).map((slide, index) => {
      const relationId = slide.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || slide.getAttribute("r:id");
      const path = relationId ? relations.get(relationId) : undefined;
      if (!path || !/^ppt\/slides\/[^/]+\.xml$/.test(path) || !entries.has(path)) {
        throw new Error("A presentation slide could not be resolved safely.");
      }
      return path;
    });
    if (!slides.length) throw new Error("No readable presentation slides were found.");
    return slides.map((name, index) => {
      const doc = xmlDocument(entries.get(name)!);
      const paragraphs = Array.from(doc.getElementsByTagNameNS("*", "p")).map(textOf).filter(Boolean);
      return "Slide " + (index + 1) + "\n" + paragraphs.join("\n");
    }).join("\n\n");
  }
  throw new Error("Unsupported Office preview format.");
}

/**
 * Renders every slide of a PPTX to a PNG data URL for the workspace visual
 * preview. Throws when the archive is unreadable so callers can fall back to
 * the text preview; slides whose canvas render fails are skipped.
 */
export async function previewPowerPointSlideImages(file: Blob): Promise<string[]> {
  const { parseSlideXml, parsePresentationSize, renderSlidePng } = await import("./slide-image");
  const entries = await readZipEntries(file);
  const presentation = entries.get("ppt/presentation.xml");
  const relationsXml = entries.get("ppt/_rels/presentation.xml.rels");
  if (!presentation || !relationsXml) throw new Error("Presentation slide relationships were not found.");
  const relations = relationshipMap(relationsXml, "ppt");
  const presentationDoc = xmlDocument(presentation);
  const slidePaths = Array.from(presentationDoc.getElementsByTagNameNS("*", "sldId")).map((slide) => {
    const relationId = slide.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || slide.getAttribute("r:id");
    const path = relationId ? relations.get(relationId) : undefined;
    if (!path || !/^ppt\/slides\/[^/]+\.xml$/.test(path) || !entries.has(path)) {
      throw new Error("A presentation slide could not be resolved safely.");
    }
    return path;
  });
  if (!slidePaths.length) throw new Error("No readable presentation slides were found.");
  const size = parsePresentationSize(presentation);
  const images: string[] = [];
  for (const path of slidePaths) {
    const parsed = parseSlideXml(entries.get(path)!);
    if (!parsed.shapes.length) continue;
    const image = renderSlidePng(parsed, size);
    if (image) images.push(image);
  }
  if (!images.length) throw new Error("No presentation slides could be rendered.");
  return images;
}
