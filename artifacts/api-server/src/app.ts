import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import router from "./routes";
import { securityHeaders, authBurstGuard } from "./lib/security";
import { turnstileGuard } from "./lib/turnstile";
import { apiCors } from "./lib/cors";

const app: Express = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(cookieParser());
app.use(securityHeaders);
app.use(authBurstGuard);
app.use(turnstileGuard);
// Structured request log: method, route, status, duration and user id only.
// Never log bodies, query strings, cookies or tokens. The user id is read from
// the access-token payload for log correlation only and is never trusted.
app.use((req, res, next) => {
 const started = Date.now();
 res.on("finish", () => {
  let userId: string | undefined;
  try {
   const token = req.cookies?.["omda_access"] as string | undefined;
   if (token) userId = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).sub;
  } catch { /* ignore malformed token */ }
  console.log(JSON.stringify({ evt: "api", method: req.method, route: req.originalUrl.split("?")[0].replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ":id"), status: res.statusCode, ms: Date.now() - started, userId }));
 });
 next();
});

app.use(apiCors);
app.use(express.json({ limit: "7mb" }));
app.use(express.urlencoded({ extended: false, limit: "64kb", parameterLimit: 100 }));

app.use("/api", router);

app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
 if (res.headersSent) { _next(error); return; }
 const status = error?.type === "entity.too.large" ? 413 : error?.type === "entity.parse.failed" ? 400 : 500;
 res.status(status).json({ error: status === 413 ? "Request body is too large." : status === 400 ? "Invalid request body." : "Request could not be completed." });
});
export default app;
