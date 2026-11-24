import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import app from '../app.js';
import {setTurnstileFallbackLimiterForTests} from './turnstile.js';

// Turnstile guard behavior on protected auth endpoints when the secret is set:
// no token -> 400, a client-error marker is not a pass.
test('turnstile guard requires a token or a solved challenge', async()=>{
 process.env.TURNSTILE_SECRET_KEY='test-secret';
 const server=app.listen(0,'127.0.0.1'); await once(server,'listening');
 const url='http://127.0.0.1:'+(server.address() as any).port;
 const post=(headers:Record<string,string>)=>fetch(url+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json',...headers},body:'{"email":"a@b.co"}'});
 try {
  const noMarker=await post({});
  assert.equal(noMarker.status,400);
  assert.match(String((await noMarker.json() as {error?:string}).error),/التحقق الأمني/);
  const badMarker=await post({'x-turnstile-client-error':'not a real marker at all!'});
  assert.equal(badMarker.status,400);
  assert.match(String((await badMarker.json() as {error?:string}).error),/التحقق الأمني/);
  // A client-error marker alone is never a pass any more.
  setTurnstileFallbackLimiterForTests(async()=>true);
  const marker=await post({'x-turnstile-client-error':'600010'});
  assert.equal(marker.status,400);
 } finally {setTurnstileFallbackLimiterForTests(null);delete process.env.TURNSTILE_SECRET_KEY;server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});

test('turnstile guard accepts a solved proof-of-work challenge once and rejects bad ones',async()=>{
 process.env.TURNSTILE_SECRET_KEY='test-secret';
 const {createHash}=await import('node:crypto');
 const server=app.listen(0,'127.0.0.1'); await once(server,'listening');
 const url='http://127.0.0.1:'+(server.address() as any).port;
 const post=(headers:Record<string,string>)=>fetch(url+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json',...headers},body:'{"email":"a@b.co"}'});
 try {
  const ch=await (await fetch(url+'/api/auth/pow-challenge')).json() as {c:string;s:string;bits:number};
  let n=0;
  for(;;n++){
   const d=createHash('sha256').update(ch.c+':'+n).digest();
   let bits=0; for(const b of d){ if(b===0){bits+=8;continue;} bits+=Math.clz32(b)-24; break; }
   if(bits>=ch.bits) break;
  }
  const seen=new Set<string>();
  setTurnstileFallbackLimiterForTests(async(key)=>{ if(key.startsWith('pow:')){ if(seen.has(key)) return false; seen.add(key); } return true; });
  const bad=await post({'x-pow':`${ch.c}|${ch.s}|${n+1}`});
  assert.equal(bad.status,403);
  const forged=await post({'x-pow':`${ch.c}|forged|${n}`});
  assert.equal(forged.status,403);
  const good=await post({'x-pow':`${ch.c}|${ch.s}|${n}`});
  assert.doesNotMatch(String((await good.json() as {error?:string}).error??''),/التحقق الأمني/);
  const replay=await post({'x-pow':`${ch.c}|${ch.s}|${n}`});
  assert.equal(replay.status,429);
 } finally {setTurnstileFallbackLimiterForTests(null);delete process.env.TURNSTILE_SECRET_KEY;server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
