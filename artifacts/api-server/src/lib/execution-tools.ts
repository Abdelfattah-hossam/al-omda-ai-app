/**
 * Cloud-tier execution tools for Phase 4 (register section 8): real tools the
 * executor can run for an approved step, each typed with a risk class that
 * will drive the approval gate. v1 ships the read-only fetch_url tool; the
 * ToolRun shape is the seam later tools (and MCP) plug into.
 */

import { extractOfficeText, officeKindFromMime } from "./office-reader.js";

export type ToolRiskClass = "read" | "write" | "external" | "destructive";

export type ToolRun = {
  tool: string;
  riskClass: ToolRiskClass;
  ok: boolean;
  detail: string;
  durationMs: number;
  /** Bounded tool output injected into the executor prompt as evidence. */
  data?: string;
};

const MAX_FETCH_BYTES = 512 * 1024;
const MAX_EVIDENCE_CHARS = 20000;
const FETCH_TIMEOUT_MS = 10000;

/** Extracts the first plain http(s) URL from free text, without trailing punctuation. */
export function extractFetchableUrl(text: string): string | null {
  if (typeof text !== "string" || text.length > 100000) return null;
  const match = text.match(/https?:\/\/[^\s<>"'()\\[\]{}]+/i);
  if (!match) return null;
  const cleaned = match[0].replace(/[.,;:!?)\]}'"»”]+$/u, "");
  try {
    return new URL(cleaned).toString();
  } catch {
    return null;
  }
}

/**
 * SSRF guard for fetch_url: only http(s), no embedded credentials, and no
 * loopback/private/link-local/reserved hosts (literal IPs and obvious
 * internal names). Workers fetch runs on the public network; this belt-and-
 * braces check keeps the tool from targeting internal infrastructure.
 */
export function isFetchUrlAllowed(url: URL): boolean {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan") || host.endsWith(".home")) return false;
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const octets = v4.slice(1).map(Number);
    if (octets.some((octet) => octet > 255)) return false;
    const [a, b] = octets;
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 192 && b === 0) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a >= 224) return false;
  }
  if (host === "::1" || host === "[::1]" || host.startsWith("fe80") || host.startsWith("[fe80")) return false;
  if (host.includes(":")) return false; // other literal IPv6 forms stay blocked in v1
  return true;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

/** Runs the read-only fetch_url tool. fetchImpl is injectable for tests. */
export async function runFetchUrlTool(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ToolRun> {
  const started = Date.now();
  const base = { tool: "fetch_url", riskClass: "read" as const };
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ...base, ok: false, detail: "invalid URL", durationMs: Date.now() - started };
  }
  if (!isFetchUrlAllowed(url)) {
    return { ...base, ok: false, detail: "URL blocked by the fetch safety rules", durationMs: Date.now() - started };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: { accept: "text/html,text/plain,application/json,application/xml,text/markdown,*/*;q=0.5", "user-agent": "ALOMDA-fetch_url/1.0" },
    });
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!response.ok) {
      return { ...base, ok: false, detail: "HTTP " + response.status, durationMs: Date.now() - started };
    }
    if (contentType && !contentType.includes("text") && !contentType.includes("json") && !contentType.includes("xml") && !contentType.includes("html")) {
      return { ...base, ok: false, detail: "unsupported content type: " + contentType.split(";")[0], durationMs: Date.now() - started };
    }
    const reader = response.body?.getReader();
    if (!reader) return { ...base, ok: false, detail: "empty response body", durationMs: Date.now() - started };
    const chunks: Uint8Array[] = [];
    let total = 0;
    let truncated = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_FETCH_BYTES) { truncated = true; void reader.cancel(); break; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(Math.min(total, MAX_FETCH_BYTES));
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk.subarray(0, bytes.length - offset), offset); offset += chunk.byteLength; if (offset >= bytes.length) break; }
    const raw = new TextDecoder("utf-8").decode(bytes);
    const text = (contentType.includes("html") ? htmlToText(raw) : raw.trim()).slice(0, MAX_EVIDENCE_CHARS);
    if (!text) return { ...base, ok: false, detail: "no readable text content", durationMs: Date.now() - started };
    return {
      ...base,
      ok: true,
      detail: "HTTP " + response.status + ", " + (bytes.length / 1024).toFixed(1) + " KB" + (truncated ? " (truncated)" : ""),
      durationMs: Date.now() - started,
      data: text,
    };
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "timed out after " + FETCH_TIMEOUT_MS + "ms" : error instanceof Error ? error.message : "fetch failed";
    return { ...base, ok: false, detail: message, durationMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * read_workspace_asset (read class): lets an approved step consume a text
 * file the user already uploaded to their workspace (chat inbox or the
 * task's own project folder). Storage stays the source of truth; the lib
 * only matches names and defines limits, while the route injects the
 * authenticated list/read calls. Rich parsers (xlsx, docx, pptx, pdf) are a
 * later slice; v1 reads text-like types only.
 */

export type WorkspaceAssetRef = {
  /** Full storage path: <userId>/<folder>/<stored-name>. */
  path: string;
  /** Stored leaf name (ASCII-folded storage key, usually "<uuid>-<name>"). */
  name: string;
  mimeType: string | null;
  size: number | null;
};

export const ASSET_READ_MAX_BYTES = 256 * 1024;
/** Office files are zip containers; allow larger reads, extraction stays capped. */
export const ASSET_OFFICE_READ_MAX_BYTES = 4 * 1024 * 1024;
export const ASSET_EVIDENCE_MAX_CHARS = 15000;
export const ASSET_MENTION_MAX_MATCHES = 2;

const TEXT_ASSET_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/sql",
  "image/svg+xml",
]);

