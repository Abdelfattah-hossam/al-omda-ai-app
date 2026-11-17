import type { NextFunction, Request, Response } from "express";

export const ACCESS_COOKIE = "omda_access";
export const REFRESH_COOKIE = "omda_refresh";
const COOKIE_PATH = "/api";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

export type SupabaseUser = {
  id: string;
  email: string;
};

export type SupabaseSession = {
  user: SupabaseUser;
  accessToken: string;
};

type SupabaseConfig = { url: string; anonKey: string };

export class SupabaseHttpError extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown,
  ) {
    super("Supabase request failed");
    this.name = "SupabaseHttpError";
  }
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL?.trim() &&
      (process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim()),
  );
}

function getConfig(): SupabaseConfig {
  const rawUrl = process.env.SUPABASE_URL?.trim();
  const anonKey =
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim();
  if (!rawUrl || !anonKey) {
    throw new Error("Supabase is not configured on the API server.");
  }

  const parsedUrl = new URL(rawUrl);
  if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "localhost") {
    throw new Error("SUPABASE_URL must use HTTPS.");
  }

  return { url: parsedUrl.toString().replace(/\/+$/, ""), anonKey };
}

export function supabaseFetch(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
): Promise<globalThis.Response> {
  const config = getConfig();
  const headers = new Headers(init.headers);
  headers.set("apikey", config.anonKey);
  headers.set("authorization", `Bearer ${accessToken ?? config.anonKey}`);
  return fetch(`${config.url}${path}`, { ...init, headers });
}

export async function readSupabaseJson<T>(response: globalThis.Response): Promise<T> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new SupabaseHttpError(response.status, payload);
  }
  return payload as T;
}

export function supabasePublicMessage(error: unknown, fallback: string): string {
  if (error instanceof SupabaseHttpError) {
    const payload = error.payload;
    if (payload && typeof payload === "object") {
      const data = payload as Record<string, unknown>;
      const code = typeof data.code === "string" ? data.code : typeof data.error_code === "string" ? data.error_code : "";
      const messages: Record<string, string> = {
        over_email_send_rate_limit: "وصلت خدمة البريد التجريبية إلى حد إرسال رسائل التفعيل. يلزم إعداد SMTP مخصص حتى يتمكن جميع المستخدمين من إنشاء حساباتهم.",
        email_address_not_authorized: "خدمة البريد التجريبية لا تسمح بإرسال رسائل التفعيل إلى هذا العنوان. يلزم ربط SMTP مخصص.",
        signup_disabled: "إنشاء الحسابات متوقف حاليًا في إعدادات المصادقة.",
        email_not_confirmed: "الحساب لم يتم تأكيد بريده الإلكتروني بعد. افتح رسالة التفعيل ثم حاول تسجيل الدخول.",
        over_request_rate_limit: "طلبات كثيرة خلال وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.",
        weak_password: "كلمة المرور ضعيفة. استخدم كلمة مرور أقوى لا تقل عن 8 أحرف.",
        user_already_exists: "هذا البريد مسجل بالفعل. جرّب تسجيل الدخول بدل إنشاء حساب جديد.",
        email_exists: "هذا البريد مسجل بالفعل. جرّب تسجيل الدخول بدل إنشاء حساب جديد.",
      };
      if (code && messages[code]) return messages[code];
      for (const key of ["msg", "message", "error_description"]) {
        const message = data[key];
        if (typeof message === "string" && message.length < 240) return message;
      }
    }
    return fallback;
  }
  return fallback;
}

function cookieOptions(req: Request) {
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || req.secure || forwardedProto === "https",
    sameSite: "lax" as const,
    path: COOKIE_PATH,
    maxAge: COOKIE_MAX_AGE,
  };
}

export function setSessionCookies(
  req: Request,
  res: Response,
  session: { access_token: string; refresh_token: string; expires_in?: number },
): void {
  const options = cookieOptions(req);
  const accessAge =
    typeof session.expires_in === "number"
      ? Math.min(session.expires_in * 1000, COOKIE_MAX_AGE)
      : COOKIE_MAX_AGE;
  res.cookie(ACCESS_COOKIE, session.access_token, { ...options, maxAge: accessAge });
  res.cookie(REFRESH_COOKIE, session.refresh_token, options);
}

