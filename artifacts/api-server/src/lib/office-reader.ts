/**
 * Server-side text extraction from Office Open XML files (xlsx, docx, pptx)
 * for the read_workspace_asset tool. The repo already writes these formats
 * (office-ooxml.ts, zip.ts); this is the reading half. No new dependencies:
 * zip entries are decoded with Node's built-in zlib, and the small amount of
 * XML parsing needed here is done with targeted token extraction, which is
 * appropriate for bounded, read-only evidence extraction.
 *
 * Safety: archives are capped on entry count and total uncompressed size
 * (zip-bomb guard), and every extractor caps its text output.
 */

import { inflateRawSync } from "node:zlib";

const MAX_ZIP_ENTRIES = 200;
const MAX_UNCOMPRESSED_TOTAL = 8 * 1024 * 1024;
const MAX_ENTRY_BYTES = 4 * 1024 * 1024;
export const MAX_OFFICE_TEXT_CHARS = 15000;

export type ZipEntry = { name: string; data: Buffer };

/** Reads the central directory of a zip archive and decompresses entries. */
export function readZipEntries(bytes: Buffer): ZipEntry[] {
  if (bytes.length < 22 || bytes.readUInt32LE(0) !== 0x04034b50) {
    throw new Error("not a zip archive");
  }
  // Locate the End Of Central Directory record (scan the tail backwards).
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65536); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("zip directory not found");
  const entryCount = bytes.readUInt16LE(eocd + 10);
  if (entryCount > MAX_ZIP_ENTRIES) throw new Error("archive has too many entries");
  let offset = bytes.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  let totalUncompressed = 0;
  for (let i = 0; i < entryCount; i++) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014b50) break;
    const method = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString("utf-8");
    offset += 46 + nameLength + extraLength + commentLength;
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_UNCOMPRESSED_TOTAL) throw new Error("archive expands beyond the safe limit");
    if (uncompressedSize > MAX_ENTRY_BYTES) continue; // skip oversized members
    if (method !== 0 && method !== 8) continue; // stored or deflate only
    if (localOffset + 30 > bytes.length || bytes.readUInt32LE(localOffset) !== 0x04034b50) continue;
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    if (compressed.length !== compressedSize) continue;
    try {
      const data = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { finishFlush: 4 });
      entries.push({ name, data });
    } catch {
      // Skip entries that fail to inflate; other entries may still be readable.
    }
  }
  return entries;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Extracts the text of every <...:t> run inside one XML part. */
function extractTextRuns(xml: string, tagSuffix: string): string[] {
  const runs: string[] = [];
  const pattern = new RegExp("<(?:[a-z0-9]+:)?" + tagSuffix + "(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[a-z0-9]+:)?" + tagSuffix + ">", "gi");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    const text = decodeXmlEntities(match[1]).trim();
    if (text) runs.push(text);
  }
  return runs;
}

function findEntry(entries: ZipEntry[], suffix: string): ZipEntry | undefined {
  return entries.find((entry) => entry.name === suffix || entry.name.endsWith("/" + suffix));
}

/** Extracts paragraphs and table cell text from a .docx file. */
export function extractDocxText(bytes: Buffer): string {
  const entries = readZipEntries(bytes);
  const document = findEntry(entries, "word/document.xml");
  if (!document) throw new Error("word/document.xml missing");
  const xml = document.data.toString("utf-8");
  // Paragraphs: join runs inside each <w:p>, one line per paragraph.
  const paragraphs: string[] = [];
  const paragraphPattern = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/gi;
  let match: RegExpExecArray | null;
  while ((match = paragraphPattern.exec(xml)) !== null) {
    const line = extractTextRuns(match[0], "t").join(" ").trim();
    if (line) paragraphs.push(line);
  }
  return paragraphs.join("\n").slice(0, MAX_OFFICE_TEXT_CHARS);
}

