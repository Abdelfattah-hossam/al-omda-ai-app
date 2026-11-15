export type SourceCodeArtifact = { title: string; name: string; language: string; code: string };

export function isSafeSvgSource(code: string): boolean {
  if (!/<svg\b[\s\S]*<\/svg\s*>/i.test(code)) return false;
  if (/<!DOCTYPE|<!ENTITY|<\s*(?:script|foreignObject|iframe|object|embed|audio|video)\b/i.test(code)) return false;
  if (/\bon[a-z][\w:-]*\s*=/i.test(code)) return false;
  if (/javascript\s*:/i.test(code) || /data\s*:\s*text\/html/i.test(code)) return false;
  if (/@import\b/i.test(code)) return false;
  if (/\b(?:href|xlink:href)\s*=\s*["']\s*(?!#|data:image\/(?:png|jpeg|gif|webp);base64,)[^"']+/i.test(code)) return false;
  if (/url\(\s*["']?\s*(?!#)[^)]+\)/i.test(code)) return false;
  return true;
}

export function parseSourceCodeFile(text: string, request: string): SourceCodeArtifact | null {
  const fence = String.fromCharCode(96).repeat(3);
  const trimmed = text.trim();
  if (!trimmed.startsWith(fence) || !trimmed.endsWith(fence)) return null;
  const firstLineEnd = trimmed.indexOf("\n");
  const lastFence = trimmed.lastIndexOf(fence);
  if (firstLineEnd < 0 || lastFence <= firstLineEnd) return null;
  const rawLanguage = trimmed.slice(fence.length, firstLineEnd).trim().toLowerCase();
  const code = trimmed.slice(firstLineEnd + 1, lastFence).trim();
  if (!code || code.length > 100000 || code.includes(fence)) return null;
  const requestedExtension = request.match(/\.(py|mjs|cjs|js|ts|tsx|jsx|css|sql|java|cpp|c|cs|go|rs|php|rb|sh|json|xml|ya?ml|md|html|svg|toml|ini)\b/i)?.[1]?.toLowerCase();
  const aliases: Record<string,string> = { javascript:"js",node:"js",typescript:"ts",python:"py",bash:"sh",shell:"sh",yml:"yaml",text:"txt" };
  const language = aliases[rawLanguage] || rawLanguage || requestedExtension || "txt";
  const extension = requestedExtension || aliases[rawLanguage] || rawLanguage || "txt";
  const allowed = /^(?:py|mjs|cjs|js|ts|tsx|jsx|css|sql|java|cpp|c|cs|go|rs|php|rb|sh|json|xml|yaml|md|txt|html|svg|toml|ini)$/;
  if (!allowed.test(extension)) return null;
  if (requestedExtension && language !== extension && !(extension === "mjs" && language === "js") && !(extension === "cjs" && language === "js")) return null;
  if (extension === "json") { try { JSON.parse(code); } catch { return null; } }
  if (extension === "html" && !/<[a-z][\s\S]*>/i.test(code)) return null;
  if (extension === "svg" && !isSafeSvgSource(code)) return null;
  if (extension === "css") {
    let depth = 0;
    for (const char of code) { if (char === "{") depth++; if (char === "}") depth--; if (depth < 0) return null; }
    if (depth !== 0) return null;
  }
  return { title: "Source code", name: "al-omda-source." + extension, language: extension, code };
}
