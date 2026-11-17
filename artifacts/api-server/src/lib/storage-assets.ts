export const MAX_WORKSPACE_ASSET_BYTES = 25 * 1024 * 1024;
export const WORKSPACE_ASSET_BUCKET = "workspace-assets";

export const WORKSPACE_ASSET_MIME_TYPES: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  html: "text/html",
  xml: "application/xml",
  zip: "application/zip",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export function sanitizeWorkspaceAssetName(input: string): string {
  const leaf = input.replace(/\\/g, "/").split("/").pop() ?? "";
  const normalized = leaf.normalize("NFKC")
    .replace(/[\\u0000-\\u001f\\u007f]/g, "")
    .replace(/[^\\p{L}\\p{N}._ -]/gu, "-")
    .replace(/\\s+/g, "-")
    .replace(/\\.{2,}/g, ".")
    .replace(/^\\.+/, "")
    .replace(/-+/g, "-")
    .trim()
    .slice(0, 120);
  return normalized || "file";
}

export function getWorkspaceAssetMimeType(filename: string): string | null {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  return WORKSPACE_ASSET_MIME_TYPES[extension] ?? null;
}

export function isValidWorkspaceAssetPath(path: string, userId: string): boolean {
  if (!path || path.length > 600 || path.includes("\\\\") || /%(?:2f|5c)/i.test(path)) return false;
  const parts = path.split("/");
  return parts.length === 3 &&
    parts[0] === userId &&
    parts.every((part) => part.length > 0 && part !== "." && part !== ".." && !/[\\u0000-\\u001f\\u007f]/.test(part));
}

export function isValidProjectFolderId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
