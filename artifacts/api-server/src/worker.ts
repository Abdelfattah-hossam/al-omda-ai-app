import { httpServerHandler } from "cloudflare:node";
import app from "./app";
import { setWorkersAiBinding } from "./lib/cloudflare-ai";

// Cloudflare's Node.js HTTP server adapter runs the existing Express API
// inside the Worker runtime. API requests are routed to this Worker by
// assets.run_worker_first; static frontend assets remain edge-served.
const port = 8787;

app.listen(port);

const handler = httpServerHandler({ port });

export default {
  // Capture the Worker's bindings on every request so provider code can use
  // the keyless Workers AI binding as a fallback without stored secrets.
  fetch(request: Request, env?: { AI?: unknown; ASSETS?: {fetch(request:Request):Promise<Response>} }, ctx?: unknown): Promise<Response> {
    const url = new URL(request.url);
    const ua = request.headers.get('user-agent') || '';
    const native = /Electron\/|; wv\)|ALOMDA-Legacy/i.test(ua);
    if(url.hostname==='al-omda-ai-app.abdelfattahhossam1.workers.dev' && !url.pathname.startsWith('/api/') && !native){
      return Promise.resolve(Response.redirect('https://munjizly.pages.dev'+url.pathname+url.search,301));
    }
    if(!url.pathname.startsWith('/api/') && env?.ASSETS) return env.ASSETS.fetch(request);
    setWorkersAiBinding(env?.AI);
    return handler.fetch(request, env, ctx);
  },
};
