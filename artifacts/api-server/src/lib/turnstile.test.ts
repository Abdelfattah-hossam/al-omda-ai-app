import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import app from '../app.js';

// Turnstile guard behavior on protected auth endpoints when the secret is set:
// no token -> 400, a client-error marker is not a pass.
test('turnstile guard requires a Turnstile token', async()=>{
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
  const marker=await post({'x-turnstile-client-error':'600010'});
  assert.equal(marker.status,400);
 } finally {delete process.env.TURNSTILE_SECRET_KEY;server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
