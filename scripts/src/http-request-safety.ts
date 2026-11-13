const SENSITIVE_REQUEST_HEADER = /(authorization|cookie|token|secret|api[-_]?key|session|csrf|xsrf)/i;

export function shouldForwardHttpHeader(name: string, allowCredentials: boolean): boolean {
  if (!/^[a-z0-9-]{1,64}$/i.test(name)) return false;
  if (/^(host|connection|content-length|proxy-authorization)$/i.test(name)) return false;
  if (!allowCredentials && SENSITIVE_REQUEST_HEADER.test(name)) return false;
  return true;
}

export function assertCredentialRedirectAllowed(from: URL, to: URL, allowCredentials: boolean): void {
  if (allowCredentials && from.origin !== to.origin) {
    throw new Error("Refusing to forward authenticated role headers across a cross-origin redirect.");
  }
}
