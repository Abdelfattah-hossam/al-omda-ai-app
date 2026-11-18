export function getLocalAgentOrigin(value: string, errorMessage = "Local runtime URL must use localhost or 127.0.0.1."): string {
  let base: URL;
  try { base = new URL(value.trim()); } catch { throw new Error(errorMessage); }
  if (!["http:", "https:"].includes(base.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) || base.username || base.password) {
    throw new Error(errorMessage);
  }
  return base.origin + base.pathname.replace(/\/+$/, "");
}
