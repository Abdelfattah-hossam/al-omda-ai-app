export type OoxmlValidationOptions = {
  requiredEntries: string[];
  expectedSlideCount?: number;
  expectedNotesCount?: number;
  expectedText?: string[];
};

type ZipEntry = { name: string; method: number; crc: number; compressedSize: number; size: number; localOffset: number };

const decoder = new TextDecoder("utf-8", { fatal: true });

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function findEndRecord(view: DataView, length: number): number {
  const min = Math.max(0, length - 65557);
  for (let offset = length - 22; offset >= min; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  return -1;
}

function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_match, entity: string) => {
    if (entity === "amp") return "&";
    if (entity === "lt") return "<";
    if (entity === "gt") return ">";
    if (entity === "quot") return '"';
    if (entity === "apos") return "'";
    const numeric = entity[0] === "#" ? (entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)) : NaN;
    if (!Number.isInteger(numeric) || numeric < 1 || numeric > 0x10ffff || (numeric >= 0xd800 && numeric <= 0xdfff)) return "";
    return String.fromCodePoint(numeric);
  });
}

function parseXmlText(xml: string): { root: string; officeText: string[] } | null {
  if (!xml || xml.length > 8_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) return null;
  const tokens = xml.match(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<[^>]*>|[^<]+/g);
  if (!tokens || tokens.join("") !== xml) return null;
  const stack: string[] = [];
  const officeText: string[] = [];
  let root = "";
  let roots = 0;
  for (const token of tokens) {
    if (token.startsWith("<!--")) {
      if (!token.endsWith("-->") || token.slice(4, -3).includes("--")) return null;
      continue;
    }
    if (token.startsWith("<![CDATA[")) {
      if (!stack.length || !token.endsWith("]]>")) return null;
      continue;
    }
    if (token.startsWith("<?")) {
      if (!token.endsWith("?>")) return null;
      continue;
    }
    if (token.startsWith("</")) {
      const match = token.match(/^<\/([A-Za-z_][\w:.-]*)\s*>$/);
      if (!match || stack.pop() !== match[1]) return null;
      continue;
    }
    if (token.startsWith("<!")) return null;
    if (token.startsWith("<")) {
      const match = token.match(/^<([A-Za-z_][\w:.-]*)([\s\S]*?)\s*(\/?)>$/);
      if (!match) return null;
      const name = match[1];
      const attrs = match[2];
      const attrPattern = /\s+([A-Za-z_][\w:.-]*)\s*=\s*("[^"]*"|'[^']*')/g;
      let consumed = "";
      let attrMatch: RegExpExecArray | null;
      while ((attrMatch = attrPattern.exec(attrs)) !== null) consumed += attrMatch[0];
      if (attrs.trim() && consumed.trim() !== attrs.trim()) return null;
      if (/(?:^|\s)[A-Za-z_][\w:.-]*\s*=/.test(attrs) && !attrs.trim()) return null;
      if (stack.length === 0) {
        roots++;
        root = name;
      }
      if (!match[3]) stack.push(name);
      continue;
    }
    if (token.includes("&") && /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-f]+;)/i.test(token)) return null;
    if (stack.length === 0 && token.trim()) return null;
    if (stack.length && /^(?:[A-Za-z_][\w.-]*:)?t$/.test(stack[stack.length - 1])) officeText.push(decodeXmlEntities(token));
  }
  if (stack.length || roots !== 1) return null;
  return { root, officeText };
}

