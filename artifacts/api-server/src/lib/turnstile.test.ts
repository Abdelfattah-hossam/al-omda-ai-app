import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import app from '../app.js';

// Turnstile guard behavior on protected auth endpoints when the secret is set:
// no token and no client-error marker -> 400; a plausible client-error marker
// (widget could not run on that browser) -> the guard steps aside and the
// request reaches the normal auth handler.
test('turnstile guard requires a token unless the widget failed client-side', async()=>{
 process.env.TURNSTILE_SECRET_KEY='test-secret';
 const server=app.listen(0,'127.0.0.1'); await once(server,'listening');
 const url='http://127.0.0.1:'+(server.address() as any).port;
 const post=(headers:Record<string,string>)=>fetch(url+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json',...headers},body:'{}'});
 try {
  const noMarker=await post({});
  assert.equal(noMarker.status,400);
  assert.match(String((await noMarker.json() as {error?:string}).error),/التحقق الأمني/);
  const badMarker=await post({'x-turnstile-client-error':'not a real marker at all!'});
  assert.equal(badMarker.status,400);
  assert.match(String((await badMarker.json() as {error?:string}).error),/التحقق الأمني/);
  // A plausible marker means the widget itself failed on that browser: the
  // guard steps aside and the request reaches the normal auth pipeline.
  const widgetFailed=await post({'x-turnstile-client-error':'600010'});
  const body=await widgetFailed.json() as {error?:string};
  assert.doesNotMatch(String(body.error??''),/التحقق الأمني ثم حاول/);
 } finally {delete process.env.TURNSTILE_SECRET_KEY;server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
