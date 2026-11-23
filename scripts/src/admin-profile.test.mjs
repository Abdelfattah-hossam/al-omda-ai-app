import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const app=readFileSync(new URL('../../artifacts/al-omda-ai/src/App.tsx',import.meta.url),'utf8');
test('admin entry and panel live only in the admin-only profile section',()=>{
 assert.ok(app.includes('{adminAllowed&&<section className="panel" data-testid="profile-admin-section"'));
 assert.ok(app.includes("setLocation('/profile?admin=1',{replace:true})"));
 const global=app.slice(app.indexOf('<div className="content-wrap">'),app.indexOf('</Suspense></div>',app.indexOf('<div className="content-wrap">')));
 assert.ok(!global.includes('adminAllowed'));assert.ok(!app.includes('href="/admin"'));
});
