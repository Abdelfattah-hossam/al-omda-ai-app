import { Router, type IRouter } from "express";
import {
  GetAuthSessionResponse,
  GetAuthStatusResponse,
  SignInBody,
  SignInResponse,
  SignOutResponse,
  SignUpBody,
  SignUpResponse,
} from "@workspace/api-zod";
import {
  clearSessionCookies,
  isSupabaseConfigured,
  readSupabaseJson,
  reportSupabaseError,
  requireSameOrigin,
  resolveSession,
  setSessionCookies,
  supabaseFetch,
} from "../lib/supabase";

const router: IRouter = Router();

router.get("/auth/status", (_req, res) => {
  res.json(GetAuthStatusResponse.parse({ configured: isSupabaseConfigured() }));
});

router.get("/auth/session", async (req, res): Promise<void> => {
  if (!isSupabaseConfigured()) {
    res.json(GetAuthSessionResponse.parse({ configured: false, user: null }));
    return;
  }
  try {
    const session = await resolveSession(req, res);
    res.json(GetAuthSessionResponse.parse({ configured: true, user: session?.user ?? null }));
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not check the current session.");
  }
});

router.post("/auth/signup", requireSameOrigin, async (req, res): Promise<void> => {
  if (!isSupabaseConfigured()) {
    res.status(503).json({ error: "Supabase is not configured on the API server." });
    return;
  }
  const parsed = SignUpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email and a password of at least 8 characters." });
    return;
  }
  try {
    const response = await supabaseFetch("/auth/v1/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    const payload = await readSupabaseJson<{
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      user?: { id: string; email?: string | null } | null;
    }>(response);
    const user =
      payload.user?.id && payload.user.email
        ? { id: payload.user.id, email: payload.user.email }
        : null;
    if (payload.access_token && payload.refresh_token) {
      setSessionCookies(req, res, {
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
        expires_in: payload.expires_in,
      });
    }
    res.json(
      SignUpResponse.parse({
        user,
        emailConfirmationRequired: !payload.access_token,
      }),
    );
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not create the account.");
  }
});

router.post("/auth/login", requireSameOrigin, async (req, res): Promise<void> => {
  if (!isSupabaseConfigured()) {
    res.status(503).json({ error: "Supabase is not configured on the API server." });
    return;
  }
  const parsed = SignInBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email and password." });
    return;
  }
  try {
    const response = await supabaseFetch("/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    const payload = await readSupabaseJson<{
      access_token: string;
      refresh_token: string;
      expires_in?: number;
      user: { id: string; email?: string | null };
    }>(response);
    if (!payload.user?.id || !payload.user.email) {
      res.status(502).json({ error: "Supabase returned an incomplete account." });
      return;
    }
    setSessionCookies(req, res, payload);
    res.json(
      SignInResponse.parse({
        user: { id: payload.user.id, email: payload.user.email },
        emailConfirmationRequired: false,
      }),
    );
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not sign in.");
  }
});

router.post("/auth/logout", requireSameOrigin, async (req, res): Promise<void> => {
  if (isSupabaseConfigured()) {
    try {
      const session = await resolveSession(req, res);
      if (session) {
        const response = await supabaseFetch("/auth/v1/logout", { method: "POST" }, session.accessToken);
        if (!response.ok && response.status !== 401) {
          req.log.warn({ status: response.status }, "Supabase sign-out did not complete remotely");
        }
      }
    } catch (error) {
      req.log.warn({ err: error }, "Supabase sign-out could not revoke the remote session");
    }
  }
  clearSessionCookies(req, res);
  res.json(SignOutResponse.parse({ ok: true }));
});

export default router;
