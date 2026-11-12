import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mergeDesktopServerConfig } from "./browser-config.js";

async function main(): Promise<void> {
  const workspace = resolve(process.env.OMDA_AGENT_WORKSPACE?.trim() || process.cwd());
  const configPath = resolve(workspace, ".omda", "mcp-servers.json");
  let existing: string | null = null;
  try { existing = await readFile(configPath, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const next = mergeDesktopServerConfig(existing);
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, next, { encoding: "utf8", mode: 0o600 });
  console.log("Desktop computer-use MCP configured.");
  console.log("Config:", configPath);
  console.log("Next: allow npx in OMDA_AGENT_MCP_COMMANDS, grant the OS permissions requested by the desktop server, then restart the local Agent runtime.");
  console.log("This grants the local agent the ability to view and control the signed-in desktop. Use a trusted machine and approve desktop actions deliberately.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
