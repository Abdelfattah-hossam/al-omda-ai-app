import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import router from "./routes";
import { securityHeaders, authBurstGuard } from "./lib/security";
import { apiCors } from "./lib/cors";

const app: Express = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(securityHeaders);
app.use(authBurstGuard);

app.use(apiCors);
app.use(cookieParser());
app.use(express.json({ limit: "7mb" }));
app.use(express.urlencoded({ extended: false, limit: "64kb", parameterLimit: 100 }));

app.use("/api", router);

app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
 if (res.headersSent) { _next(error); return; }
 const status = error?.type === "entity.too.large" ? 413 : error?.type === "entity.parse.failed" ? 400 : 500;
 res.status(status).json({ error: status === 413 ? "Request body is too large." : status === 400 ? "Invalid request body." : "Request could not be completed." });
});
export default app;
