export const WORKSPACE_UPLOAD_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain", md: "text/markdown", csv: "text/csv", json: "application/json",
  html: "text/html", xml: "application/xml", zip: "application/zip",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
};

const GENERIC_BROWSER_MIME_TYPES = new Set(["application/octet-stream", "application/zip", "application/x-zip-compressed"]);

export function resolveWorkspaceUploadMime(filename: string, browserMime: string): string | null {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  const expected = WORKSPACE_UPLOAD_MIME_BY_EXTENSION[extension];
  if (!expected) return null;
  const reported = browserMime.split(";")[0].trim().toLowerCase();
  if (!reported || reported === expected || reported === "application/octet-stream") return expected;
  if (GENERIC_BROWSER_MIME_TYPES.has(reported) && (extension === "zip" || extension === "docx" || extension === "xlsx" || extension === "pptx")) return expected;
  return null;
}
