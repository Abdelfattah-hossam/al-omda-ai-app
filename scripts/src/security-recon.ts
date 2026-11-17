export type SecurityHeaderFinding = {
  header: string;
  severity: "low" | "medium" | "high";
  issue: string;
  recommendation: string;
};

export type SecurityHeaderAnalysis = {
  present: string[];
  missing: string[];
  recommendations: string[];
  findings: SecurityHeaderFinding[];
};

const MIN_HSTS_MAX_AGE_SECONDS = 15_552_000;
const REFERRER_POLICIES = new Set(["no-referrer", "no-referrer-when-downgrade", "origin", "origin-when-cross-origin", "same-origin", "strict-origin", "strict-origin-when-cross-origin", "unsafe-url"]);

function parseHstsMaxAge(value: string): number | null {
  const seen = new Set<string>();
  let maxAge: number | null = null;
  for (const rawDirective of value.split(";")) {
    const directive = rawDirective.trim();
    if (!directive) continue;
    const match = /^([A-Za-z0-9-]+)(?:\s*=\s*(?:"([^"]*)"|([^\s]+)))?$/.exec(directive);
    if (!match) return null;
    const name = match[1].toLowerCase();
    if (seen.has(name)) return null;
    seen.add(name);
    if (name === "max-age") {
      const rawValue = match[2] ?? match[3] ?? "";
      if (!/^\d+$/.test(rawValue)) return null;
      const parsed = Number(rawValue);
      if (!Number.isSafeInteger(parsed)) return null;
      maxAge = parsed;
    }
  }
  return maxAge;
}

function parseCspDirectives(value: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const rawDirective of value.split(";")) {
    const parts = rawDirective.trim().split(/\s+/).filter(Boolean);
    if (parts.length) {
      const name = parts[0].toLowerCase();
      // CSP ignores later duplicate directives; preserve the first effective value.
      if (!directives.has(name)) directives.set(name, parts.slice(1).map((part) => part.toLowerCase()));
    }
  }
  return directives;
}

function isValidCspBase64Value(value: string): boolean {
  if (!/^[a-z0-9+/_-]+={0,2}$/i.test(value)) return false;
  const unpadded = value.replace(/=+$/, "");
  const padding = value.length - unpadded.length;
  if (unpadded.length % 4 === 1) return false;
  if (padding > 0 && (value.length % 4 !== 0 || (padding === 1 && unpadded.length % 4 !== 3) || (padding === 2 && unpadded.length % 4 !== 2))) return false;
  return true;
}

function hasEffectiveUnsafeInline(sources: string[]): boolean {
  const hasUnsafeInline = sources.includes("'unsafe-inline'");
  const hasNonceOrHash = sources.some((source) => {
    const nonce = /^'nonce-([^']+)'$/i.exec(source);
    if (nonce) return isValidCspBase64Value(nonce[1]);
    const hash = /^'sha(?:256|384|512)-([^']+)'$/i.exec(source);
    return Boolean(hash && isValidCspBase64Value(hash[1]));
  });
  return hasUnsafeInline && !hasNonceOrHash;
}

function effectiveReferrerPolicy(value: string): string | null {
  const recognized = value.split(",").map((item) => item.trim().toLowerCase()).filter((item) => REFERRER_POLICIES.has(item));
  return recognized.length ? recognized[recognized.length - 1] : null;
}

