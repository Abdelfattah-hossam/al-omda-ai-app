import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../../artifacts/al-omda-ai/src/App.tsx',import.meta.url),'utf8');
const main=readFileSync(new URL('../../artifacts/al-omda-ai/src/main.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../../artifacts/al-omda-ai/src/welcome-greeting.css',import.meta.url),'utf8');

test('welcome greeting renders on site open with a close control',()=>{
 assert.ok(app.includes('function WelcomeGreeting('),'component exists');
 assert.ok(app.includes('className="welcome-greeting"'),'card class');
 assert.ok(app.includes('welcomeGreeting'),'state wired in App');
 assert.ok(app.includes('{welcomeGreeting===\'shown\'&&<WelcomeGreeting'),'rendered at shell level');
 assert.ok(app.includes('welcome-greeting-close'),'close button');
 assert.ok(/setTimeout\(\(\) => setWelcomeGreeting\('dismissed'\), 7000\)/.test(app),'auto dismiss after 7s');
 assert.ok(!app.includes('welcome-greeting-dismissed'),'no persisted dismissal');
});

test('welcome greeting personalizes with the saved display name only',()=>{
 assert.ok(app.includes('name={hasGreetingName?greetingName:\'\'}'),'uses existing profile name, no new data');
 assert.ok(app.includes('أهلاً يا ${personal}'),'arabic personal title');
 assert.ok(app.includes('Welcome, ${personal}'),'english personal title');
 assert.ok(app.includes('أهلاً وسهلاً'),'arabic generic fallback');
 assert.ok(app.includes('role="dialog"'),'accessible dialog role');
});

test('existing dashboard greeting and guest nudge stay intact',()=>{
 assert.ok(app.includes("${t('hello')} ${greetingName}"),'dashboard subtitle greeting unchanged');
 assert.ok(app.includes('GuestWelcomeNudge'),'guest nudge component unchanged');
 assert.ok(app.includes('omda-guest-nudge-dismissed'),'guest nudge dismissal unchanged');
});

test('welcome greeting styling follows the app palette and motion rules',()=>{
 assert.ok(main.includes("import './welcome-greeting.css';"),'css imported');
 assert.ok(css.includes('.app-shell>.welcome-greeting{'.replace('>','>'))||css.includes('.app-shell>.welcome-greeting'),'scoped to app shell');
 assert.ok(css.includes('#181c23'),'panel background matches app palette');
 assert.ok(css.includes('data-reduced-motion="true"'),'respects reduced motion');
 assert.ok(css.includes('safe-area-inset-top'),'safe-area aware');
});