export function isTextAssetMime(mimeType: string | null): boolean {
  if (!mimeType) return false;
  const base = mimeType.split(";")[0].trim().toLowerCase();
  return base.startsWith("text/") || TEXT_ASSET_MIME_TYPES.has(base);
}

/** Strips the "<uuid>-" storage prefix so the user-facing name is matched. */
function assetDisplayName(storedName: string): string {
  const match = storedName.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-(.+)$/i);
  return match ? match[1] : storedName;
}

/**
 * Matches files the customer's request explicitly names, by full leaf name
 * ("sales.csv") or by a distinctive stem ("sales"). Case-insensitive; at
 * most ASSET_MENTION_MAX_MATCHES files to keep evidence bounded.
 */
export function findAssetMentions(
  request: string,
  assets: WorkspaceAssetRef[],
  max: number = ASSET_MENTION_MAX_MATCHES,
): WorkspaceAssetRef[] {
  if (typeof request !== "string" || !request.trim()) return [];
  const haystack = request.toLowerCase();
  const matches: WorkspaceAssetRef[] = [];
  for (const asset of assets) {
    if (matches.length >= max) break;
    const leaf = assetDisplayName(asset.name).toLowerCase();
    if (!leaf) continue;
    const stem = leaf.replace(/\.[a-z0-9]{1,5}$/, "");
    if (haystack.includes(leaf) || (stem.length >= 4 && haystack.includes(stem))) {
      matches.push(asset);
    }
  }
  return matches;
}

export type ReadAssetDeps = {
  readAssetText: (path: string) => Promise<{ text: string; bytes: number }>;
  /** Binary reads for Office files (xlsx/docx/pptx); optional so text-only callers stay simple. */
  readAssetBytes?: (path: string) => Promise<Buffer>;
};

/** Runs the read-only read_workspace_asset tool against one matched asset. */
export async function runReadAssetTool(asset: WorkspaceAssetRef, deps: ReadAssetDeps): Promise<ToolRun> {
  const started = Date.now();
  const base = { tool: "read_workspace_asset", riskClass: "read" as const };
  const displayName = assetDisplayName(asset.name);
  const officeKind = officeKindFromMime(asset.mimeType);
  if (officeKind) {
    if (!deps.readAssetBytes) {
      return { ...base, ok: false, detail: "binary reading is unavailable for " + displayName, durationMs: Date.now() - started };
    }
    if (asset.size != null && asset.size > ASSET_OFFICE_READ_MAX_BYTES) {
      return { ...base, ok: false, detail: "file too large for inline evidence (" + Math.round(asset.size / 1024) + " KB > " + Math.round(ASSET_OFFICE_READ_MAX_BYTES / 1024) + " KB)", durationMs: Date.now() - started };
    }
    try {
      const bytes = await deps.readAssetBytes(asset.path);
      const evidence = extractOfficeText(officeKind, bytes).trim().slice(0, ASSET_EVIDENCE_MAX_CHARS);
      if (!evidence) {
        return { ...base, ok: false, detail: "no readable text content in " + displayName, durationMs: Date.now() - started };
      }
      return {
        ...base,
        ok: true,
        detail: displayName + ", " + (bytes.length / 1024).toFixed(1) + " KB",
        durationMs: Date.now() - started,
        data: evidence,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "read failed";
      return { ...base, ok: false, detail: displayName + ": " + message, durationMs: Date.now() - started };
    }
  }
  if (!isTextAssetMime(asset.mimeType)) {
    return { ...base, ok: false, detail: "unsupported content type for text evidence: " + (asset.mimeType ?? "unknown"), durationMs: Date.now() - started };
  }
  if (asset.size != null && asset.size > ASSET_READ_MAX_BYTES) {
    return { ...base, ok: false, detail: "file too large for inline evidence (" + Math.round(asset.size / 1024) + " KB > " + Math.round(ASSET_READ_MAX_BYTES / 1024) + " KB)", durationMs: Date.now() - started };
  }
  try {
    const result = await deps.readAssetText(asset.path);
    const evidence = result.text.replace(/\u0000/g, "").trim().slice(0, ASSET_EVIDENCE_MAX_CHARS);
    if (!evidence) {
      return { ...base, ok: false, detail: "no readable text content in " + displayName, durationMs: Date.now() - started };
    }
    return {
      ...base,
      ok: true,
      detail: displayName + ", " + (result.bytes / 1024).toFixed(1) + " KB",
      durationMs: Date.now() - started,
      data: evidence,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "read failed";
    return { ...base, ok: false, detail: displayName + ": " + message, durationMs: Date.now() - started };
  }
}

export type RequestToolDeps = ReadAssetDeps & {
  fetchImpl?: typeof fetch;
  /** Lists the caller's workspace assets (chat inbox + current task folder). */
  listAssets?: () => Promise<WorkspaceAssetRef[]>;
};

/**
 * Runs every read-class tool the request activates: fetch_url when it cites
 * a URL, read_workspace_asset for each explicitly named workspace file.
 * Listing failures are best-effort and never block the step.
 */
export async function runRequestReadTools(request: string, deps: RequestToolDeps): Promise<ToolRun[]> {
  const runs: ToolRun[] = [];
  const url = extractFetchableUrl(request);
  if (url) runs.push(await runFetchUrlTool(url, deps.fetchImpl));
  if (deps.listAssets) {
    try {
      const assets = await deps.listAssets();
      for (const asset of findAssetMentions(request, assets)) {
        runs.push(await runReadAssetTool(asset, deps));
      }
    } catch {
      // Asset listing is best-effort; a failed listing must not fail the step.
    }
  }
  return runs;
}
