export type SecurityHeaderAnalysis = {
  present: string[];
  missing: string[];
  recommendations: string[];
};

export function analyzeSecurityHeaders(headers: Record<string, string>): SecurityHeaderAnalysis {
  const normalized = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  const checks: Array<{ name: string; present: boolean; recommendation: string }> = [
    { name: "strict-transport-security", present: normalized.has("strict-transport-security"), recommendation: "Enable HSTS on HTTPS sites after validating subdomain and preload requirements." },
    { name: "content-security-policy", present: normalized.has("content-security-policy"), recommendation: "Define a Content-Security-Policy appropriate to the application; avoid unsafe-inline and unsafe-eval where possible." },
    { name: "x-content-type-options", present: normalized.get("x-content-type-options")?.toLowerCase() === "nosniff", recommendation: "Set X-Content-Type-Options: nosniff." },
    { name: "frame-protection", present: normalized.has("x-frame-options") || /frame-ancestors/i.test(normalized.get("content-security-policy") || ""), recommendation: "Prevent framing with CSP frame-ancestors or an appropriate X-Frame-Options policy." },
    { name: "referrer-policy", present: normalized.has("referrer-policy"), recommendation: "Set a restrictive Referrer-Policy such as strict-origin-when-cross-origin." },
    { name: "permissions-policy", present: normalized.has("permissions-policy"), recommendation: "Define a Permissions-Policy that disables browser features the application does not need." },
  ];
  return {
    present: checks.filter((check) => check.present).map((check) => check.name),
    missing: checks.filter((check) => !check.present).map((check) => check.name),
    recommendations: checks.filter((check) => !check.present).map((check) => check.recommendation),
  };
}
