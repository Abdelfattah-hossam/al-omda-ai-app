import assert from "node:assert/strict";
import test from "node:test";
import { resolveWorkspaceUploadMime } from "./asset-upload.js";

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
