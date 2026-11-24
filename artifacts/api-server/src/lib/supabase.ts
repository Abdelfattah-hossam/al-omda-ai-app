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


export function requireInstalledMemoryGeneration(candidate: string, insertedRows: Array<{ generation?: string }>): string {
  if (insertedRows[0]?.generation !== candidate) {
    throw new Error("AI memory generation initialization lost a concurrent update. Retry the memory operation.");
  }
  return candidate;
}

export async function getOrCreateMemoryGeneration(userId: string, accessToken: string): Promise<string> {
  const query = new URLSearchParams({ select: "generation", user_id: "eq." + userId, limit: "1" });
  const readCurrent = async () => {
    const response = await supabaseFetch("/rest/v1/ai_memory_state?" + query.toString(), {}, accessToken);
    const rows = await readSupabaseJson<Array<{ generation?: string }>>(response);
    return typeof rows[0]?.generation === "string" ? rows[0].generation : null;
  };
  const existing = await readCurrent();
  if (existing) return existing;

  const candidate = crypto.randomUUID();
  const createResponse = await supabaseFetch("/rest/v1/ai_memory_state?on_conflict=user_id&select=generation", {
    method: "POST",
    headers: { "content-type": "application/json", Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify({ user_id: userId, generation: candidate, updated_at: new Date().toISOString() }),
  }, accessToken);
  const insertedRows = await readSupabaseJson<Array<{ generation?: string }>>(createResponse);
  return requireInstalledMemoryGeneration(candidate, insertedRows);
}

export async function advanceMemoryGeneration(userId: string, accessToken: string): Promise<string> {
  const generation = crypto.randomUUID();
  const response = await supabaseFetch("/rest/v1/ai_memory_state?on_conflict=user_id", {
    method: "POST",
    headers: { "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ user_id: userId, generation, updated_at: new Date().toISOString() }),
  }, accessToken);
  const rows = await readSupabaseJson<Array<{ generation?: string }>>(response);
  return typeof rows[0]?.generation === "string" ? rows[0].generation : generation;
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
        if (typeof message === "string" && message.length < 240 && !/relation|column|function|schema|syntax|violates|permission denied|pg_|postgres|sql/i.test(message)) return message;
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

async function resolveSessionBase(
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

// Account suspension is checked centrally, including old already-signed-in sessions.
export async function resolveSession(req:Request,res:Response):Promise<SupabaseSession|null>{
 const session=await resolveSessionBase(req,res);if(!session)return null;
 const response=await supabaseFetch('/rest/v1/rpc/omda_account_access',{method:'POST',headers:{'content-type':'application/json'},body:'{}'},session.accessToken);
 const access=await readSupabaseJson<{suspended?:boolean}>(response);
 if(access?.suspended){clearSessionCookies(req,res);return null;}
 return session;
}

export function requireSameOrigin(req: Request, res: Response, next: NextFunction): void {
  const origin = req.get("origin");
  const host =
    req.get("x-forwarded-host")?.split(",")[0]?.trim() ?? req.get("host") ?? "";
  if (!origin || !host) {
    res.status(403).json({ error: "This request must come from the Munjizly app." });
    return;
  }
  try {
    if (new URL(origin).host.toLowerCase() !== host.toLowerCase()) {
      res.status(403).json({ error: "This request must come from the Munjizly app." });
      return;
    }
  } catch {
    res.status(403).json({ error: "This request must come from the Munjizly app." });
    return;
  }
  next();
}

export function requireSameOriginRead(req: Request, res: Response, next: NextFunction): void {
  const fetchSite = req.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    res.status(403).json({ error: "This private read must come from the Munjizly app." });
    return;
  }
  const origin = req.get("origin");
  if (origin) {
    const host =
      req.get("x-forwarded-host")?.split(",")[0]?.trim() ?? req.get("host") ?? "";
    try {
      if (!host || new URL(origin).host.toLowerCase() !== host.toLowerCase()) {
        res.status(403).json({ error: "This private read must come from the Munjizly app." });
        return;
      }
    } catch {
      res.status(403).json({ error: "This private read must come from the Munjizly app." });
      return;
    }
  }
  next();
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
        error: "Service is temporarily unavailable. Please try again later.",
      });
      return;
    }
    const message = supabasePublicMessage(error, fallback);
    res.status(error.status >= 400 && error.status < 500 ? error.status : 502).json({ error: message });
    return;
  }
  res.status(502).json({ error: fallback });
}
