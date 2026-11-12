export type BrowserName = "chromium" | "firefox" | "webkit";
export type BrowserMcpServer = { name: string; command: string; args: string[]; envFrom?: string[] };
export type McpConfig = { servers: BrowserMcpServer[] };

export function parseBrowserName(value: string | undefined): BrowserName {
  const browser = (value || "chromium").toLowerCase();
  if (browser !== "chromium" && browser !== "firefox" && browser !== "webkit") {
    throw new Error("Browser must be chromium, firefox, or webkit.");
  }
  return browser;
}

export function mergeDesktopServerConfig(existingText: string | null): string {
  let config: McpConfig = { servers: [] };
  if (existingText?.trim()) {
    let parsed: unknown;
    try { parsed = JSON.parse(existingText); }
    catch { throw new Error("Existing .omda/mcp-servers.json is not valid JSON; it was left unchanged."); }
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { servers?: unknown }).servers)) {
      throw new Error("Existing MCP config must contain a servers array; it was left unchanged.");
    }
    const servers = (parsed as { servers: unknown[] }).servers;
    if (servers.some((item) => !item || typeof item !== "object" || typeof (item as { name?: unknown }).name !== "string")) {
      throw new Error("Existing MCP config contains an invalid server entry; it was left unchanged.");
    }
    config = { servers: servers as BrowserMcpServer[] };
  }

  const desktopServer: BrowserMcpServer = {
    name: "computer-use",
    command: "npx",
    args: ["-y", "@zavora-ai/computer-use-mcp"],
  };
  const index = config.servers.findIndex((server) => server.name === desktopServer.name);
  if (index >= 0) config.servers[index] = desktopServer;
  else config.servers.push(desktopServer);
  return JSON.stringify(config, null, 2) + "\\n";
}

export function mergeBrowserServerConfig(existingText: string | null, browser: BrowserName): string {
  let config: McpConfig = { servers: [] };
  if (existingText?.trim()) {
    let parsed: unknown;
    try { parsed = JSON.parse(existingText); }
    catch { throw new Error("Existing .omda/mcp-servers.json is not valid JSON; it was left unchanged."); }
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { servers?: unknown }).servers)) {
      throw new Error("Existing MCP config must contain a servers array; it was left unchanged.");
    }
    const servers = (parsed as { servers: unknown[] }).servers;
    if (servers.some((item) => !item || typeof item !== "object" || typeof (item as { name?: unknown }).name !== "string")) {
      throw new Error("Existing MCP config contains an invalid server entry; it was left unchanged.");
    }
    config = { servers: servers as BrowserMcpServer[] };
  }

  const browserServer: BrowserMcpServer = {
    name: "playwright-browser",
    command: "npx",
    args: ["-y", "@playwright/mcp@latest", "--browser", browser],
  };
  const index = config.servers.findIndex((server) => server.name === browserServer.name);
  if (index >= 0) config.servers[index] = browserServer;
  else config.servers.push(browserServer);
  return JSON.stringify(config, null, 2) + "\n";
}
