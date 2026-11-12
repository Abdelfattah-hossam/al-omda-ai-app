import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import router from "./routes";

const app: Express = express();
app.set("trust proxy", 1);

app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: "7mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
