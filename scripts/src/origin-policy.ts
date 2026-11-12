export function parseAllowedOrigins(value: string | undefined): Set<string> {
  const allowed = new Set<string>();
  for (const entry of (value || "").split(",")) {
    const candidate = entry.trim();
    if (!candidate || candidate === "*" || candidate === "null") continue;
    try {
      const url = new URL(candidate);
      const secure = url.protocol === "https:";
      const localHttp = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
      if ((!secure && !localHttp) || url.origin !== candidate || url.username || url.password) continue;
      allowed.add(url.origin);
    } catch {
      // Ignore malformed origin entries; never broaden the allowlist.
    }
  }
  return allowed;
}

export function isAllowedBrowserOrigin(origin: string | undefined, allowed: ReadonlySet<string>): boolean {
  return typeof origin === "string" && origin !== "null" && allowed.has(origin);
}
