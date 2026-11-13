export type BrowserEngine = "chromium" | "firefox" | "webkit";
export type BrowserWorkspacePolicy = { version: 1; engine: BrowserEngine; allowedHosts: string[] };

export function normalizeBrowserHost(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 253) throw new Error("Enter a hostname without a scheme, path, or port.");
  const input = value.trim().toLowerCase();
  if (/[\s/@?#]/.test(input) || input.includes("://") || input.includes("*")) throw new Error("Enter an exact hostname; wildcards and URL paths are not allowed.");
  let parsed: URL;
  try { parsed = new URL("https://" + input); } catch { throw new Error("The hostname is invalid."); }
  if (parsed.username || parsed.password || parsed.port || parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.hostname !== input) throw new Error("Enter an exact hostname without credentials, port, path, query, or fragment.");
  if (!parsed.hostname.includes(".") && parsed.hostname !== "localhost") throw new Error("Use a fully qualified hostname or localhost.");
  return parsed.hostname;
}

export function normalizeBrowserWorkspacePolicy(input: unknown): BrowserWorkspacePolicy {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const engine = value.engine === undefined ? "chromium" : value.engine;
  if (engine !== "chromium" && engine !== "firefox" && engine !== "webkit") throw new Error("Browser engine must be chromium, firefox, or webkit.");
  const rawHosts = value.allowedHosts === undefined ? [] : value.allowedHosts;
  if (!Array.isArray(rawHosts) || rawHosts.length > 100) throw new Error("Allowed hosts must be an array of at most 100 hostnames.");
  const allowedHosts = [...new Set(rawHosts.map(normalizeBrowserHost))].sort();
  return { version: 1, engine, allowedHosts };
}

export function assertBrowserUrlAllowed(serverName: string, toolName: string, args: unknown, policy: BrowserWorkspacePolicy): void {
  if (serverName !== "playwright-browser") return;
  const urls: string[] = [];
  const visit = (value: unknown, depth: number) => {
    if (depth > 8 || value === null || value === undefined) return;
    if (typeof value === "string") { if (/^https?:\/\//i.test(value.trim())) urls.push(value.trim()); return; }
    if (Array.isArray(value)) { for (const item of value.slice(0, 100)) visit(item, depth + 1); return; }
    if (typeof value === "object") for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
      if (/^(url|href|uri|targetUrl)$/i.test(key)) visit(item, depth + 1);
      else if (typeof item === "object") visit(item, depth + 1);
    }
  };
  visit(args, 0);
  for (const value of urls) {
    let url: URL;
    try { url = new URL(value); } catch { throw new Error("Browser URL is invalid."); }
    if (!["http:", "https:"].includes(url.protocol) || !policy.allowedHosts.includes(url.hostname.toLowerCase())) throw new Error("Browser navigation blocked: add the exact hostname to Browser Workspace permissions first.");
  }
  if (/navigate|goto|open_url|new_page/i.test(toolName) && urls.length === 0) throw new Error("Browser navigation requires an explicit URL so its hostname can be checked.");
  if (urls.length === 0 && policy.allowedHosts.length === 0) throw new Error("Browser actions are blocked until at least one site is approved in Browser Workspace.");
}
