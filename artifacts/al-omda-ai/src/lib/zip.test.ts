import assert from "node:assert/strict";
import test from "node:test";
import { createZipBlob } from "./zip.js";

function u32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}
function u16(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true);
}

test("creates a valid uncompressed UTF-8 ZIP with local and central directory entries", async () => {
  const blob = createZipBlob([
    { path: "README.md", content: "# Demo" },
    { path: "src/App.tsx", content: "export default function App(){ return null; }" },
    { path: "ملاحظات.txt", content: "مشروع تجريبي" },
  ]);
  assert.equal(blob.type, "application/zip");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(u32(bytes, 0), 0x04034b50);
  let offset = 0;
  for (let index = 0; index < 3; index++) {
    assert.equal(u32(bytes, offset), 0x04034b50);
    const nameLength = u16(bytes, offset + 26);
    const extraLength = u16(bytes, offset + 28);
    const dataLength = u32(bytes, offset + 18);
    offset += 30 + nameLength + extraLength + dataLength;
  }
  assert.equal(u32(bytes, offset), 0x02014b50);
  const endOffset = bytes.length - 22;
  assert.equal(u32(bytes, endOffset), 0x06054b50);
  assert.equal(u16(bytes, endOffset + 10), 3);
});

test("rejects unsafe and duplicate ZIP paths", () => {
  assert.throws(() => createZipBlob([{ path: "../escape.txt", content: "x" }]), /unsafe file path/);
  assert.throws(() => createZipBlob([{ path: "src/a.ts", content: "x" }, { path: "SRC/A.ts", content: "y" }]), /duplicate/);
});
