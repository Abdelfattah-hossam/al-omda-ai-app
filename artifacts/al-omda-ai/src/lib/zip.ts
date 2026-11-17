export type ZipSourceFile = { path: string; content: string };

const encoder = new TextEncoder();
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function header(size: number, signature: number): Uint8Array {
  const bytes = new Uint8Array(size);
  new DataView(bytes.buffer).setUint32(0, signature, true);
  return bytes;
}

export function createZipBlob(files: ZipSourceFile[]): Blob {
  if (!Array.isArray(files) || files.length < 1 || files.length > 60) throw new Error("ZIP must contain between 1 and 60 files.");
  const seen = new Set<string>();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  let centralSize = 0;
  let totalSize = 0;

  for (const file of files) {
    if (!file || typeof file.path !== "string" || typeof file.content !== "string" ||
      !file.path || file.path.startsWith("/") || file.path.includes("\\") ||
      file.path.split("/").some((part) => !part || part === "." || part === "..")) {
      throw new Error("ZIP contains an unsafe file path.");
    }
    const path = file.path.normalize("NFKC");
    const key = path.toLocaleLowerCase();
    if (seen.has(key)) throw new Error("ZIP contains duplicate file paths.");
    seen.add(key);
    const name = encoder.encode(path);
    const data = encoder.encode(file.content);
    totalSize += data.length;
    if (name.length > 180 || data.length > 60000 || totalSize > 200000) throw new Error("ZIP project exceeds safe size limits.");
    const crc = crc32(data);

    const local = header(30 + name.length, 0x04034b50);
    const localView = new DataView(local.buffer);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true);
    local.set(name, 30);
    localParts.push(local, data);

    const central = header(46 + name.length, 0x02014b50);
    const centralView = new DataView(central.buffer);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, localOffset, true);
    central.set(name, 46);
    centralParts.push(central);
    localOffset += local.length + data.length;
    centralSize += central.length;
  }

  const end = header(22, 0x06054b50);
  const endView = new DataView(end.buffer);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);
  endView.setUint16(20, 0, true);
  return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
}
