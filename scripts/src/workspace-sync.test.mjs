import {avatarDimensions,AVATAR_EDGE} from '../../artifacts/al-omda-ai/src/lib/avatar-image';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkspacePages, createSingleFlight } from '../../artifacts/al-omda-ai/src/lib/workspace-sync';
import { workspaceOffset, WORKSPACE_PAGE_SIZE } from '../../artifacts/api-server/src/lib/workspace-pages';
import { readFileSync } from 'node:fs';
const profile = { displayName: 'QA', organization: 'Synthetic', avatarPath: null };
const task = (n) => ({ id: String(n), title: 'QA' + n, request: 'Fixture', specialty: 'business', steps: [], status: 'review', createdAt: '2026-01-01T00:00:00Z' });
test('loads all 250 historical projects from bounded pages without loss', async () => { const offsets = []; const all = Array.from({ length: 250 }, (_, i) => task(i)); const result = await loadWorkspacePages(async (o) => { offsets.push(o); return { profile, tasks: all.slice(o, o + 100), nextOffset: o + 100 < all.length ? o + 100 : null }; }); assert.equal(result.tasks.length, 250); assert.deepEqual(offsets, [0, 100, 200]); assert.equal(result.tasks[249].id, '249'); });
test('old API and empty accounts remain loadable', async () => { assert.deepEqual(await loadWorkspacePages(async () => ({ profile, tasks: [] })), { profile, tasks: [] }); });
test('page cursor loop or page error never produces partial success', async () => { await assert.rejects(loadWorkspacePages(async () => ({ profile, tasks: [task(1)], nextOffset: 0 }))); await assert.rejects(loadWorkspacePages(async (o) => { if (o)
    throw Error('offline'); return { profile, tasks: [task(1)], nextOffset: 100 }; })); });
test('duplicate boundary records are not duplicated in UI', async () => { const r = await loadWorkspacePages(async (o) => ({ profile, tasks: [task(1)], nextOffset: o ? null : 100 })); assert.equal(r.tasks.length, 1); });
test('revision is trigger-driven with caller-scoped RLS and no client writes',()=>{const sql=readFileSync(new URL('../../supabase/migrations/20261123140000_workspace_revision.sql',import.meta.url),'utf8');for(const term of ['after insert or update or delete on public.tasks','after insert or update or delete on public.profiles','security invoker','user_id=(select auth.uid())','revoke all on public.workspace_revisions from anon,authenticated'])assert.ok(sql.includes(term),term);});
test('single flight skips overlapping work, releases after failure', async () => { const gate = createSingleFlight(); let release; let calls = 0; const first = gate(async () => { calls++; await new Promise(r => release = r); }); await gate(async () => { calls++; }); assert.equal(calls, 1); release(); await first; await assert.rejects(gate(async () => { throw Error('fail'); })); await gate(async () => { calls++; }); assert.equal(calls, 2); });
test('offset validation rejects abuse and bound is 100', () => { assert.equal(WORKSPACE_PAGE_SIZE, 100); assert.equal(workspaceOffset(undefined), 0); assert.equal(workspaceOffset('100'), 100); for (const v of ['-1', 'nan', '1e6', '1.2', {}, '9007199254740992'])
    assert.equal(workspaceOffset(v), null); });
test('revision query is scoped metadata-only and project pages have stable order', () => { const s = readFileSync(new URL('../../artifacts/api-server/src/routes/workspace.ts', import.meta.url), 'utf8'); const r = s.slice(s.indexOf('router.get("/workspace/revision"'), s.indexOf('router.get("/workspace",')); assert.ok(r.includes('/rest/v1/rpc/get_workspace_revision')); assert.ok(r.includes('session.accessToken')); assert.ok(r.includes('private, no-store')); assert.ok(s.includes('order: "created_at.desc,id.desc"')); assert.ok(s.includes('limit: String(WORKSPACE_PAGE_SIZE+1)')); });
test('summary hydration and CSV exports never use truncated task results',()=>{
 const app=readFileSync(new URL('../../artifacts/al-omda-ai/src/App.tsx',import.meta.url),'utf8');
 assert.ok(app.includes('/api/workspace?summary=1&offset='));assert.ok(app.includes("if (detailMatch && currentTask?.summary)"));assert.ok(app.includes("if(!task.summary){full.push(task);continue;}"));assert.ok(app.includes('No partial export was created.'));assert.ok(app.includes('step.hasResult===true'));
});
test('summary SQL is invoker scoped and omits deliverable bodies',()=>{
 const sql=readFileSync(new URL('../../supabase/migrations/20261123142000_workspace_summaries.sql',import.meta.url),'utf8');
 assert.ok(sql.includes('security invoker'));assert.ok(sql.includes('t.user_id=(select auth.uid())'));assert.ok(sql.includes('limit 101'));assert.ok(!sql.includes("'result',"));assert.ok(!sql.includes("'comments',"));assert.ok(!sql.includes("'revisionHistory',"));
});

test('palette search is debounced, bounded, cancellable and has explicit errors',()=>{
 const app=readFileSync(new URL('../../artifacts/al-omda-ai/src/App.tsx',import.meta.url),'utf8');
 assert.ok(app.includes('/api/workspace/search?q='));assert.ok(app.includes('},250)'));assert.ok(app.includes('controller.abort()'));assert.ok(app.includes('commandSearchError&&<div role="alert"'));assert.ok(!app.includes('loadSearchFolders'));assert.ok(!app.includes('commandFullTasks'));
 const sql=readFileSync(new URL('../../supabase/migrations/20261123144000_workspace_search.sql',import.meta.url),'utf8');
 for(const term of ['security invoker','t.user_id=(select auth.uid())',"o.bucket_id='workspace-assets'",'limit 12','strpos','from public,anon'])assert.ok(sql.includes(term),term);
});
test('asset screen shows first page and explicit next page rather than awaiting all pages',()=>{
 const app=readFileSync(new URL('../../artifacts/al-omda-ai/src/WorkspaceAssets.tsx',import.meta.url),'utf8');assert.ok(!app.includes('loadAssetPages'));assert.ok(app.includes('button-load-more-assets'));assert.ok(app.includes('generation!==listGeneration.current'));assert.ok(app.includes('setAssets(previous=>Array.from(new Map('));
});

test('avatar resize caps longest edge,keeps aspect ratio and never upscales',()=>{
 assert.equal(AVATAR_EDGE,384);assert.deepEqual(avatarDimensions(2400,1200),{width:384,height:192});assert.deepEqual(avatarDimensions(100,200),{width:100,height:200});assert.deepEqual(avatarDimensions(1200,2400),{width:192,height:384});for(const n of [0,-1,NaN,Infinity])assert.throws(()=>avatarDimensions(n,100));
 const helper=readFileSync(new URL('../../artifacts/al-omda-ai/src/lib/avatar-image.ts',import.meta.url),'utf8');assert.ok(helper.includes('blob.size>=file.size'));assert.ok(helper.includes('URL.revokeObjectURL(url)'));
 const server=readFileSync(new URL('../../artifacts/api-server/src/routes/storage.ts',import.meta.url),'utf8');assert.ok(server.includes('"private, no-store"'));
});
