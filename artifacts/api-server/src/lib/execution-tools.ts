/**
 * Cloud-tier execution tools for Phase 4 (register section 8): real tools the
 * executor can run for an approved step, each typed with a risk class that
 * will drive the approval gate. v1 ships the read-only fetch_url tool; the
 * ToolRun shape is the seam later tools (and MCP) plug into.
 */

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
