import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';import cookieParser from 'cookie-parser';import {once}from'node:events';import router,{validRecoveryEmail,validRecoveryPassword}from'./password-recovery';
test('recovery validates email and password bounds',()=>{assert.equal(validRecoveryEmail('dev@example.com'),true);for(const v of ['a','x\n@a.com',null])assert.equal(validRecoveryEmail(v),false);assert.equal(validRecoveryPassword('12345678'),true);assert.equal(validRecoveryPassword('short'),false);});
test('recovery uses PKCE HttpOnly cookies generic email response and rejects missing callback state',async()=>{
 const old=globalThis.fetch;const oldEnv={...process.env};process.env.SUPABASE_URL='https://recovery-test.supabase.co';process.env.SUPABASE_PUBLISHABLE_KEY='test';const calls:{url:string;body:any}[]=[];
 globalThis.fetch=(async(input:any,init:any)=>{if(String(input).startsWith('https://recovery-test.supabase.co')){calls.push({url:String(input),body:JSON.parse(init.body)});return Response.json({});}return old(input,init);})as typeof fetch;
 const app=express();app.use(express.json());app.use(cookieParser());app.use(router);const server=app.listen(0,'127.0.0.1');await once(server,'listening');const url='http://127.0.0.1:'+(server.address()as any).port;
 try{
  assert.equal((await old(url+'/auth/forgot-password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'qa@example.invalid'})})).status,403);
  const r=await old(url+'/auth/forgot-password',{method:'POST',headers:{origin:url,'content-type':'application/json'},body:JSON.stringify({email:'qa@example.invalid'})});assert.equal(r.status,200);assert.ok(r.headers.get('set-cookie')?.includes('HttpOnly'));assert.ok(r.headers.get('set-cookie')?.includes('Secure'));assert.equal(calls[0].body.code_challenge_method,'s256');assert.equal(calls[0].body.code_challenge.length,43);assert.ok(!JSON.stringify(await r.json()).includes('code_challenge'));
  const callback=await old(url+'/auth/recovery-callback?code=fixture',{redirect:'manual'});assert.equal(callback.status,303);assert.ok(callback.headers.get('location')?.includes('error=invalid'));
  const reset=await old(url+'/auth/reset-password',{method:'POST',headers:{origin:url,'content-type':'application/json'},body:JSON.stringify({password:'fixture-only'})});assert.equal(reset.status,401);
 }finally{globalThis.fetch=old;process.env=oldEnv;server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
