export type CtfEncoding = "base64" | "base64url" | "hex" | "url" | "rot13" | "binary" | "caesar" | "html" | "unicode";

function assertInput(value: string): void {
  if (typeof value !== "string" || value.length > 100000) throw new Error("CTF input must be text no longer than 100,000 characters.");
}

function rot13(value: string): string {
  return value.replace(/[a-zA-Z]/g, (letter) => {
    const base = letter <= "Z" ? 65 : 97;
    return String.fromCharCode(((letter.charCodeAt(0) - base + 13) % 26) + base);
  });
}

function caesar(value: string, shift: number): string {
  const offset = ((shift % 26) + 26) % 26;
  return value.replace(/[a-zA-Z]/g, (letter) => {
    const base = letter <= "Z" ? 65 : 97;
    return String.fromCharCode(((letter.charCodeAt(0) - base + offset) % 26) + base);
  });
}

function decodeHtml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
    const key = entity.toLowerCase();
    if (key === "amp") return "&";
    if (key === "lt") return "<";
    if (key === "gt") return ">";
    if (key === "quot") return '"';
    if (key === "apos") return "'";
    if (key === "nbsp") return " ";
    const codePoint = key.startsWith("#x") ? Number.parseInt(key.slice(2), 16) : Number.parseInt(key.slice(1), 10);
    try { return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match; }
    catch { return match; }
  });
}

export function decodeCtfValue(value: string, encoding: CtfEncoding, shift = 13): string {
  assertInput(value);
  switch (encoding) {
    case "base64": {
      const clean = value.trim();
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 === 1) throw new Error("Invalid Base64 input.");
      return Buffer.from(clean, "base64").toString("utf8");
    }
    case "base64url": {
      const clean = value.trim();
      if (!/^[A-Za-z0-9_-]*={0,2}$/.test(clean) || clean.length % 4 === 1) throw new Error("Invalid Base64URL input.");
      return Buffer.from(clean.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    }
    case "hex": {
      const clean = value.replace(/\\s+/g, "");
      if (!/^(?:[0-9a-fA-F]{2})+$/.test(clean)) throw new Error("Hex input must contain complete byte pairs.");
      return Buffer.from(clean, "hex").toString("utf8");
    }
    case "url":
      try { return decodeURIComponent(value.replace(/\\+/g, " ")); }
      catch { throw new Error("Invalid percent-encoded URL text."); }
    case "rot13": return rot13(value);
    case "caesar":
      if (!Number.isInteger(shift) || shift < 0 || shift > 25) throw new Error("Caesar shift must be an integer from 0 to 25.");
      return caesar(value, shift);
    case "binary": {
      const clean = value.replace(/\\s+/g, "").replace(/^(?:0b)/i, "");
      if (!clean || clean.length % 8 !== 0 || !/^[01]+$/.test(clean)) throw new Error("Binary input must contain groups of eight bits.");
      return Buffer.from(clean.match(/.{8}/g)!.map((part) => Number.parseInt(part, 2))).toString("utf8");
    }
    case "html": return decodeHtml(value);
    case "unicode":
      return value.replace(/\\u([0-9a-fA-F]{4})|\\x([0-9a-fA-F]{2})/g, (_match, unicode: string | undefined, hex: string | undefined) => String.fromCharCode(Number.parseInt(unicode || hex || "0", 16)));
    default: throw new Error("Unsupported CTF decoding mode.");
  }
}

export function bruteForceCaesar(value: string): Array<{ shift: number; text: string }> {
  assertInput(value);
  return Array.from({ length: 26 }, (_, shift) => ({ shift, text: caesar(value, shift) }));
}

export function identifyHash(value: string): { candidates: string[]; length: number; note: string } {
  assertInput(value);
  const hash = value.trim();
  const candidates: string[] = [];
  if (/^\\$2[aby]\\$\\d{2}\\$[./A-Za-z0-9]{53}$/.test(hash)) candidates.push("bcrypt");
  if (/^\\$argon2(id|i|d)\\$/.test(hash)) candidates.push("Argon2");
  if (/^[a-fA-F0-9]{32}$/.test(hash)) candidates.push("MD5", "NTLM", "MD4 (possible)");
  if (/^[a-fA-F0-9]{40}$/.test(hash)) candidates.push("SHA-1");
  if (/^[a-fA-F0-9]{64}$/.test(hash)) candidates.push("SHA-256");
  if (/^[a-fA-F0-9]{96}$/.test(hash)) candidates.push("SHA-384");
  if (/^[a-fA-F0-9]{128}$/.test(hash)) candidates.push("SHA-512");
  return {
    candidates,
    length: hash.length,
    note: candidates.length ? "Length and format are heuristic only; they do not prove the algorithm." : "No common hash format matched these simple signatures.",
  };
}

function decodeJwtSegment(segment: string): unknown {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) throw new Error("JWT contains an invalid Base64URL segment.");
  const text = Buffer.from(segment, "base64url").toString("utf8");
  try { return JSON.parse(text); }
  catch { throw new Error("JWT header or payload is not valid JSON."); }
}

export function decodeJwtUnverified(token: string): { header: unknown; payload: unknown; signatureLength: number; signatureVerified: false; warning: string } {
  assertInput(token);
  const parts = token.trim().split(".");
  if (parts.length !== 3) throw new Error("JWT must contain exactly three dot-separated segments.");
  return {
    header: decodeJwtSegment(parts[0]),
    payload: decodeJwtSegment(parts[1]),
    signatureLength: parts[2].length,
    signatureVerified: false,
    warning: "This only decodes the JWT. Its signature, issuer, audience, and expiry have not been verified.",
  };
}
