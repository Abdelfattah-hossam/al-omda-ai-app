const CSP_META = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'\">";

export function parseHtmlAppArtifact(text: string): string | null {
  const source = text.trim()
    .replace(/^\s*\x60{3}(?:html)?\s*/i, "")
    .replace(/\s*\x60{3}\s*$/, "");
  if (!/<html[\s>]/i.test(source) || !/<body[\s>]/i.test(source) || !/<\/body>\s*<\/html>\s*$/i.test(source)) return null;
  if (/<script[\s>]/i.test(source) && !/<\/script>/i.test(source)) return null;
  if (/<style[\s>]/i.test(source) && !/<\/style>/i.test(source)) return null;
  if (!/<main[\s>]|<div[\s>]|<form[\s>]|<canvas[\s>]/i.test(source) || source.length > 90000) return null;
  const unsafeResource =
    /<(?:script|iframe|object|embed|link)\b[^>]*(?:src|href)\s*=\s*["']?\s*(?:https?:)?\/\//i.test(source) ||
    /<(?:img|source|video|audio)\b[^>]*\bsrc\s*=\s*["']?\s*(?:https?:)?\/\//i.test(source) ||
    /<form\b[^>]*\baction\s*=\s*["']?\s*(?:https?:)?\/\//i.test(source) ||
    /url\(\s*["']?\s*(?:https?:)?\/\//i.test(source) ||
    /\bjavascript\s*:/i.test(source);
  const unsafeScript =
    /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/i.test(source) ||
    /navigator\.sendBeacon\s*\(|window\.open\s*\(|document\.write\s*\(|\beval\s*\(|new\s+Function\s*\(/i.test(source) ||
    /import\s*\(\s*["'](?:https?:)?\/\//i.test(source);
  if (unsafeResource || unsafeScript || /<meta\b[^>]*http-equiv\s*=\s*["']?refresh/i.test(source)) return null;
  if (/<head\b[^>]*>/i.test(source)) return source.replace(/<head\b[^>]*>/i, (head) => head + CSP_META);
  return source.replace(/<html\b[^>]*>/i, (html) => html + "<head>" + CSP_META + "</head>");
}
