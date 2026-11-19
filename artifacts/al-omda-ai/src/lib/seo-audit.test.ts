import assert from "node:assert/strict";
import test from "node:test";
import { analyzeSeoSource } from "./seo-audit.js";

test("always returns the complete twenty-point checklist in stable order",()=>{
 const report=analyzeSeoSource({url:"https://example.com",html:""});
 assert.equal(report.items.length,20);
 assert.deepEqual(report.items.map(x=>x.id),Array.from({length:20},(_,i)=>i+1));
 assert.equal(report.checked+report.unavailable,20);
 assert.equal(report.items[11].status,"unavailable");
 assert.equal(report.items[14].status,"unavailable");
 assert.equal(report.items[18].status,"unavailable");
});

test("does not award unavailable checks a passing score",()=>{
 const report=analyzeSeoSource({url:"https://example.com",html:""});
 assert.equal(report.score,null);
 assert.equal(report.passed,0);
 assert.equal(report.unavailable,20);
});

test("does not treat an invalid URL as HTTPS",()=>{
 const report=analyzeSeoSource({url:"not a url",html:""});
 assert.equal(report.items[16].status,"unavailable");
});

test("uses only verified checks in the score denominator when a DOM parser is available",()=>{
 if(typeof DOMParser==="undefined")return;
 const report=analyzeSeoSource({url:"http://example.com/a_b",html:'<html><head><meta name="robots" content="noindex"><script type="application/ld+json">{bad}</script></head><body><img src="a.png"></body></html>'});
 assert.equal(report.items[2].status,"warning");
 assert.equal(report.items[6].status,"error");
 assert.equal(report.items[8].status,"error");
 assert.equal(report.items[9].status,"error");
 assert.equal(report.items[16].status,"error");
 assert.equal(report.checked+report.unavailable,20);
});