export function analyzeSecurityHeaders(headers: Record<string, string>): SecurityHeaderAnalysis {
  const normalized = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value.trim()]));
  const csp = normalized.get("content-security-policy") || "";
  const frameAncestors = csp.match(/(?:^|;)\s*frame-ancestors\s+([^;]+)/i);
  const xFrameOptions = (normalized.get("x-frame-options") || "").toLowerCase();
  const frameProtection = ["deny", "sameorigin"].includes(xFrameOptions) || Boolean(frameAncestors?.[1]?.trim());
  const hsts = normalized.get("strict-transport-security") || "";
  const hstsMaxAge = parseHstsMaxAge(hsts);
  const xContentTypeOptions = (normalized.get("x-content-type-options") || "").toLowerCase();
  const checks: Array<{ name: string; present: boolean; recommendation: string }> = [
    { name: "strict-transport-security", present: hstsMaxAge !== null, recommendation: "Enable HSTS with a deliberate max-age; validate subdomain and preload requirements before enabling them." },
    { name: "content-security-policy", present: Boolean(csp), recommendation: "Define a Content-Security-Policy appropriate to the application; avoid unsafe-inline and unsafe-eval where possible." },
    { name: "x-content-type-options", present: xContentTypeOptions === "nosniff", recommendation: "Set X-Content-Type-Options: nosniff." },
    { name: "frame-protection", present: frameProtection, recommendation: "Prevent framing with CSP frame-ancestors or X-Frame-Options: DENY/SAMEORIGIN." },
    { name: "referrer-policy", present: normalized.has("referrer-policy"), recommendation: "Set a restrictive Referrer-Policy such as strict-origin-when-cross-origin." },
    { name: "permissions-policy", present: normalized.has("permissions-policy"), recommendation: "Define a Permissions-Policy that disables browser features the application does not need." },
  ];
  const findings: SecurityHeaderFinding[] = [];
  if (hsts && (hstsMaxAge === null || hstsMaxAge < MIN_HSTS_MAX_AGE_SECONDS)) findings.push({
    header: "strict-transport-security", severity: "medium",
    issue: "HSTS max-age is missing, invalid, or shorter than six months.",
    recommendation: "Use a max-age of at least 15,552,000 seconds after confirming the site is consistently available over HTTPS.",
  });
  if (normalized.has("x-content-type-options") && xContentTypeOptions !== "nosniff") findings.push({
    header: "x-content-type-options", severity: "medium",
    issue: "The header is present but its value is not nosniff.",
    recommendation: "Set the exact value to nosniff.",
  });
  if (normalized.has("x-frame-options") && !["deny", "sameorigin"].includes(xFrameOptions) && !frameProtection) findings.push({
    header: "x-frame-options", severity: "medium",
    issue: "X-Frame-Options is present but does not use DENY or SAMEORIGIN.",
    recommendation: "Use DENY or SAMEORIGIN, or configure a valid CSP frame-ancestors directive.",
  });
  if (csp) {
    if (/'unsafe-eval'/i.test(csp)) findings.push({
      header: "content-security-policy", severity: "high",
      issue: "The policy permits unsafe-eval, weakening script execution protections.",
      recommendation: "Remove unsafe-eval and use safer script loading patterns where possible.",
    });
    const cspDirectives = parseCspDirectives(csp);
    const defaultSources = cspDirectives.get("default-src") ?? [];
    const scriptSources = cspDirectives.get("script-src") ?? defaultSources;
    const styleSources = cspDirectives.get("style-src") ?? defaultSources;
    const inlinePolicies = [
      cspDirectives.get("script-src-elem") ?? scriptSources,
      cspDirectives.get("script-src-attr") ?? scriptSources,
      cspDirectives.get("style-src-elem") ?? styleSources,
      cspDirectives.get("style-src-attr") ?? styleSources,
    ];
    if (inlinePolicies.some(hasEffectiveUnsafeInline)) findings.push({
      header: "content-security-policy", severity: "medium",
      issue: "The effective script or style policy permits unsafe-inline without a nonce or hash source.",
      recommendation: "Prefer nonces or hashes instead of unsafe-inline, and validate the change against application behavior.",
    });
    if (/(?:^|\s)\*(?:\s|;|$)/.test(csp)) findings.push({
      header: "content-security-policy", severity: "medium",
      issue: "The policy contains a wildcard source that may allow resources from unintended origins.",
      recommendation: "Replace wildcard sources with the smallest explicit set of trusted origins.",
    });
  }
  if (effectiveReferrerPolicy(normalized.get("referrer-policy") || "") === "unsafe-url") findings.push({
    header: "referrer-policy", severity: "low",
    issue: "The policy may disclose the full referring URL to other origins.",
    recommendation: "Prefer strict-origin-when-cross-origin or no-referrer where appropriate.",
  });
  return {
    present: checks.filter((check) => check.present).map((check) => check.name),
    missing: checks.filter((check) => !check.present).map((check) => check.name),
    recommendations: checks.filter((check) => !check.present).map((check) => check.recommendation),
    findings,
  };
}
