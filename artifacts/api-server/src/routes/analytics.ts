import { Router, type IRouter } from "express";
import { readSupabaseJson, reportSupabaseError, resolveSession, supabaseFetch } from "../lib/supabase";

const router: IRouter = Router();

router.get("/analytics/active-users", async (req, res): Promise<void> => {
  try {
    const session = await resolveSession(req, res);
    if (!session) {
      res.status(401).json({ error: "Sign in to view live user analytics." });
      return;
    }
    const response = await supabaseFetch(
      "/rest/v1/rpc/get_global_user_analytics",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      session.accessToken,
    );
    const analytics = await readSupabaseJson<{
      active_users_30d: number;
      active_users_previous_30d: number;
      growth_percent: number | null;
      measured_at: string;
    }>(response);
    if (!analytics || !Number.isInteger(analytics.active_users_30d) ||
        !Number.isInteger(analytics.active_users_previous_30d)) {
      res.status(502).json({ error: "The analytics source returned invalid data." });
      return;
    }
    res.setHeader("Cache-Control", "private, no-store");
    res.json(analytics);
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not load live user analytics.");
  }
});

export default router;
