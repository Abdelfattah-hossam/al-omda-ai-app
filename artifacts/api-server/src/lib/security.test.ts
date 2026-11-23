import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import app from '../app.js';

test('API sends security headers and sanitized malformed JSON responses', async()=>{
 const server=app.listen(0,'127.0.0.1'); await once(server,'listening');
 const url='http://127.0.0.1:'+(server.address() as any).port;
 try {
  const health=await fetch(url+'/api/healthz');
  assert.equal(health.headers.get('x-content-type-options'),'nosniff');
  assert.equal(health.headers.get('x-frame-options'),'DENY');
  assert.equal(health.headers.get('cache-control'),'no-store');
  assert.equal(health.headers.has('x-powered-by'),false);
  const bad=await fetch(url+'/api/auth/signin',{method:'POST',headers:{'content-type':'application/json'},body:'{bad json'});
  assert.equal(bad.status,400);assert.deepEqual(await bad.json(),{error:'Invalid request body.'});
  assert.equal(bad.headers.get('x-content-type-options'),'nosniff');
 } finally {server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