async function readEntry(bytes: Uint8Array, view: DataView, entry: ZipEntry): Promise<Uint8Array | null> {
  if (entry.localOffset + 30 > bytes.length || view.getUint32(entry.localOffset, true) !== 0x04034b50) return null;
  const nameLength = view.getUint16(entry.localOffset + 26, true);
  const extraLength = view.getUint16(entry.localOffset + 28, true);
  const dataStart = entry.localOffset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > bytes.length || dataStart < 0) return null;
  const localName = decoder.decode(bytes.slice(entry.localOffset + 30, entry.localOffset + 30 + nameLength));
  if (localName !== entry.name) return null;
  const compressed = bytes.slice(dataStart, dataEnd);
  let output: Uint8Array;
  if (entry.method === 0) output = compressed;
  else if (entry.method === 8) {
    if (typeof DecompressionStream === "undefined") return null;
    try {
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat));
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        total += item.value.length;
        if (total > 8_000_000 || total > entry.size) { await reader.cancel(); return null; }
        chunks.push(item.value);
      }
      output = new Uint8Array(total);
      let cursor = 0;
      for (const chunk of chunks) { output.set(chunk, cursor); cursor += chunk.length; }
    } catch { return null; }
  } else return null;
  if (output.length !== entry.size || crc32(output) !== entry.crc) return null;
  return output;
}

export async function validateOoxmlPackage(blob: Blob, options: OoxmlValidationOptions): Promise<boolean> {
  try {
    if (!(blob instanceof Blob) || blob.size < 22 || blob.size > 40_000_000) return false;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const end = findEndRecord(view, bytes.length);
    if (end < 0 || view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0) return false;
    const diskEntries = view.getUint16(end + 8, true);
    const entryCount = view.getUint16(end + 10, true);
    const centralSize = view.getUint32(end + 12, true);
    const centralOffset = view.getUint32(end + 16, true);
    if (!entryCount || diskEntries !== entryCount || entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff || centralOffset + centralSize !== end) return false;
    const entries = new Map<string, ZipEntry>();
    let offset = centralOffset;
    let totalUncompressed = 0;
    for (let index = 0; index < entryCount; index++) {
      if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) return false;
      const flags = view.getUint16(offset + 8, true);
      const method = view.getUint16(offset + 10, true);
      const crc = view.getUint32(offset + 16, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const size = view.getUint32(offset + 24, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      const nameStart = offset + 46;
      const next = nameStart + nameLength + extraLength + commentLength;
      if (next > end || flags & 1 || compressedSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff || size > 8_000_000 || (compressedSize === 0 && size > 0) || (compressedSize > 0 && size / compressedSize > 200)) return false;
      const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
      if (!name || name.startsWith("/") || name.split("/").some((part) => part === "..") || entries.has(name)) return false;
      totalUncompressed += size;
      if (totalUncompressed > 30_000_000) return false;
      entries.set(name, { name, method, crc, compressedSize, size, localOffset });
      offset = next;
    }
    if (offset !== end || options.requiredEntries.some((name) => !entries.has(name))) return false;
    const names = [...entries.keys()];
    if (options.expectedSlideCount !== undefined) {
      const slides = names.filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
      if (slides.length !== options.expectedSlideCount) return false;
      for (let i = 1; i <= options.expectedSlideCount; i++) if (!entries.has("ppt/slides/slide" + i + ".xml")) return false;
    }
    if (options.expectedNotesCount !== undefined) {
      const notes = names.filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name));
      if (notes.length !== options.expectedNotesCount) return false;
    }
    const xmlParts = names.filter((name) => name.endsWith(".xml") || name.endsWith(".rels"));
    const allText: string[] = [];
    for (const name of xmlParts) {
      const entry = entries.get(name)!;
      const raw = await readEntry(bytes, view, entry);
      if (!raw) return false;
      const parsed = parseXmlText(decoder.decode(raw));
      if (!parsed) return false;
      allText.push(...parsed.officeText);
      if (name === "word/document.xml" && (parsed.root !== "w:document" || !/<w:body(?:\s|>)/.test(decoder.decode(raw)))) return false;
      if (/^ppt\/slides\/slide\d+\.xml$/.test(name) && parsed.root !== "p:sld") return false;
      if (/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name) && parsed.root !== "p:notes") return false;
    }
    if (options.expectedText?.length) {
      const joined = allText.join("\n");
      for (const expected of options.expectedText) {
        if (!expected) continue;
        const normalized = expected.replace(/\s+/g, " ").trim();
        if (normalized && !joined.replace(/\s+/g, " ").includes(normalized)) return false;
      }
    }
    return true;
  } catch { return false; }
}
