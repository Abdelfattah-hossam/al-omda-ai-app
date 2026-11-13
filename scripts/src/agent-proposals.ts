import { lstat, mkdir, readdir, realpath, rename, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";

export type ProposalBudget = { files: Map<string, number>; totalBytes: number };
export type ProposalFile = { path: string; bytes: number };

function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep));
}
export function isAllowedProposalPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  if (normalized.startsWith("/") || normalized.split("/").some((part) => part === "." || part === ".." || !part)) return false;
  const segments = normalized.split("/").map((part) => part.toLowerCase());
  return !segments.some((part) =>
    part === ".git" || part === ".omda" || part === "node_modules" || part === "dist" ||
    part === "build" || part === "coverage" || part === ".next" || part === ".wrangler" ||
    part === ".turbo" || part === ".env" || part.startsWith(".env.") ||
    [".npmrc", ".netrc", ".pypirc", ".ssh", ".aws", ".azure", ".kube", ".docker",
      "credentials.json", "secrets.json", "service-account.json", "id_rsa", "id_ed25519"].includes(part) ||
    /\\.(pem|key|p12|pfx|jks|keystore)$/i.test(part)
  );
}
function safeId(value: string): string {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(value)) throw new Error("Invalid delegation workspace ID.");
  return value;
}
async function ensureSafeDirectory(root: string, target: string): Promise<string> {
  const normalizedRoot = await realpath(root);
  const rel = relative(normalizedRoot, resolve(target));
  if (!rel || rel.startsWith("..") || rel.startsWith(sep) || resolve(target) === normalizedRoot) {
    if (resolve(target) === normalizedRoot) return normalizedRoot;
    throw new Error("Delegation path escapes its workspace.");
  }
  let current = normalizedRoot;
  for (const segment of rel.split(sep).filter(Boolean)) {
    current = resolve(current, segment);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("Delegation directories cannot contain symlinks or non-directory entries.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await mkdir(current, { mode: 0o700 });
    }
    const actual = await realpath(current);
    if (!isInside(normalizedRoot, actual)) throw new Error("Delegation directory escapes its workspace.");
    current = actual;
  }
  return current;
}

export async function createAgentProposalDirectory(workspaceRoot: string, runId: string, agentId: string): Promise<string> {
  safeId(runId); safeId(agentId);
  const base = await ensureSafeDirectory(workspaceRoot, resolve(workspaceRoot, ".omda"));
  const delegates = await ensureSafeDirectory(workspaceRoot, resolve(base, "delegates"));
  const runRoot = await ensureSafeDirectory(workspaceRoot, resolve(delegates, runId));
  return await ensureSafeDirectory(workspaceRoot, resolve(runRoot, agentId));
}

export async function writeAgentProposal(agentRoot: string, relativePath: unknown, content: unknown, budget: ProposalBudget): Promise<ProposalFile> {
  if (typeof relativePath !== "string" || !relativePath.trim() || relativePath.length > 240 || relativePath.includes("\0") || relativePath.includes("\\")) {
    throw new Error("Proposal path must be a short relative path using forward slashes.");
  }
  const segments = relativePath.split("/");
  if (segments.some((part) => !part || part === "." || part === ".." || part.length > 100)) throw new Error("Proposal path contains an unsafe segment.");
  if (!isAllowedProposalPath(relativePath)) throw new Error("Proposal path targets secrets, runtime state, dependencies, or generated build output and is not allowed.");
  if (typeof content !== "string" || Buffer.byteLength(content, "utf8") > 1024 * 1024) throw new Error("Each proposal file must contain at most 1 MB of UTF-8 text.");
  const root = await realpath(agentRoot);
  const target = resolve(root, ...segments);
  if (!isInside(root, target) || target === root) throw new Error("Proposal path escapes its isolated agent workspace.");
  const parent = await ensureSafeDirectory(root, dirname(target));
  let oldBytes = 0;
  try {
    const info = await lstat(target);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error("Proposal target must be a regular file, not a symlink or directory.");
    oldBytes = info.size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const bytes = Buffer.byteLength(content, "utf8");
  const existing = budget.files.has(relative(root, target));
  const nextTotal = budget.totalBytes - oldBytes + bytes;
  if (!existing && budget.files.size >= 40) throw new Error("An agent may create at most 40 proposal files.");
  if (nextTotal > 4 * 1024 * 1024) throw new Error("An agent proposal workspace is limited to 4 MB total.");
  const temporary = resolve(parent, "." + randomUUID() + ".tmp");
  await writeFile(temporary, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await rename(temporary, target);
  budget.files.set(relative(root, target), bytes);
  budget.totalBytes = nextTotal;
  return { path: relative(root, target), bytes };
}

export async function listAgentProposalFiles(agentRoot: string): Promise<ProposalFile[]> {
  const root = await realpath(agentRoot);
  const result: ProposalFile[] = [];
  const walk = async (directory: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (result.length >= 40) return;
      if (entry.isSymbolicLink()) continue;
      const full = resolve(directory, entry.name);
      const relativePath = prefix ? prefix + "/" + entry.name : entry.name;
      if (!isAllowedProposalPath(relativePath)) continue;
      if (entry.isDirectory()) await walk(full, relativePath);
      else if (entry.isFile()) {
        const info = await stat(full);
        if (info.size <= 1024 * 1024) result.push({ path: prefix ? prefix + "/" + entry.name : entry.name, bytes: info.size });
      }
    }
  };
  await walk(root, "");
  return result;
}

export async function writeDelegationManifest(workspaceRoot: string, runId: string, manifest: unknown): Promise<string> {
  safeId(runId);
  const root = await realpath(workspaceRoot);
  const delegates = await ensureSafeDirectory(root, resolve(root, ".omda", "delegates"));
  const runRoot = await ensureSafeDirectory(root, resolve(delegates, runId));
  const target = resolve(runRoot, "manifest.json");
  const serialized = JSON.stringify(manifest, null, 2) + "\n";
  if (Buffer.byteLength(serialized, "utf8") > 512 * 1024) throw new Error("Delegation manifest is too large.");
  const temporary = resolve(runRoot, "." + randomUUID() + ".tmp");
  await writeFile(temporary, serialized, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await rename(temporary, target);
  return relative(root, target);
}
