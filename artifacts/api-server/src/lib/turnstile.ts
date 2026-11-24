import type { Request, Response, NextFunction } from 'express';

// Cloudflare Turnstile verification for abuse-prone, unauthenticated endpoints.
// The secret key is read only from the TURNSTILE_SECRET_KEY secret and is never logged.
const PROTECTED = /^\/api\/auth\/(?:login|signin|signup|forgot-password)\/?$/;
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

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
