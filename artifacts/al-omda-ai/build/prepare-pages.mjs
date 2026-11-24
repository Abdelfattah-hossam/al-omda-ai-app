import {copyFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
copyFileSync(root+'build/pages-worker.js',root+'dist/public/_worker.js');
// The canonical project runs the worker only as the /api proxy. The legacy
// project routes every request through the worker so it can 301 pages to the
// canonical address while keeping the /api proxy alive for stale clients.
const legacy=process.env.PAGES_HOST_MODE==='legacy';
writeFileSync(root+'dist/public/_routes.json',JSON.stringify({version:1,include:[legacy?'/*':'/api/*'],exclude:[]}));
