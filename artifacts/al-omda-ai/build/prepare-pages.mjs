import {copyFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
copyFileSync(root+'build/pages-worker.js',root+'dist/public/_worker.js');
writeFileSync(root+'dist/public/_routes.json',JSON.stringify({version:1,include:['/api/*'],exclude:[]}));
