import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import router from "./routes";
import { apiCors } from "./lib/cors";

const app: Express = express();
app.set("trust proxy", 1);

app.use(apiCors);
app.use(cookieParser());
app.use(express.json({ limit: "7mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
