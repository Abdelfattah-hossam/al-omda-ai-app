import { isAbsolute, relative, resolve, sep } from "node:path";

export function resolveAgentDraftPath(root: string, input: unknown, allowRoot = false): string {
  if (typeof input !== "string" || !input.trim() || input.includes("\0") || isAbsolute(input)) {
    throw new Error("A valid relative draft path is required.");
  }
  const candidate = resolve(root, input);
  const rel = relative(root, candidate);
  if ((!allowRoot && !rel) || rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel)) {
    throw new Error("Draft path is outside the isolated workspace.");
  }
  const normalized = rel.split(sep).join("/");
  if (normalized && !isAgentDraftPathAllowed(normalized)) {
    throw new Error("This path is not allowed in an isolated draft workspace.");
  }
  return candidate;
}

export function isAgentDraftPathAllowed(path: string): boolean {
  if (!path || path.includes("\0") || path.startsWith("/") || path.split("/").some((part) => !part || part === "." || part === "..")) return false;
  const segments = path.split("/").map((part) => part.toLowerCase());
  return !segments.some((part) =>
    part === ".git" || part === ".omda" || part === "node_modules" || part === "dist" ||
    part === "build" || part === "coverage" || part === ".next" || part === ".wrangler" ||
    part === ".turbo" || part === ".env" || part.startsWith(".env.") ||
    [".npmrc", ".netrc", ".pypirc", ".ssh", ".aws", ".azure", "credentials.json", "secrets.json", "service-account.json", "id_rsa", "id_ed25519"].includes(part) ||
    /\.(pem|key|p12|pfx|jks|keystore)$/i.test(part)
  );
}

export function isAgentDraftSourcePathAllowed(path: string): boolean {
  return path === "" || isAgentDraftPathAllowed(path);
}
