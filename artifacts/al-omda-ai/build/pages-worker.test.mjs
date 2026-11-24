import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './pages-worker.js';
const site='https://munjizly.pages.dev';
const legacy='https://al-omda-ai.pages.dev';
const legacyZahin='https://zahin.pages.dev';
test('Pages sends normal pages to static assets',async()=>{let path;const r=await worker.fetch(new Request(site+'/about/'),{ASSETS:{fetch(req){path=new URL(req.url).pathname;return new Response('About');}}});assert.equal(path,'/about/');assert.equal(await r.text(),'About');});
test('legacy host redirects pages to the canonical address',async()=>{
 const r=await worker.fetch(new Request(legacy+'/about/?x=1'),{ASSETS:{fetch(){throw new Error('assets must not be hit');}}});
 assert.equal(r.status,301);assert.equal(r.headers.get('location'),site+'/about/?x=1');
 const root=await worker.fetch(new Request(legacy+'/'),{});
 assert.equal(root.status,301);assert.equal(root.headers.get('location'),site+'/');
});
test('zahin legacy host also redirects pages to the canonical address',async()=>{
 const r=await worker.fetch(new Request(legacyZahin+'/about/?x=1'),{ASSETS:{fetch(){throw new Error('assets must not be hit');}}});
 assert.equal(r.status,301);assert.equal(r.headers.get('location'),site+'/about/?x=1');
});
test('legacy host keeps proxying the API for stale clients',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=async(req)=>new Response('ok');
 const r=await worker.fetch(new Request(legacy+'/api/auth/session',{headers:{origin:legacy}}),{});
 assert.equal(r.status,200);assert.equal(await r.text(),'ok');
 }finally{globalThis.fetch=original;}
});
test('Pages blocks cross-origin API writes and reads',async()=>{for(const method of ['POST','GET']){const r=await worker.fetch(new Request(site+'/api/auth/login',{method,headers:{origin:'https://evil.invalid'}}),{});assert.equal(r.status,403);}const r=await worker.fetch(new Request(site+'/api/auth/login',{method:'POST'}),{});assert.equal(r.status,403);});
test('API proxy preserves cookies, payload, streams and public origin while pinning backend',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=async(req)=>{assert.equal(req.url,'https://al-omda-ai-app.abdelfattahhossam1.workers.dev/api/auth/login');assert.equal(req.headers.get('origin'),site);assert.equal(req.headers.get('x-forwarded-host'),'munjizly.pages.dev');assert.equal(req.headers.get('cookie'),'session=test');assert.equal(await req.text(),'{}');return new Response('ok',{headers:{'set-cookie':'session=new; Path=/api; HttpOnly; Secure; SameSite=Lax'}});};
 const r=await worker.fetch(new Request(site+'/api/auth/login',{method:'POST',headers:{origin:site,cookie:'session=test','x-forwarded-host':'evil.invalid'},body:'{}'}),{});
 assert.match(r.headers.get('set-cookie'),/session=new/);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(await r.text(),'ok');
 }finally{globalThis.fetch=original;}
});
test('legacy recovery redirect returns to canonical domain',async()=>{const original=globalThis.fetch;try{globalThis.fetch=async()=>new Response(null,{status:303,headers:{location:'https://al-omda-ai-app.abdelfattahhossam1.workers.dev/reset-password?error=invalid'}});const r=await worker.fetch(new Request(site+'/api/auth/recovery-callback'),{});assert.equal(r.headers.get('location'),site+'/reset-password?error=invalid');}finally{globalThis.fetch=original;}});
