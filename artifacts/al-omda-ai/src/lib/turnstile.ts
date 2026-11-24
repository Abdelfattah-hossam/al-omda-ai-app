import { fetchAndSolvePow, type PowSolution } from './pow';
// Cloudflare Turnstile (public site key; the secret key lives only on the API server).
export const TURNSTILE_SITE_KEY = '0x4AAAAAAGQhvVJ0NNA4AfAH';
const PROTECTED = /^\/api\/auth\/(?:login|signin|signup|forgot-password)\/?$/;
type TurnstileApi = { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id: string) => void };
const w = window as unknown as { turnstile?: TurnstileApi };
const tokens = new Map<string, string>();
// Set when the widget itself cannot run on this browser (unsupported client,
// blocked challenge script). The request then carries a client-error marker
// instead of a token and the API server lets it through, so people on such
// browsers are not locked out. Browsers with a working widget keep sending
// real tokens and stay fully verified.
let clientError = '';
let powPromise: Promise<PowSolution | null> | null = null;
function startPow() { powPromise = fetchAndSolvePow().catch(() => null); }
// Widgets mounted on the page, and a way to wait until verification is settled
// (token received or the widget gave up) so pressing login early just waits.
let mounted = 0;
export function registerTurnstileBox(delta: number) { mounted += delta; }
const settleWaiters: Array<() => void> = [];
function settle() { while (settleWaiters.length) (settleWaiters.pop() as () => void)(); }
function waitSettled(ms: number): Promise<void> { return new Promise((r) => { const t = setTimeout(r, ms); settleWaiters.push(() => { clearTimeout(t); r(); }); }); }
export function onPowReady(cb: () => void): () => void { let off = false; const p = powPromise; if (p) void p.then(() => { if (!off) cb(); }); else cb(); return () => { off = true; }; }
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
export function setTurnstileToken(id: string, token: string | null) { if (token) { tokens.set(id, token); clientError = ''; settle(); } else tokens.delete(id); }
export function setTurnstileClientError(code: string) { clientError = String(code || 'unknown').slice(0, 32); if (!powPromise) startPow(); settle(); }
export function currentTurnstileToken(): string { return Array.from(tokens.values()).pop() ?? ''; }

// Attach the token to protected auth requests, then reset widgets because tokens are single-use.
const originalFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  let url = '';
  try { url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href).pathname; } catch { /* ignore */ }
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (method !== 'POST' || !PROTECTED.test(url)) return originalFetch(input, init);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  if (mounted > 0 && !currentTurnstileToken() && !clientError) await waitSettled(45000);
  const token = currentTurnstileToken();
  if (token) headers.set('x-turnstile-token', token);
  else if (clientError) {
    // Widget cannot run here: complete a real proof-of-work challenge instead.
    const sol = powPromise ? await powPromise : null;
    if (sol) headers.set('x-pow', `${sol.c}|${sol.s}|${sol.n}`);
  }
  try { return await originalFetch(input, { ...init, headers }); }
  finally { tokens.clear(); if (clientError) startPow(); window.dispatchEvent(new Event('turnstile-reset')); }
};
