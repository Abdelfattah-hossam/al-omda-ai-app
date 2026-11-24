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
          console.warn("Supabase sign-out did not complete remotely", response.status);
        }
      }
    } catch (error) {
      console.warn("Supabase sign-out could not revoke the remote session", error);
    }
  }
  clearSessionCookies(req, res);
  res.json(SignOutResponse.parse({ ok: true }));
});

// Account deletion (privacy): removes the caller's stored files, then the
// account and all of its rows through a database function that only ever acts
// on the caller's own id. Requires an explicit confirmation word. Admin
// accounts cannot be deleted here.
async function removeUserObjects(bucket: string, prefix: string, accessToken: string, depth = 0): Promise<void> {
  if (depth > 4) return;
  const files: string[] = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    const listed = await supabaseFetch(`/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prefix, limit: 100, offset }),
    }, accessToken);
    const items = await readSupabaseJson<Array<{ name?: string; id?: string | null }>>(listed);
    for (const item of items) {
      if (!item.name) continue;
      if (item.id) files.push(prefix + item.name);
      else await removeUserObjects(bucket, `${prefix}${item.name}/`, accessToken, depth + 1);
    }
    if (items.length < 100) break;
  }
  for (let i = 0; i < files.length; i += 100) {
    const removed = await supabaseFetch(`/storage/v1/object/${bucket}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prefixes: files.slice(i, i + 100) }),
    }, accessToken);
    await readSupabaseJson<unknown>(removed);
  }
}

router.delete("/auth/account", requireSameOrigin, async (req, res): Promise<void> => {
  const session = await resolveSession(req, res);
  if (!session) { res.status(401).json({ error: "Sign in to delete your account." }); return; }
  if (req.body?.confirm !== "DELETE") { res.status(400).json({ error: "Send confirm: DELETE to delete the account." }); return; }
  try {
    for (const bucket of ["workspace-assets", "user-avatars"]) {
      await removeUserObjects(bucket, `${session.user.id}/`, session.accessToken);
    }
    const response = await supabaseFetch("/rest/v1/rpc/omda_delete_my_account", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }, session.accessToken);
    await readSupabaseJson<unknown>(response);
    clearSessionCookies(req, res);
    res.json({ ok: true });
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not delete the account.");
  }
});

export default router;
