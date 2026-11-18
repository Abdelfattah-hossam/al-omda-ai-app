import test from "node:test";
import assert from "node:assert/strict";
import {
  getWorkspaceAssetMimeType,
  isValidProjectFolderId,
  isValidWorkspaceAssetPath,
  sanitizeWorkspaceAssetName,
} from "./storage-assets.js";

test("sanitizes filenames and strips path traversal components", () => {
  assert.equal(sanitizeWorkspaceAssetName("../../my report.pdf"), "my-report.pdf");
  assert.equal(sanitizeWorkspaceAssetName("folder\\\\nested\\\\ملف.docx"), "ملف.docx");
  assert.equal(sanitizeWorkspaceAssetName("..."), "file");
});

test("allows only the supported workspace file extensions", () => {
  assert.equal(getWorkspaceAssetMimeType("report.docx"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(getWorkspaceAssetMimeType("table.xlsx"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(getWorkspaceAssetMimeType("slides.pptx"), "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  assert.equal(getWorkspaceAssetMimeType("project.zip"), "application/zip");
  assert.equal(getWorkspaceAssetMimeType("archive.exe"), null);
  assert.equal(getWorkspaceAssetMimeType("app.tsx"), "text/plain");
  assert.equal(getWorkspaceAssetMimeType("app.js"), "text/javascript");
  assert.equal(getWorkspaceAssetMimeType("script.py"), "text/x-python");
  assert.equal(getWorkspaceAssetMimeType("styles.scss"), "text/plain");
  assert.equal(getWorkspaceAssetMimeType("drawing.svg"), "image/svg+xml");
});

test("scopes asset paths to exactly one authenticated user and project", () => {
  const userId = "a1b2c3d4-e5f6-4789-8abc-def012345678";
  const projectId = "b1b2c3d4-e5f6-4789-8abc-def012345678";
  assert.equal(isValidWorkspaceAssetPath(userId + "/" + projectId + "/report.pdf", userId), true);
  assert.equal(isValidWorkspaceAssetPath("other/" + projectId + "/report.pdf", userId), false);
  assert.equal(isValidWorkspaceAssetPath(userId + "/../report.pdf", userId), false);
  assert.equal(isValidWorkspaceAssetPath(userId + "/%2f" + projectId, userId), false);
  assert.equal(isValidProjectFolderId(projectId), true);
  assert.equal(isValidProjectFolderId("inbox"), false);
});
