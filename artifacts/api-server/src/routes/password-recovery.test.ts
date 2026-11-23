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
test('recovery validates access with Auth and explains default-provider delivery failures',async()=>{
 const old=globalThis.fetch,env={...process.env};process.env.SUPABASE_URL='https://recovery-test.supabase.co';process.env.SUPABASE_PUBLISHABLE_KEY='test';let mode='expired';
 globalThis.fetch=(async(input:any)=>{if(String(input).startsWith('https://recovery-test.supabase.co')){if(String(input).includes('/recover?'))return Response.json({code:'email_address_not_authorized'},{status:403});if(mode==='expired')return Response.json({},{status:401});if(mode==='offline')throw new Error('Synthetic network unavailable');return Response.json({id:'synthetic'});}return old(input);})as typeof fetch;
 const app=express();app.use(express.json());app.use(cookieParser());app.use(router);const server=app.listen(0,'127.0.0.1');await once(server,'listening');const url='http://127.0.0.1:'+(server.address()as any).port;
 try{
  const expired=await old(url+'/auth/recovery-status',{headers:{cookie:'omda_recovery_access=synthetic'}});assert.deepEqual(await expired.json(),{ready:false});assert.match(expired.headers.get('set-cookie')??'',/omda_recovery_access=;/);
  mode='valid';assert.deepEqual(await(await old(url+'/auth/recovery-status',{headers:{cookie:'omda_recovery_access=synthetic'}})).json(),{ready:true});
  mode='offline';assert.equal((await old(url+'/auth/recovery-status',{headers:{cookie:'omda_recovery_access=synthetic'}})).status,503);
  const mail=await old(url+'/auth/forgot-password',{method:'POST',headers:{origin:url,'content-type':'application/json'},body:JSON.stringify({email:'synthetic@example.invalid'})});assert.equal(mail.status,503);assert.match(((await mail.json())as {error:string}).error,/خدمة البريد الحالية محدودة/);
  assert.equal((await old(url+'/auth/change-password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({currentPassword:'synthetic-old',password:'synthetic-new'})})).status,403);
 }finally{globalThis.fetch=old;process.env=env;server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
test('signed-in password change requires current password and revokes sessions',async()=>{
 const old=globalThis.fetch,env={...process.env};process.env.SUPABASE_URL='https://recovery-test.supabase.co';process.env.SUPABASE_PUBLISHABLE_KEY='test';let valid=false;const calls:{url:string;method:string;body:any}[]=[];
 globalThis.fetch=(async(input:any,init:any)=>{const u=String(input);if(u.startsWith('https://recovery-test.supabase.co')){const body=init?.body?JSON.parse(init.body):null;calls.push({url:u,method:init?.method??'GET',body});if(u.includes('omda_account_access'))return Response.json({suspended:false});if(u.includes('/token?'))return valid?Response.json({access_token:'synthetic-confirmed',user:{id:'synthetic-user'}}):Response.json({message:'Invalid login credentials'},{status:400});if(init?.method==='PUT')return Response.json({id:'synthetic-user'});if(u.includes('/logout'))return Response.json({});return Response.json({id:'synthetic-user',email:'synthetic@example.invalid'});}return old(input,init);})as typeof fetch;
 const app=express();app.use(express.json());app.use(cookieParser());app.use(router);const server=app.listen(0,'127.0.0.1');await once(server,'listening');const url='http://127.0.0.1:'+(server.address()as any).port;
 const send=()=>old(url+'/auth/change-password',{method:'POST',headers:{origin:url,'content-type':'application/json',cookie:'omda_access=synthetic-session'},body:JSON.stringify({currentPassword:'synthetic-old-password',password:'synthetic-new-password'})});
 try{
  const bad=await send();assert.equal(bad.status,400);assert.equal(calls.filter(x=>x.method==='PUT').length,0);
  valid=true;const good=await send();assert.equal(good.status,200);assert.deepEqual(await good.json(),{saved:true});assert.equal(calls.filter(x=>x.method==='PUT').length,1);assert.ok(calls.some(x=>x.url.includes('/logout?scope=global')));assert.match(good.headers.get('set-cookie')??'',/omda_access=;/);
 }finally{globalThis.fetch=old;process.env=env;server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
