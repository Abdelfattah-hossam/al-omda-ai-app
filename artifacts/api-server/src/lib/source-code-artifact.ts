export type SourceCodeArtifact = { title: string; name: string; language: string; code: string };

export function isValidDxfSource(code: string): boolean {
  if (!code.trim() || code.length > 100000 || code.includes("\0")) return false;
  // DXF files commonly end with line breaks; ignore only trailing empty lines.
  const lines = code.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  if (lines.length < 8 || lines.length % 2 !== 0) return false;

  const pairs: Array<[number, string]> = [];
  for (let i = 0; i < lines.length; i += 2) {
    const group = lines[i].trim();
    if (!/^-?\d+$/.test(group)) return false;
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
    } else if (!allowedNonEntityRecords.has(marker) && !(activeSection === "BLOCKS" && allowedEntities.has(marker))) {
      return false;
    }
  }

  if (!sawEof || activeSection || entitiesSectionCount !== 1) return false;

  const validatePreviewEntity = (type: string, data: Array<[number, string]>): boolean => {
    const values = (group: number) => data.filter(([code]) => code === group).map(([, value]) => value);
    const has = (group: number) => values(group).some((value) => value !== "");
    const number = (group: number) => Number(values(group)[0]);
    if (type === "LINE") return [10, 20, 11, 21].every(has);
    if (type === "POINT") return has(10) && has(20);
    if (type === "CIRCLE") return has(10) && has(20) && has(40) && number(40) > 0;
    if (type === "ARC") return has(10) && has(20) && has(40) && number(40) > 0 && has(50) && has(51) && number(50) >= 0 && number(50) < 360 && number(51) >= 0 && number(51) < 360;
    if (type === "TEXT" || type === "MTEXT") return has(10) && has(20) && has(40) && number(40) > 0 && (has(1) || has(3));
    if (type === "LWPOLYLINE") {
      const declaredCounts = values(90);
      if (declaredCounts.length !== 1 || !/^\d+$/.test(declaredCounts[0])) return false;
      const vertexCount = Number(declaredCounts[0]);
      const flags = has(70) ? number(70) : 0;
      if (!Number.isSafeInteger(vertexCount) || vertexCount < 2 || !Number.isInteger(flags) || flags < 0 || flags > 255) return false;
      if ((flags & 1) === 1 && vertexCount < 3) return false;
      let pendingX = false;
      let actualVertices = 0;
      for (const [group] of data) {
        if (group === 10) {
          if (pendingX) return false;
          pendingX = true;
        } else if (group === 20) {
          if (!pendingX) return false;
          pendingX = false;
          actualVertices++;
        }
      }
      return !pendingX && actualVertices === vertexCount;
    }
    return true;
  };

  let checkingEntities = false;
  let currentEntityType = "";
  let currentEntityData: Array<[number, string]> = [];
  const flushEntity = () => {
    if (checkingEntities && currentEntityType && !validatePreviewEntity(currentEntityType, currentEntityData)) return false;
    currentEntityType = "";
    currentEntityData = [];
    return true;
  };
  for (let index = 0; index < pairs.length; index++) {
    const [group, value] = pairs[index];
    if (group !== 0) {
      if (checkingEntities && currentEntityType) currentEntityData.push([group, value]);
      continue;
    }
    const marker = value.toUpperCase();
    if (marker === "SECTION" && pairs[index + 1]?.[0] === 2 && pairs[index + 1]?.[1].toUpperCase() === "ENTITIES") {
      if (!flushEntity()) return false;
      checkingEntities = true;
      index++;
      continue;
    }
    if (marker === "ENDSEC" && checkingEntities) {
      if (!flushEntity()) return false;
      checkingEntities = false;
      continue;
    }
    if (checkingEntities) {
      if (!flushEntity()) return false;
      currentEntityType = marker;
    }
  }
  if (!flushEntity()) return false;

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