/** Extracts every sheet as "Sheet: <name>" + comma-joined rows from a .xlsx file. */
export function extractXlsxText(bytes: Buffer): string {
  const entries = readZipEntries(bytes);
  const sharedEntry = findEntry(entries, "xl/sharedStrings.xml");
  const shared = sharedEntry ? extractTextRuns(sharedEntry.data.toString("utf-8"), "t") : [];
  // Sheet names in workbook order.
  const workbook = findEntry(entries, "xl/workbook.xml");
  const sheetNames: string[] = [];
  if (workbook) {
    const namePattern = /<sheet[^>]*\sname="([^"]*)"/gi;
    let match: RegExpExecArray | null;
    while ((match = namePattern.exec(workbook.data.toString("utf-8"))) !== null) {
      sheetNames.push(decodeXmlEntities(match[1]));
    }
  }
  const sheetEntries = entries
    .filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (sheetEntries.length === 0) throw new Error("no worksheets found");
  const parts: string[] = [];
  for (const [index, sheet] of sheetEntries.entries()) {
    const xml = sheet.data.toString("utf-8");
    const rows: string[] = [];
    const rowPattern = /<row(?:\s[^>]*)?>[\s\S]*?<\/row>/gi;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowPattern.exec(xml)) !== null) {
      const cells: string[] = [];
      const cellPattern = /<c(?:\s[^>]*)?>([\s\S]*?)<\/c>/gi;
      let cellMatch: RegExpExecArray | null;
      while ((cellMatch = cellPattern.exec(rowMatch[0])) !== null) {
        const cellXml = cellMatch[0];
        const isShared = /\st="s"/.test(cellXml.slice(0, cellXml.indexOf(">") + 1));
        const valueMatch = cellXml.match(/<v>([\s\S]*?)<\/v>/i);
        const inlineRuns = extractTextRuns(cellXml, "t");
        if (isShared && valueMatch) {
          const sharedIndex = Number.parseInt(valueMatch[1], 10);
          cells.push(Number.isNaN(sharedIndex) ? "" : (shared[sharedIndex] ?? ""));
        } else if (inlineRuns.length > 0) {
          cells.push(inlineRuns.join(" "));
        } else {
          cells.push(valueMatch ? decodeXmlEntities(valueMatch[1]).trim() : "");
        }
      }
      rows.push(cells.join(","));
    }
    const name = sheetNames[index] ?? `Sheet ${index + 1}`;
    parts.push("Sheet: " + name + "\n" + rows.join("\n"));
    if (parts.join("\n").length > MAX_OFFICE_TEXT_CHARS) break;
  }
  return parts.join("\n\n").slice(0, MAX_OFFICE_TEXT_CHARS);
}

/** Extracts slide text, one block per slide, from a .pptx file. */
export function extractPptxText(bytes: Buffer): string {
  const entries = readZipEntries(bytes);
  const slides = entries
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (slides.length === 0) throw new Error("no slides found");
  const parts = slides.map((slide, index) => {
    const runs = extractTextRuns(slide.data.toString("utf-8"), "t");
    return "Slide " + (index + 1) + ":\n" + runs.join("\n");
  });
  return parts.join("\n\n").slice(0, MAX_OFFICE_TEXT_CHARS);
}

export type OfficeKind = "xlsx" | "docx" | "pptx";

export function officeKindFromMime(mimeType: string | null): OfficeKind | null {
  if (!mimeType) return null;
  const base = mimeType.split(";")[0].trim().toLowerCase();
  if (base === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx";
  if (base === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (base === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return "pptx";
  return null;
}

/** Extracts bounded plain-text evidence from an Office file, or null when unsupported. */
export function extractOfficeText(kind: OfficeKind, bytes: Buffer): string {
  if (kind === "xlsx") return extractXlsxText(bytes);
  if (kind === "docx") return extractDocxText(bytes);
  return extractPptxText(bytes);
}
