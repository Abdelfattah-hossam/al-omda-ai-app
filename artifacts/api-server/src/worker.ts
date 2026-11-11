import { httpServerHandler } from "cloudflare:node";
import app from "./app";

// Cloudflare's Node.js HTTP server adapter runs the existing Express API
// inside the Worker runtime. API requests are routed to this Worker by
// assets.run_worker_first; static frontend assets remain edge-served.
const port = 8787;

app.listen(port);

export default httpServerHandler({ port });
