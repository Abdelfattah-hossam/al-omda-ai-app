export type CodeProjectFile = { path: string; content: string };
export type CodeProjectArtifact = {
  title: string;
  framework: string;
  entryPoint: string;
  files: CodeProjectFile[];
  buildCommand: string;
  testCommand?: string;
  buildStatus: "not_run";
  testStatus: "not_run";
};

const MAX_FILES = 60;
const MAX_FILE_BYTES = 60000;
const MAX_TOTAL_BYTES = 200000;
const SECRET_PATTERN = /(?:sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._-]{20,}|\b(?:api[_-]?key|client[_-]?secret|password|token|secret)\s*[:=]\s*["'](?!your_|replace_|example|placeholder|<)[^"']{12,}["'])/i;

function isSafeProjectPath(path: string): boolean {
  if (!path || path.length > 180 || path.startsWith("/") || path.startsWith("~") || path.includes("\\") || path.includes("\0")) return false;
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return false;
  if (parts.some((part) => ["node_modules", ".git", "dist", "build"].includes(part.toLocaleLowerCase()))) return false;
  if (parts.some((part, index) => {
    const name = part.toLocaleLowerCase();
    return name === ".env" || (name.startsWith(".env.") && !(index === parts.length - 1 && name === ".env.example"));
  })) return false;
  if (/\.(?:pem|key|p12|pfx|jks|keystore)$/i.test(path)) return false;
  return /^[\p{L}\p{N}._@+/-]+$/u.test(path);
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}

export function parseCodeProjectArtifact(raw: string): CodeProjectArtifact | null {
  let source = raw.trim();
  const marker = "ALOMDA_CODE_PROJECT_JSON:";
  if (source.startsWith(marker)) source = source.slice(marker.length).trim();
  source = source.replace(/^\x60{3}(?:json)?\s*/i, "").replace(/\s*\x60{3}\s*$/, "");
  const value = parseJsonObject(source);
  if (!value || typeof value.title !== "string" || !value.title.trim() || value.title.length > 160 ||
    typeof value.framework !== "string" || !value.framework.trim() || value.framework.length > 80 ||
    !Array.isArray(value.files) || value.files.length < 3 || value.files.length > MAX_FILES) return null;

  const seen = new Set<string>();
  const files: CodeProjectFile[] = [];
  let totalBytes = 0;
  for (const item of value.files) {
    if (!item || typeof item !== "object") return null;
    const file = item as Record<string, unknown>;
    if (typeof file.path !== "string" || !isSafeProjectPath(file.path) ||
      typeof file.content !== "string" || file.content.length > MAX_FILE_BYTES) return null;
    const normalizedPath = file.path.normalize("NFKC");
    const key = normalizedPath.toLocaleLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
    if (SECRET_PATTERN.test(file.content)) return null;
    totalBytes += new TextEncoder().encode(file.content).length;
    if (totalBytes > MAX_TOTAL_BYTES) return null;
    files.push({ path: normalizedPath, content: file.content });
  }

  const byPath = new Map(files.map((file) => [file.path.toLowerCase(), file]));
  const packageFile = byPath.get("package.json");
  const readme = byPath.get("readme.md");
  if (!packageFile || !readme) return null;
  const packageJson = parseJsonObject(packageFile.content);
  if (!packageJson || !packageJson.scripts || typeof packageJson.scripts !== "object" || Array.isArray(packageJson.scripts)) return null;
  const scripts = packageJson.scripts as Record<string, unknown>;
  if (typeof scripts.build !== "string" || !scripts.build.trim()) return null;
  if (["preinstall", "install", "postinstall"].some((name) => typeof scripts[name] === "string")) return null;
  if (scripts.build.length > 300 || /\b(?:curl|wget|powershell|rm\s+-rf|child_process|node\s+-e)\b/i.test(scripts.build)) return null;

  const isEntryPoint = (candidate: string) => /^(?:index\\.html|src\\/(?:main|index)\\.[cm]?[jt]sx?|src\\/app\\/page\\.[jt]sx?|app\\/page\\.[jt]sx?|pages\\/index\\.[jt]sx?)$/i.test(candidate);
  const detectedEntry = files.find((file) => isEntryPoint(file.path))?.path;
  const requestedEntry = typeof value.entryPoint === "string"
    ? files.find((file) => file.path.toLowerCase() === value.entryPoint.toLowerCase() && isEntryPoint(file.path))?.path
    : undefined;
  const entryPoint = requestedEntry || detectedEntry;
  if (!entryPoint) return null;

  const buildCommand = "npm run build";
  const testCommand = typeof scripts.test === "string" && scripts.test.trim() ? "npm test" : undefined;
  return {
    title: value.title.trim(),
    framework: value.framework.trim(),
    entryPoint,
    files,
    buildCommand,
    ...(testCommand ? { testCommand } : {}),
    buildStatus: "not_run",
    testStatus: "not_run",
  };
}
