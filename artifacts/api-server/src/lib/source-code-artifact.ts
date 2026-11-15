export type SourceCodeArtifact = { title: string; name: string; language: string; code: string };

export function isValidDxfSource(code: string): boolean {
  if (!code.trim() || code.length > 100000 || code.includes("\\0")) return false;
  // DXF files commonly end with one or more line breaks; ignore only trailing
  // empty lines so a valid final group-code/value pair is not rejected.
  const lines = code.replace(/\\r\\n?/g, "\\n").split("\\n");
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  if (lines.length < 8 || lines.length % 2 !== 0) return false;

  const pairs: Array<[number, string]> = [];
  for (let i = 0; i < lines.length; i += 2) {
    const group = lines[i].trim();
    if (!/^-?\\d+$/.test(group)) return false;
    const groupCode = Number(group);
    if (!Number.isSafeInteger(groupCode) || groupCode < 0 || groupCode > 1071) return false;
    pairs.push([groupCode, lines[i + 1].trim()]);
  }

  const allowedEntities = new Set([
    "POINT", "LINE", "CIRCLE", "ARC", "ELLIPSE", "LWPOLYLINE", "POLYLINE",
    "VERTEX", "SEQEND", "TEXT", "MTEXT", "SOLID", "3DFACE", "INSERT",
    "ATTDEF", "ATTRIB", "DIMENSION", "HATCH", "SPLINE", "RAY", "XLINE", "LEADER",
  ]);
  const allowedNonEntityRecords = new Set([
    "TABLE", "ENDTAB", "BLOCK", "ENDBLK", "LAYER", "LTYPE", "STYLE",
    "DIMSTYLE", "VIEW", "UCS", "VPORT", "APPID", "BLOCK_RECORD",
    "DICTIONARY", "XRECORD", "GROUP", "LAYOUT", "MLINESTYLE",
  ]);

  let activeSection = "";
  let entitiesSectionCount = 0;
  let entityCount = 0;
  let sawEof = false;

  for (let i = 0; i < pairs.length; i++) {
    const [group, value] = pairs[i];
    if (group !== 0) continue;
    const marker = value.toUpperCase();

    if (marker === "SECTION") {
      if (activeSection || pairs[i + 1]?.[0] !== 2 || !pairs[i + 1][1]) return false;
      activeSection = pairs[i + 1][1].toUpperCase();
      if (activeSection === "ENTITIES") entitiesSectionCount++;
      if (entitiesSectionCount > 1) return false;
      i++;
      continue;
    }
    if (marker === "ENDSEC") {
      if (!activeSection) return false;
      activeSection = "";
      continue;
    }
    if (marker === "EOF") {
      if (activeSection || i !== pairs.length - 1) return false;
      sawEof = true;
      continue;
    }
    if (sawEof) return false;

    if (activeSection === "ENTITIES") {
      if (!allowedEntities.has(marker)) return false;
      entityCount++;
    } else if (!allowedNonEntityRecords.has(marker) && !(activeSection === "BLOCKS" && allowedEntities.has(marker))) {
      return false;
    }
  }

  if (!sawEof || activeSection || entitiesSectionCount !== 1) return false;

  for (const [group, value] of pairs) {
    if ([10, 20, 11, 21, 30, 31, 40, 41, 42, 50, 51, 70, 90].includes(group) && value !== "" && !Number.isFinite(Number(value))) return false;
  }
  return true;
}

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
  const requestedExtension = request.match(/\.(py|mjs|cjs|js|ts|tsx|jsx|css|sql|java|cpp|c|cs|go|rs|php|rb|sh|json|xml|ya?ml|md|html|svg|dxf|toml|ini)\b/i)?.[1]?.toLowerCase();
  const aliases: Record<string,string> = { javascript:"js",node:"js",typescript:"ts",python:"py",bash:"sh",shell:"sh",yml:"yaml",text:"txt" };
  const language = aliases[rawLanguage] || rawLanguage || requestedExtension || "txt";
  const extension = requestedExtension || aliases[rawLanguage] || rawLanguage || "txt";
  const allowed = /^(?:py|mjs|cjs|js|ts|tsx|jsx|css|sql|java|cpp|c|cs|go|rs|php|rb|sh|json|xml|yaml|md|txt|html|svg|dxf|toml|ini)$/;
  if (!allowed.test(extension)) return null;
  if (requestedExtension && language !== extension && !(extension === "mjs" && language === "js") && !(extension === "cjs" && language === "js")) return null;
  if (extension === "json") { try { JSON.parse(code); } catch { return null; } }
  if (extension === "html" && !/<[a-z][\s\S]*>/i.test(code)) return null;
  if (extension === "svg" && !isSafeSvgSource(code)) return null;
  if (extension === "dxf" && !isValidDxfSource(code)) return null;
  if (extension === "css") {
    let depth = 0;
    for (const char of code) { if (char === "{") depth++; if (char === "}") depth--; if (depth < 0) return null; }
    if (depth !== 0) return null;
  }
  return { title: "Source code", name: "al-omda-source." + extension, language: extension, code };
}
