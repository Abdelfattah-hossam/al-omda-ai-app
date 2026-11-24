import type { Request, Response, NextFunction } from 'express';

export const SECURITY_HEADERS: Record<string, string> = {
 'X-Content-Type-Options': 'nosniff',
 'X-Frame-Options': 'DENY',
 'Referrer-Policy': 'strict-origin-when-cross-origin',
 'Permissions-Policy': 'camera=(), microphone=(self), geolocation=(), payment=()',
 'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
 'Strict-Transport-Security': 'max-age=31536000',
};
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
 for (const [key, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(key, value);
 res.setHeader('Cache-Control', 'no-store');
 next();
}
// Best-effort isolate-local protection supplements Supabase's upstream auth
// limits. AI limits are separately enforced by an atomic shared database RPC.
const authWindows = new Map<string, { until: number; count: number }>();
export function authBurstGuard(req: Request, res: Response, next: NextFunction): void {
 if (req.method !== 'POST' || !/^\/api\/auth\/(?:login|signin|signup|forgot-password|reset-password|change-password|assisted-reset|recovery)/.test(req.path)) { next(); return; }
 const now = Date.now();
 for (const [key, state] of authWindows) if (state.until <= now) authWindows.delete(key);
 const key = req.get('cf-connecting-ip') || req.ip || 'unknown';
 let state = authWindows.get(key);
 if (!state) {
  if (authWindows.size >= 10000) authWindows.delete(authWindows.keys().next().value!);
  state = { until: now + 60000, count: 0 }; authWindows.set(key, state);
 }
 if (++state.count > 30) { res.setHeader('Retry-After', '60'); res.status(429).json({error:'Too many sign-in or recovery attempts. Try again in a minute.'}); return; }
 next();
}
