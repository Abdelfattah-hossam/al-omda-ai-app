// Cloudflare Turnstile (public site key; the secret key lives only on the API server).
export const TURNSTILE_SITE_KEY = '0x4AAAAAAGQhvVJ0NNA4AfAH';
const PROTECTED = /^\/api\/auth\/(?:login|signin|signup|forgot-password)\/?$/;
type TurnstileApi = { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id: string) => void };
const w = window as unknown as { turnstile?: TurnstileApi };
const tokens = new Map<string, string>();
let scriptPromise: Promise<TurnstileApi> | null = null;

export function loadTurnstile(): Promise<TurnstileApi> {
  if (w.turnstile) return Promise.resolve(w.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = () => (w.turnstile ? resolve(w.turnstile) : reject(new Error('turnstile')));
      s.onerror = () => { scriptPromise = null; reject(new Error('turnstile')); };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}
export function setTurnstileToken(id: string, token: string | null) { if (token) tokens.set(id, token); else tokens.delete(id); }
export function currentTurnstileToken(): string { return Array.from(tokens.values()).pop() ?? ''; }

// Attach the token to protected auth requests, then reset widgets because tokens are single-use.
const originalFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  let url = '';
  try { url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href).pathname; } catch { /* ignore */ }
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (method !== 'POST' || !PROTECTED.test(url)) return originalFetch(input, init);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const token = currentTurnstileToken();
  if (token) headers.set('x-turnstile-token', token);
  try { return await originalFetch(input, { ...init, headers }); }
  finally { tokens.clear(); window.dispatchEvent(new Event('turnstile-reset')); }
};
