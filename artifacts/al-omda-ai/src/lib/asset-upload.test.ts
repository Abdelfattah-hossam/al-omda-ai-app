import assert from "node:assert/strict";
import test from "node:test";
import { resolveArtifactUploadMime, resolveWorkspaceUploadMime } from "./asset-upload.js";

test("uses the allowlisted extension MIME when mobile browsers omit the file MIME", () => {
  assert.equal(resolveWorkspaceUploadMime("report.docx", ""), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(resolveWorkspaceUploadMime("report.xlsx", "application/octet-stream"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(resolveWorkspaceUploadMime("slides.pptx", "application/zip"), "application/vnd.openxmlformats-officedocument.presentationml.presentation");
});

test("accepts exact browser MIME types and rejects mismatched or unsupported extensions", () => {
  assert.equal(resolveWorkspaceUploadMime("photo.jpg", "image/jpeg"), "image/jpeg");
  assert.equal(resolveWorkspaceUploadMime("report.docx", "image/png"), null);
  assert.equal(resolveWorkspaceUploadMime("program.exe", "application/octet-stream"), null);
});

test("resolves chat artifact MIME from the extension when blobs report generic types", () => {
  assert.equal(resolveArtifactUploadMime("عرض.pptx", "application/zip"), "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  assert.equal(resolveArtifactUploadMime("مستند.docx", ""), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(resolveArtifactUploadMime("data.xlsx", "application/octet-stream"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
});

test("keeps specific artifact MIME types and rejects unknown generic artifacts", () => {
  assert.equal(resolveArtifactUploadMime("script.py", "text/x-python"), "text/x-python");
  assert.equal(resolveArtifactUploadMime("app.html", "text/html;charset=utf-8"), "text/html");
  assert.equal(resolveArtifactUploadMime("data.bin", "application/octet-stream"), null);
  assert.equal(resolveArtifactUploadMime("notes.txt", ""), "text/plain");
});

test('video upload keeps the real extension and MIME rather than renaming formats',()=>{
 assert.equal(resolveWorkspaceUploadMime('clip.mp4','video/mp4;codecs=avc1'),'video/mp4');
 assert.equal(resolveWorkspaceUploadMime('clip.webm','video/webm'),'video/webm');
 assert.equal(resolveWorkspaceUploadMime('clip.mp4','video/webm'),null);
});
