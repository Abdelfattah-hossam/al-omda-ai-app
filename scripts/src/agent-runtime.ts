import { timingSafeEqual, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { lookup } from "node:dns/promises";
import { realpath, mkdir, readFile, writeFile, readdir, stat, rename } from "node:fs/promises";
import { isIP } from "node:net";
import { dirname, extname, relative, resolve, sep } from "node:path";

const HOST = "127.0.0.1";
const PORT = Number(process.env.OMDA_AGENT_PORT || 4318);
const TOKEN = process.env.OMDA_AGENT_TOKEN?.trim() || "";
const WORKSPACE_INPUT = process.env.OMDA_AGENT_WORKSPACE?.trim() || process.cwd();
const EXECUTION_MODE = process.env.OMDA_AGENT_EXECUTION || "disabled";
const COMMAND_TIMEOUT_MS = Math.min(Number(process.env.OMDA_AGENT_COMMAND_TIMEOUT_MS || 60000), 120000);
const OUTPUT_LIMIT = 1024 * 1024;
const BODY_LIMIT = 1024 * 1024;
const ALLOWED_HOSTS = new Set((process.env.OMDA_AGENT_ALLOWED_HOSTS || "").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean));
const ALLOWED_COMMANDS = new Set(["git", "pnpm", "npm", "pytest", "python", "python3", "ruff", "tsc", "vite", "wrangler"]);

let workspaceRoot = "";

