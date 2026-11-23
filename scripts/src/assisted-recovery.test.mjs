import test from'node:test';import assert from'node:assert/strict';
import{createRecoveryHandler}from'../../supabase/functions/account-recovery/handler';
import{readFileSync}from'node:fs';
test('recovery issue stores a digest and returns no password or service key',async()=>{
 const calls=[]=[];const handler=createRecoveryHandler({url:'https://synthetic.invalid',key:'private-service'},(async(u,i)=>{calls.push({u,body:JSON.parse(i.body),auth:new Headers(i.headers).get('authorization')});return Response.json({expiresAt:'synthetic-expiry'});}));
 const res=await handler(new Request('https://synthetic.invalid',{method:'POST',headers:{authorization:'Bearer admin-session'},body:JSON.stringify({action:'issue',targetId:'00000000-0000-4000-8000-000000000001',confirmed:true})}));const d=await res.json();assert.equal(res.status,200);assert.match(d.token,/^[\w-]{43}$/);assert.match(calls[0].body.p_hash,/^[a-f0-9]{64}$/);assert.equal(calls[0].auth,'Bearer admin-session');assert.ok(!JSON.stringify(d).includes('private-service'));assert.ok(!JSON.stringify(calls).includes(d.token));
});
test('redemption is single-use and returns only saved after exact target and logout',async()=>{
 let spent=false;const calls=[]=[];
 const handler=createRecoveryHandler({url:'https://synthetic.invalid',key:'private-service'},(async(u,i)=>{const url=String(u);calls.push({url,method:i.method,body:JSON.parse(i.body)});
 if(url.includes('omda_consume_recovery')){if(spent)return Response.json({error:'used'},{status:400});spent=true;return Response.json({ticketId:'ticket-id',targetId:'regular-id',email:'synthetic@example.invalid'});}
 if(url.includes('generate_link'))return Response.json({user:{id:'regular-id'},hashed_token:'synthetic-hash'});
 if(url.includes('/verify'))return Response.json({user:{id:'regular-id'},access_token:'recovery-access'});
 return Response.json({});}));
 const send=()=>handler(new Request('https://synthetic.invalid',{method:'POST',body:JSON.stringify({action:'redeem',ticket:'a'.repeat(43),password:'synthetic-only-password'})}));
 assert.deepEqual(await(await send()).json(),{saved:true});assert.equal((await send()).status,400);assert.equal(calls.filter(x=>x.method==='PUT').length,1);assert.ok(calls.some(x=>x.url.includes('/logout?scope=global')));assert.ok(calls.some(x=>x.body.p_success===true));
});
test('wrong target fails closed without password write; GET and malformed tickets do not consume',async()=>{
 const calls=[]=[];const handler=createRecoveryHandler({url:'https://synthetic.invalid',key:'private-service'},(async(u)=>{calls.push(String(u));if(String(u).includes('consume'))return Response.json({ticketId:'ticket',targetId:'expected',email:'synthetic@example.invalid'});return Response.json({user:{id:'wrong'},hashed_token:'hash'});}));
 assert.equal((await handler(new Request('https://synthetic.invalid'))).status,405);assert.equal(calls.length,0);
 const res=await handler(new Request('https://synthetic.invalid',{method:'POST',body:JSON.stringify({action:'redeem',ticket:'a'.repeat(43),password:'synthetic-only-password'})}));assert.equal(res.status,400);assert.ok(!calls.some(x=>x.endsWith('/user')));assert.ok(!calls.some(x=>x.includes('/verify')));
});
test('database enforces both exact admins, excludes admin targets and uses single-use locks',()=>{
 const sql=readFileSync(new URL('../../supabase/migrations/20261123123500_assisted_recovery.sql',import.meta.url),'utf8');
 for(const text of ['47ee202d-244e-45a3-bbc9-cbc3cf1ae98c','4ecf4f2e-4ae5-4cdb-ace9-8ef9b1394096','for update','token_hash','recovery_issued','recovery_started','recovery_completed',"interval '10 minutes'",'where user_id=p_target','revoke all on public.app_recovery_tickets'])assert.ok(sql.includes(text),text);
 assert.ok(!/encrypted_password|crypt\(/.test(sql));
});
