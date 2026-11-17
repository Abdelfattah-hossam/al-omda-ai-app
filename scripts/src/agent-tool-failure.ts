export function redactAgentToolFailureMessage(value: unknown): string {
  return String(value || "Tool failed.")
    .slice(0, 1000)
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|sk-or-v1-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[REDACTED_TOKEN]")
    .replace(/(api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*["']?[^"'\s,;]+/gi, "$1=[REDACTED]")
    .replace(/https?:\/\/[^/@\s]+:[^/@\s]+@/gi, "https://[REDACTED]@");
}

export function isAgentToolResultFailure(toolName: string, result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const details = result as Record<string, unknown>;
  if (details.isError === true) return true;
  // HTTP non-2xx responses are often intentional probes; report transport/MCP errors, not status codes.
  return details.ok === false && toolName !== "http.request";
}