type Json = Record<string, unknown>;
function send(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(value));
}
function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !resolve(rel).startsWith(sep));
}
async function resolveExistingPath(input: unknown): Promise<string> {
  if (typeof input !== "string" || !input.trim() || input.includes("\\0")) throw new Error("A valid workspace-relative path is required.");
  const candidate = resolve(workspaceRoot, input);
  if (!isInside(workspaceRoot, candidate)) throw new Error("Path is outside the configured workspace.");
  const actual = await realpath(candidate);
  if (!isInside(workspaceRoot, actual)) throw new Error("Symlink escapes are not allowed.");
  return actual;
}
async function resolveWritePath(input: unknown): Promise<string> {
  if (typeof input !== "string" || !input.trim() || input.includes("\\0")) throw new Error("A valid workspace-relative path is required.");
  const candidate = resolve(workspaceRoot, input);
  if (!isInside(workspaceRoot, candidate) || candidate === workspaceRoot) throw new Error("Path is outside the configured workspace.");
  const parent = await realpath(dirname(candidate));
  if (!isInside(workspaceRoot, parent)) throw new Error("Symlink escapes are not allowed.");
  try {
    const existing = await realpath(candidate);
    if (!isInside(workspaceRoot, existing)) throw new Error("Symlink escapes are not allowed.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return candidate;
}
async function readBody(req: IncomingMessage): Promise<Json> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > BODY_LIMIT) throw new Error("Request body is too large.");
    chunks.push(buffer);
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("JSON object expected.");
  return value as Json;
}
function authenticated(req: IncomingMessage): boolean {
  const supplied = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : "";
  if (!TOKEN || !supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}
function privateAddress(address: string): boolean {
  if (address === "::1" || address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:")) return true;
  if (address.startsWith("::ffff:")) return privateAddress(address.slice(7));
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || parts[0] === 127 || (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 169 && parts[1] === 254) || parts[0] === 0;
}
async function assertAllowedTarget(rawUrl: string): Promise<URL> {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Only HTTPS URLs without embedded credentials are allowed.");
  const hostname = url.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(hostname)) throw new Error("Target host is not in OMDA_AGENT_ALLOWED_HOSTS. Add only assets you own or are authorized to test.");
  if (isIP(hostname) && privateAddress(hostname)) throw new Error("Private and loopback targets are blocked.");
  if (!isIP(hostname)) {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((entry) => privateAddress(entry.address))) throw new Error("Target resolves to a private or local network address.");
  }
  return url;
}
async function httpRequest(body: Json): Promise<Json> {
  const method = String(body.method || "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) throw new Error("This first runtime release only permits GET, HEAD, and OPTIONS requests.");
  let url = await assertAllowedTarget(String(body.url || ""));
  const inputHeaders = body.headers && typeof body.headers === "object" ? body.headers as Record<string, unknown> : {};
  const headers = new Headers();
  for (const [key, value] of Object.entries(inputHeaders)) {
    if (!/^[a-z0-9-]{1,64}$/i.test(key) || typeof value !== "string" || value.length > 1000) continue;
    if (/^(authorization|cookie|proxy-authorization|host|connection|content-length)$/i.test(key)) continue;
    headers.set(key, value);
  }
  headers.set("user-agent", "AL-OMDA-Agent/0.1 (authorized-security-research)");
  let response: Response | null = null;
  for (let hop = 0; hop < 4; hop++) {
    response = await fetch(url, { method, headers, redirect: "manual", signal: AbortSignal.timeout(12000) });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    if (!location) break;
    await response.body?.cancel();
    url = await assertAllowedTarget(new URL(location, url).toString());
  }
  if (!response) throw new Error("No HTTP response was received.");
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => { responseHeaders[key] = value.slice(0, 1000); });
  const text = method === "HEAD" ? "" : (await response.text()).slice(0, 50000);
  return { url: url.toString(), method, status: response.status, statusText: response.statusText, headers: responseHeaders, body: text, truncated: text.length >= 50000 };
}
async function executeCommand(body: Json): Promise<Json> {
  if (EXECUTION_MODE !== "host") throw new Error("Terminal execution is disabled. Set OMDA_AGENT_EXECUTION=host only on a machine where you trust the project and its dependencies.");
  const command = typeof body.command === "string" ? body.command : "";
  const args = Array.isArray(body.args) ? body.args : [];
  if (!ALLOWED_COMMANDS.has(command) || args.length > 40 || args.some((arg) => typeof arg !== "string" || arg.length > 2000 || arg.includes("\\0"))) {
    throw new Error("Command is not permitted. Use an approved executable and an array of arguments.");
  }
  const cwdInput = typeof body.cwd === "string" ? body.cwd : ".";
  const cwd = await resolveExistingPath(cwdInput);
  const started = Date.now();
  return await new Promise((resolveResult) => {
    const child = spawn(command, args as string[], {
      cwd, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: process.env.PATH || "", HOME: process.env.HOME || "", USERPROFILE: process.env.USERPROFILE || "", CI: "1", NO_COLOR: "1" },
    });
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    let timedOut = false;
    let capped = false;
    const collect = (target: "stdout" | "stderr") => (chunk: Buffer) => {
      outputBytes += chunk.length;
      const remaining = Math.max(0, OUTPUT_LIMIT - (stdout.length + stderr.length));
      const text = chunk.toString("utf8").slice(0, remaining);
      if (target === "stdout") stdout += text; else stderr += text;
      if (outputBytes > OUTPUT_LIMIT && !capped) { capped = true; child.kill("SIGTERM"); }
    };
    child.stdout.on("data", collect("stdout"));
    child.stderr.on("data", collect("stderr"));
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, COMMAND_TIMEOUT_MS);
    child.on("error", (error) => { clearTimeout(timer); resolveResult({ ok: false, error: error.message, stdout, stderr, durationMs: Date.now() - started }); });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolveResult({ ok: code === 0 && !timedOut && !capped, exitCode: code, signal, timedOut, outputTruncated: capped, stdout, stderr, durationMs: Date.now() - started });
    });
  });
}
async function sessionPath(id: unknown): Promise<string> {
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error("Invalid session ID.");
  const directory = resolve(workspaceRoot, ".omda", "sessions");
  await mkdir(directory, { recursive: true });
  const actual = await realpath(directory);
  if (!isInside(workspaceRoot, actual)) throw new Error("Session directory escapes the workspace.");
  return resolve(actual, id + ".json");
}
async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  if (req.method === "GET" && url.pathname === "/health") {
    send(res, 200, { ok: true, name: "AL OMDA Agent Runtime", version: "0.1.0", execution: EXECUTION_MODE, workspace: relative(process.cwd(), workspaceRoot) || "." });
    return;
  }
  if (!authenticated(req)) { send(res, 401, { error: "Unauthorized local agent client." }); return; }
  if (req.method === "GET" && url.pathname === "/v1/tools") {
    send(res, 200, { tools: [
      { name: "files.list", description: "List entries inside the configured workspace." },
      { name: "files.read", description: "Read a UTF-8 file inside the configured workspace." },
      { name: "files.write", description: "Create or replace a UTF-8 file inside the configured workspace." },
      { name: "terminal.execute", description: "Run an approved command without a shell; disabled unless host execution is explicitly enabled." },
      { name: "http.request", description: "Inspect HTTPS responses from explicitly allowlisted authorized targets (GET/HEAD/OPTIONS)." },
      { name: "sessions.save", description: "Persist agent session state in the workspace." },
      { name: "sessions.load", description: "Restore persisted agent session state." },
    ] });
    return;
  }
  if (req.method !== "POST") { send(res, 405, { error: "Method not allowed." }); return; }
  const body = await readBody(req);
  if (url.pathname === "/v1/files/read") {
    const path = await resolveExistingPath(body.path);
    const info = await stat(path);
    if (!info.isFile() || info.size > 2 * 1024 * 1024) throw new Error("Only files up to 2 MB can be read by this tool.");
    send(res, 200, { path: relative(workspaceRoot, path), content: await readFile(path, "utf8") }); return;
  }
  if (url.pathname === "/v1/files/list") {
    const path = await resolveExistingPath(typeof body.path === "string" ? body.path : ".");
    const info = await stat(path);
    if (!info.isDirectory()) throw new Error("The requested path is not a directory.");
    const entries = await readdir(path, { withFileTypes: true });
    send(res, 200, { path: relative(workspaceRoot, path), entries: entries.slice(0, 500).map((entry) => ({ name: entry.name, type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other" })) }); return;
  }
  if (url.pathname === "/v1/files/write") {
    if (typeof body.content !== "string" || body.content.length > 2 * 1024 * 1024) throw new Error("File content must be a string up to 2 MB.");
    const path = await resolveWritePath(body.path);
    await mkdir(dirname(path), { recursive: true });
    const parent = await realpath(dirname(path));
    if (!isInside(workspaceRoot, parent)) throw new Error("Symlink escapes are not allowed.");
    await writeFile(path, body.content, { encoding: "utf8", flag: "w" });
    send(res, 200, { ok: true, path: relative(workspaceRoot, path), bytes: Buffer.byteLength(body.content) }); return;
  }
  if (url.pathname === "/v1/terminal/execute") { send(res, 200, await executeCommand(body)); return; }
  if (url.pathname === "/v1/http/request") { send(res, 200, await httpRequest(body)); return; }
  if (url.pathname === "/v1/sessions/save") {
    const path = await sessionPath(body.id || randomUUID());
    const state = JSON.stringify({ id: body.id || path.split(sep).pop()?.replace(/\\.json$/, ""), updatedAt: new Date().toISOString(), state: body.state ?? null });
    if (state.length > 2 * 1024 * 1024) throw new Error("Session state is too large.");
    const temp = path + ".tmp";
    await writeFile(temp, state, { encoding: "utf8", mode: 0o600 });
    await rename(temp, path);
    send(res, 200, { ok: true, id: path.split(sep).pop()?.replace(/\\.json$/, "") }); return;
  }
  if (url.pathname === "/v1/sessions/load") {
    const path = await sessionPath(body.id);
    send(res, 200, JSON.parse(await readFile(path, "utf8"))); return;
  }
  send(res, 404, { error: "Unknown agent runtime endpoint." });
}
async function main(): Promise<void> {
  if (!TOKEN || TOKEN.length < 32) throw new Error("Set OMDA_AGENT_TOKEN to a random secret of at least 32 characters.");
  workspaceRoot = await realpath(WORKSPACE_INPUT);
  const server = createServer((req, res) => {
    void route(req, res).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Agent runtime request failed.";
      send(res, 400, { error: message.slice(0, 300) });
    });
  });
  server.listen(PORT, HOST, () => {
    process.stdout.write("AL OMDA Agent Runtime listening on http://" + HOST + ":" + PORT + "\\n");
    process.stdout.write("Workspace: " + workspaceRoot + "\\n");
    process.stdout.write("Terminal execution: " + EXECUTION_MODE + "\\n");
    process.stdout.write("Authorized HTTP targets: " + ALLOWED_HOSTS.size + "\\n");
  });
}
void main().catch((error: unknown) => { process.stderr.write((error instanceof Error ? error.message : String(error)) + "\\n"); process.exitCode = 1; });
