import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../../artifacts/al-omda-ai/src/App.tsx',import.meta.url),'utf8');
const directory=app.slice(app.indexOf('const appLauncherGroups:'),app.indexOf('const appLauncherGroups:')+11000).split('\n];')[0];
test('directory preserves all menu domains plus existing tool entry points',()=>{
 for(const route of ['/projects','/pipeline','/assets','/workbench','/history','/agents','/finance/sales-overview','/finance/sales-distribution','/finance/payment-gateways','/finance/active-users','/collaboration/contacts','/ai','/collaboration/calendar','/collaboration/email','/collaboration/tickets','/system/security','/profile','/specialties/legal','/specialties/engineering','/specialties/healthcare','/specialties/accounting','/specialties/maintenance','/specialties/education','/ai/usage'])assert.ok(directory.includes(`path:'${route}'`),route);
 assert.ok(directory.includes("target:'hosted-connections'"));assert.ok(directory.includes("target:'media-studio-launcher'"));
 assert.equal((directory.match(/path:'/g)||[]).length,26);
});
test('home, sidebar and mobile menu read one shared directory',()=>{
 for(const marker of ['home-app-directory','sidebar-scroll','curtain-launcher-groups']){
  const section=app.slice(app.indexOf(`className="${marker==='home-app-directory'?'app-launcher-section home-app-directory':marker}"`));
  assert.ok(section.includes('appLauncherGroups.map('),marker);
 }
});
test('directory is ahead of performance and has search and group navigation',()=>{
 assert.ok(app.indexOf('id="home-app-directory"')<app.indexOf("ملخص الأداء"));
 assert.ok(app.includes('home-directory-search'));assert.ok(app.includes('home-directory-jumps'));
 assert.ok(app.includes('id="media-studio-launcher"'));
 assert.ok(app.includes('parsed.searchParams.has("focus")'));
});
