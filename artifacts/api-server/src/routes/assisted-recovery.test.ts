import test from'node:test';import assert from'node:assert/strict';import express from'express';import cookieParser from'cookie-parser';import{once}from'node:events';import router from'./assisted-recovery';
test('public recovery proxy rejects missing origin and invalid tickets without calling provider',async()=>{
 const old=globalThis.fetch;let calls=0;globalThis.fetch=(async()=>{calls++;return Response.json({});})as typeof fetch;
 const app=express();app.use(express.json());app.use(cookieParser());app.use(router);const server=app.listen(0,'127.0.0.1');await once(server,'listening');const url='http://127.0.0.1:'+(server.address()as any).port;
 try{assert.equal((await old(url+'/auth/assisted-reset',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,403);assert.equal((await old(url+'/auth/assisted-reset',{method:'POST',headers:{origin:url,'content-type':'application/json'},body:JSON.stringify({ticket:'short',password:'synthetic-password'})})).status,400);assert.equal(calls,0);}finally{globalThis.fetch=old;server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
