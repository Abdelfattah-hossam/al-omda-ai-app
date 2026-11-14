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

export function analyzeSecurityHeaders(headers: Record<string, string>): SecurityHeaderAnalysis {
  const normalized = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value.trim()]));
  const csp = normalized.get("content-security-policy") || "";
  const frameAncestors = csp.match(/(?:^|;)\\s*frame-ancestors\\s+([^;]+)/i);
  const xFrameOptions = (normalized.get("x-frame-options") || "").toLowerCase();
  const frameProtection = ["deny", "sameorigin"].includes(xFrameOptions) || Boolean(frameAncestors?.[1]?.trim());
  const hsts = normalized.get("strict-transport-security") || "";
  const hstsMaxAge = hsts.match(/(?:^|;)\\s*max-age\\s*=\\s*(\\d+)/i);
  const xContentTypeOptions = (normalized.get("x-content-type-options") || "").toLowerCase();
  const checks: Array<{ name: string; present: boolean; recommendation: string }> = [
    { name: "strict-transport-security", present: Boolean(hstsMaxAge), recommendation: "Enable HSTS with a deliberate max-age; validate subdomain and preload requirements before enabling them." },
    { name: "content-security-policy", present: Boolean(csp), recommendation: "Define a Content-Security-Policy appropriate to the application; avoid unsafe-inline and unsafe-eval where possible." },
    { name: "x-content-type-options", present: xContentTypeOptions === "nosniff", recommendation: "Set X-Content-Type-Options: nosniff." },
    { name: "frame-protection", present: frameProtection, recommendation: "Prevent framing with CSP frame-ancestors or X-Frame-Options: DENY/SAMEORIGIN." },
    { name: "referrer-policy", present: normalized.has("referrer-policy"), recommendation: "Set a restrictive Referrer-Policy such as strict-origin-when-cross-origin." },
    { name: "permissions-policy", present: normalized.has("permissions-policy"), recommendation: "Define a Permissions-Policy that disables browser features the application does not need." },
  ];
  const findings: SecurityHeaderFinding[] = [];
  if (hsts && (!hstsMaxAge || Number(hstsMaxAge[1]) < MIN_HSTS_MAX_AGE_SECONDS)) findings.push({
    header: "strict-transport-security", severity: "medium",
    issue: "HSTS max-age is missing, invalid, or shorter than six months.",
    recommendation: "Use a max-age of at least 15,552,000 seconds after confirming the site is consistently available over HTTPS.",
  });
  if (normalized.has("x-content-type-options") && xContentTypeOptions !== "nosniff") findings.push({
    header: "x-content-type-options", severity: "medium",
    issue: "The header is present but its value is not nosniff.",
    recommendation: "Set the exact value to nosniff.",
  });
  if (normalized.has("x-frame-options") && !["deny", "sameorigin"].includes(xFrameOptions) && !frameAncestors) findings.push({
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
    if (/'unsafe-inline'/i.test(csp)) findings.push({
      header: "content-security-policy", severity: "medium",
      issue: "The policy permits unsafe-inline, weakening protection against injected scripts or styles.",
      recommendation: "Prefer nonces or hashes instead of unsafe-inline, and validate the change against application behavior.",
    });
    if (/(?:^|\\s)\\*(?:\\s|;|$)/.test(csp)) findings.push({
      header: "content-security-policy", severity: "medium",
      issue: "The policy contains a wildcard source that may allow resources from unintended origins.",
      recommendation: "Replace wildcard sources with the smallest explicit set of trusted origins.",
    });
  }
  if ((normalized.get("referrer-policy") || "").toLowerCase().split(",").some((value) => value.trim() === "unsafe-url")) findings.push({
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
