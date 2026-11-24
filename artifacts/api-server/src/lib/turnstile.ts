import type { Request, Response, NextFunction } from 'express';
import { supabaseFetch } from './supabase';
import { verifyPow } from './pow';

// Cloudflare Turnstile verification for abuse-prone, unauthenticated endpoints.
// The secret key is read only from the TURNSTILE_SECRET_KEY secret and is never logged.
const PROTECTED = /^\/api\/auth\/(?:login|signin|signup|forgot-password)\/?$/;
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
// Marker header the web client sends when the Turnstile widget itself failed on
// that browser (unsupported WebView, blocked challenge script, challenge error
// that persists after a retry). Value is the widget's error code.
const CLIENT_ERROR_RE = /^[a-z0-9_.-]{1,32}$/i;

// Bounds for the fallback path, counted in a shared database table so they hold
// across every server instance: per IP per hour, per IP per day and per account
// per day. Over any of them the fallback locks out until the window slides.
const IP_HOURLY_MAX = 10;
const IP_DAILY_MAX = 30;
const EMAIL_DAILY_MAX = 10;

type FallbackLimiter = (key: string, windowSeconds: number, max: number) => Promise<boolean>;

const dbLimiter: FallbackLimiter = async (key, windowSeconds, max) => {
  const r = await supabaseFetch('/rest/v1/rpc/omda_turnstile_fallback_hit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ p_key: key, p_window_seconds: windowSeconds, p_max: max }),
  });
  return (await r.json()) === true;
};

// Test hook: unit tests swap the limiter so no live database call is needed.
let limiter: FallbackLimiter = dbLimiter;
export function setTurnstileFallbackLimiterForTests(fn: FallbackLimiter | null): void {
  limiter = fn ?? dbLimiter;
}

async function fallbackAllowed(ip: string, email: string): Promise<boolean> {
  const checks: Promise<boolean>[] = [
    limiter(`ip:${ip}:h`, 3600, IP_HOURLY_MAX),
    limiter(`ip:${ip}:d`, 86400, IP_DAILY_MAX),
  ];
  if (email) checks.push(limiter(`em:${email}:d`, 86400, EMAIL_DAILY_MAX));
  try {
    return (await Promise.all(checks)).every(Boolean);
  } catch {
    // The fallback path fails closed when its limiter is unreachable; the
    // normal verified-token path is unaffected.
    return false;
  }
}

export function turnstileGuard(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== 'POST' || !PROTECTED.test(req.path)) { next(); return; }
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    // Not configured on this deployment yet: stay open rather than lock everyone out.
    next();
    return;
  }
  const token = req.get('x-turnstile-token')?.trim() ?? '';
  if (!token || token.length > 2048) {
    // A client-reported widget error is never by itself a pass: it only opens a
    // narrow fallback that is rate-limited per IP and per account in a shared
    // table, with lockout when any window is exceeded. Verified clients keep
    // sending tokens and never touch this path.
    const powHeader = req.get('x-pow')?.trim() ?? '';
    if (!token && powHeader) {
      // Proof-of-work challenge for browsers where Turnstile cannot render. The
      // challenge is signed, expires and is single-use; per-IP/account bounds still apply.
      const nonce = verifyPow(powHeader.slice(0, 200));
      if (!nonce) { res.status(403).json({ error: 'فشل التحقق الأمني. حدّث الصفحة وحاول مرة أخرى. / Security check failed. Refresh and try again.' }); return; }
      const ip = req.get('cf-connecting-ip') || req.ip || 'unknown';
      const body = req.body as { email?: unknown } | undefined;
      const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '';
      void (async () => {
        let ok = false;
        try { ok = (await limiter(`pow:${nonce}`, 900, 1)) && (await fallbackAllowed(ip, email)); } catch { ok = false; }
        if (ok) { next(); return; }
        res.status(429).json({ error: 'تجاوزت حد المحاولات من هذا المتصفح. حاول لاحقًا. / Too many attempts from this browser. Try later.' });
      })();
      return;
    }
    const clientError = req.get('x-turnstile-client-error')?.trim() ?? '';
    if (!token && CLIENT_ERROR_RE.test(clientError)) {
      const ip = req.get('cf-connecting-ip') || req.ip || 'unknown';
      const body = req.body as { email?: unknown } | undefined;
      const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '';
      void fallbackAllowed(ip, email).then((ok) => {
        if (ok) {
          console.warn(`turnstile: bounded client-error fallback (${clientError})`);
          next();
          return;
        }
        res.status(429).json({ error: 'تجاوزت حد المحاولات من هذا المتصفح. استخدم متصفحًا يدعم التحقق الأمني مثل Chrome أو Safari، أو حاول لاحقًا. / Too many attempts from this browser. Use a browser that supports the security check, or try later.' });
      });
      return;
    }
    res.status(400).json({ error: 'أكمل التحقق الأمني ثم حاول مرة أخرى. / Complete the security check and try again.' });
    return;
  }
  const form = new URLSearchParams({ secret, response: token });
  const ip = req.get('cf-connecting-ip');
  if (ip) form.set('remoteip', ip);
  void (async () => {
    try {
      const r = await fetch(VERIFY_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(8000) });
      const data = (await r.json()) as { success?: boolean };
      if (data.success === true) { next(); return; }
      res.status(403).json({ error: 'فشل التحقق الأمني. حدّث الصفحة وحاول مرة أخرى. / Security check failed. Refresh and try again.' });
    } catch {
      res.status(503).json({ error: 'تعذر التحقق الأمني الآن. حاول بعد قليل. / Security check unavailable. Try again shortly.' });
    }
  })();
}
