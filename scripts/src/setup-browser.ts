import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mergeBrowserServerConfig, parseBrowserName } from "./browser-config.js";

async function main(): Promise<void> {
  const browserArg = process.argv.slice(2).find((value) => !value.startsWith("-"));
  const browser = parseBrowserName(browserArg);
  const workspace = resolve(process.env.OMDA_AGENT_WORKSPACE?.trim() || process.cwd());
  const configPath = resolve(workspace, ".omda", "mcp-servers.json");
  let existing: string | null = null;
  try { existing = await readFile(configPath, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const next = mergeBrowserServerConfig(existing, browser);
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, next, { encoding: "utf8", mode: 0o600 });
  console.log("Playwright browser MCP configured:", browser);
  console.log("Config:", configPath);
  console.log("Next: set OMDA_AGENT_MCP_COMMANDS=npx (include any other MCP commands you already use), then restart the local Agent runtime.");
  console.log("The first MCP launch uses npx to fetch @playwright/mcp. Install the matching browser runtime if prompted.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
