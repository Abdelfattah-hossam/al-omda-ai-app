import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../../artifacts/al-omda-ai/src/App.tsx',import.meta.url),'utf8');
const config=readFileSync(new URL('../../artifacts/al-omda-ai/vite.config.ts',import.meta.url),'utf8');
const boundary=readFileSync(new URL('../../artifacts/al-omda-ai/src/components/error-boundary.tsx',import.meta.url),'utf8');
test('home chart works without newer replaceAll API',()=>{assert.ok(!app.includes('.replaceAll('));assert.ok(app.includes("trendPoints.split(' ').join(', ')"));});
test('frontend syntax targets older Chromium explicitly',()=>{assert.ok(config.includes("target: ['chrome79', 'edge79', 'firefox78', 'safari13']"));});
test('production error details remain local and can be inspected',()=>{assert.ok(boundary.includes('omda-last-render-error'));assert.ok(boundary.includes('actual.message.slice(0,700)'));assert.ok(boundary.includes('window.location.pathname'));assert.ok(boundary.includes('navigator.userAgent'));assert.ok(boundary.includes('<details'));assert.ok(!boundary.includes('fetch('));assert.ok(boundary.includes("minHeight:'100vh'"));});
test('runtime polyfills evaluate before the application dependency graph',()=>{
 const main=readFileSync(new URL('../../artifacts/al-omda-ai/src/main.tsx',import.meta.url),'utf8');
 const polyfills=readFileSync(new URL('../../artifacts/al-omda-ai/src/polyfills.ts',import.meta.url),'utf8');
 assert.ok(main.startsWith("import './polyfills';"));
 assert.ok(polyfills.includes("import 'core-js/stable'"));
 assert.ok(polyfills.includes("typeof AbortSignal.timeout !== 'function'"));
});
