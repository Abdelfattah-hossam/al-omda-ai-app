// Isolated connection tests use synthetic credentials and mock all provider traffic.
import {test} from 'node:test';import {strict as assert} from 'node:assert';import express from 'express';import cookieParser from 'cookie-parser';import {once} from 'node:events';import router from './ai.js';import {setWorkersAiBinding} from '../lib/cloudflare-ai.js';
test('hosted connections require auth and origin, test actual generation and sanitize failures',async()=>{
 const old=globalThis.fetch,env={...process.env};process.env.SUPABASE_URL='https://qa.supabase.co';process.env.SUPABASE_PUBLISHABLE_KEY='qa';let units=0,runs=0;
 globalThis.fetch=(async(input:any,init:any)=>{const url=String(input);if(url.startsWith('https://qa.supabase.co')){if(url.includes('/rest/v1/rpc/omda_account_access'))return Response.json({admin:false,suspended:false});if(url.includes('/auth/v1/user'))return Response.json({id:'qa',email:'qa@example.invalid'});if(url.includes('get_ai_daily_usage'))return Response.json({used:0,remaining:1000,limit:1000});if(url.includes('consume_ai_units')){units++;return Response.json({used:1,remaining:999,limit:1000})}throw new Error('Unexpected mock path')}return old(input,init)})as typeof fetch;
 setWorkersAiBinding({async run(){runs++;return{response:'OK'}}});
 const app=express();app.use(cookieParser());app.use(express.json());app.use(router);const server=app.listen(0,'127.0.0.1');await once(server,'listening');const addr=server.address() as any;const origin='http://127.0.0.1:'+addr.port;
 const headers={origin,cookie:'omda_access=qa-token','content-type':'application/json'};
 try{
 assert.equal((await old(origin+'/ai/connections')).status,401);
 const inventory:any=await(await old(origin+'/ai/connections',{headers})).json();assert.equal(inventory.providers.find((x:any)=>x.id==='cloudflare').configured,true);assert.ok(!JSON.stringify(inventory).includes('qa-token'));
 assert.equal((await old(origin+'/ai/connections/test',{method:'POST',headers:{...headers,origin:'https://evil.example'},body:'{}'})).status,403);
 assert.equal((await old(origin+'/ai/connections/test',{method:'POST',headers,body:'{"provider":"paid-provider"}'})).status,400);
 const result=await old(origin+'/ai/connections/test',{method:'POST',headers,body:'{"provider":"cloudflare"}'});assert.equal(result.status,200);const data:any=await result.json();assert.equal(data.generated,true);assert.equal(runs,1);assert.equal(units,1);assert.equal(data.provider,'cloudflare');
 setWorkersAiBinding({async run(){throw new Error('secret-value-must-never-leak')}});
 const failure=await old(origin+'/ai/connections/test',{method:'POST',headers,body:'{"provider":"cloudflare"}'});assert.equal(failure.status,503);assert.ok(!(await failure.text()).includes('secret-value'));assert.equal(units,1);
 }finally{setWorkersAiBinding(null);globalThis.fetch=old;process.env=env;server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
