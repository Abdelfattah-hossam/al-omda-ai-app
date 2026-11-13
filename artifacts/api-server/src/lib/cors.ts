import cors, { type CorsOptions } from "cors";

// The deployed app serves its API from the same Worker origin. The local Vite
// server uses port 5173; localhost and 127.0.0.1 are distinct browser origins.
// Cross-origin cookie access is intentionally not enabled.
const ALLOWED_ORIGINS = new Set([
  "https://al-omda-ai-app.abdelfattahhossam1.workers.dev",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Same-origin requests do not need CORS response headers. Reject opaque,
    // missing, and unlisted origins without blocking normal server handling.
    callback(null, typeof origin === "string" && ALLOWED_ORIGINS.has(origin));
  },
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

export const apiCors = cors(corsOptions);
