import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const html=readFileSync(root+'index.html','utf8');
const origin='https://al-omda-ai.pages.dev/';
test('home exposes the site name, canonical, verification and crawlable copy without JavaScript',()=>{
 assert.match(html,/<html lang="ar" dir="rtl">/);
 assert.ok(html.includes('<link rel="canonical" href="'+origin+'"'));
 assert.match(html,/name="google-site-verification"/);
 assert.match(html,/<h1>العمدة \| AL OMDA Ai<\/h1>/);
 assert.match(html,/href="\/about\/"/);
 const data=JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
 assert.equal(data['@type'],'WebSite');assert.equal(data.name,'AL OMDA Ai');assert.equal(data.url,origin);assert.ok(data.alternateName.includes('العمدة'));
});
test('sitemap lists only public pages that exist and robots advertises it',()=>{
 const sitemap=readFileSync(root+'public/sitemap.xml','utf8');
 const paths=[...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);
 assert.deepEqual(paths,[origin,origin+'about/',origin+'download/']);
 for(const url of paths.slice(1))assert.ok(existsSync(root+'public/'+url.slice(origin.length)+'index.html'));
 assert.ok(readFileSync(root+'public/robots.txt','utf8').includes('Sitemap: '+origin+'sitemap.xml'));
});
test('public about page is bilingual, links to app and downloads, and retains brand',()=>{
 const about=readFileSync(root+'public/about/index.html','utf8');
 assert.match(about,/lang="en" dir="ltr"/);assert.match(about,/href="\/"/);assert.match(about,/href="\/download\/"/);assert.match(about,/#100e19/);
 assert.ok(existsSync(root+'public/favicon.ico'));assert.ok(existsSync(root+'public/brand/nexus-icon-192.png'));
});