export function clearSessionCookies(req: Request, res: Response): void {
  const { maxAge: _maxAge, ...options } = cookieOptions(req);
  res.clearCookie(ACCESS_COOKIE, options);
  res.clearCookie(REFRESH_COOKIE, options);
}

export async function resolveSession(
  req: Request,
  res: Response,
): Promise<SupabaseSession | null> {
  if (!isSupabaseConfigured()) return null;
  const accessToken = req.cookies?.[ACCESS_COOKIE] as string | undefined;
  const refreshToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!accessToken && !refreshToken) return null;

  if (accessToken) {
    const current = await supabaseFetch("/auth/v1/user", {}, accessToken);
    if (current.ok) {
      const user = await readSupabaseJson<SupabaseUser>(current);
      if (user?.id && user.email) return { user, accessToken };
      clearSessionCookies(req, res);
      return null;
    }
    if (current.status !== 401 && current.status !== 403) {
      throw new SupabaseHttpError(current.status, await current.json().catch(() => null));
    }
  }
  if (!refreshToken) {
    clearSessionCookies(req, res);
    return null;
  }

  const refreshed = await supabaseFetch("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!refreshed.ok) {
    clearSessionCookies(req, res);
    return null;
  }
  const session = await readSupabaseJson<{
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    user: SupabaseUser;
  }>(refreshed);
  if (!session.access_token || !session.refresh_token || !session.user?.id || !session.user.email) {
    clearSessionCookies(req, res);
    return null;
  }
  setSessionCookies(req, res, session);
  return { user: session.user, accessToken: session.access_token };
}

export function requireSameOrigin(req: Request, res: Response, next: NextFunction): void {
  const origin = req.get("origin");
  const host =
    req.get("x-forwarded-host")?.split(",")[0]?.trim() ?? req.get("host") ?? "";
  if (!origin || !host) {
    res.status(403).json({ error: "This request must come from the AL OMDA AI app." });
    return;
  }
  try {
    if (new URL(origin).host.toLowerCase() !== host.toLowerCase()) {
      res.status(403).json({ error: "This request must come from the AL OMDA AI app." });
      return;
    }
  } catch {
    res.status(403).json({ error: "This request must come from the AL OMDA AI app." });
    return;
  }
  next();
}

export function requireSameOriginRead(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== "GET") {
    requireSameOrigin(req, res, next);
    return;
  }
  const host = req.get("host") ?? "";
  if (!host) {
    res.status(403).json({ error: "This request must come from the AL OMDA AI app." });
    return;
  }
  const origin = req.get("origin");
  if (origin) {
    requireSameOrigin(req, res, next);
    return;
  }
  const fetchSite = req.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "same-origin" || fetchSite === "none") {
    next();
    return;
  }
  if (fetchSite === "cross-site" || fetchSite === "same-site") {
    res.status(403).json({ error: "This request must come from the AL OMDA AI app." });
    return;
  }
  const referer = req.get("referer");
  if (referer) {
    try {
      if (new URL(referer).host.toLowerCase() === host.toLowerCase()) {
        next();
        return;
      }
    } catch {
      // Reject malformed referrers below.
    }
  }
  res.status(403).json({ error: "This request must come from the AL OMDA AI app." });
}

export function reportSupabaseError(
  req: Request,
  res: Response,
  error: unknown,
  fallback: string,
): void {
  console.error("Supabase operation failed", error);
  if (error instanceof SupabaseHttpError) {
    const payload = error.payload;
    const code =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>).code
        : undefined;
    if (code === "42P01" || code === "PGRST205" || code === "PGRST204") {
      res.status(503).json({
        error: "Supabase tables are not ready. Run supabase/setup.sql in the Supabase SQL Editor.",
      });
      return;
    }
    const message = supabasePublicMessage(error, fallback);
    res.status(error.status >= 400 && error.status < 500 ? error.status : 502).json({ error: message });
    return;
  }
  res.status(502).json({ error: fallback });
}
