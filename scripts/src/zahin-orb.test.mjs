import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const orb = readFileSync('../artifacts/al-omda-ai/src/components/ZahinOrb.tsx', 'utf8');
const css = readFileSync('../artifacts/al-omda-ai/src/index.css', 'utf8');
const chat = readFileSync('../artifacts/al-omda-ai/src/AIChat.tsx', 'utf8');
const voice = readFileSync('../artifacts/al-omda-ai/src/GeminiLiveVoice.tsx', 'utf8');

test('Zahin orb renders the brand mark as native animated SVG', () => {
  assert.ok(orb.includes('className="zahin-orb-ring"'));
  assert.ok(orb.includes('className="zahin-orb-spark"'));
  assert.ok(orb.includes('className="zahin-orb-dot"'));
  assert.ok(orb.includes('<animateMotion'));
  assert.ok(orb.includes('<mpath'));
  assert.ok(orb.includes('data-state={state}'));
  assert.ok(orb.includes('#c9acff'));
  assert.ok(orb.includes('#83cfff'));
  assert.ok(!/العمدة|العمده|Al OMDA AI|AL OMDA Ai/.test(orb));
});

test('Zahin orb reacts to conversation state and input', () => {
  assert.ok(orb.includes('idle: "14s"'));
  assert.ok(orb.includes('thinking: "3.4s"'));
  assert.ok(orb.includes('speaking: "6.5s"'));
  assert.ok(css.includes('.zahin-orb[data-state="thinking"] .zahin-orb-ring{animation-duration:1.5s}'));
  assert.ok(css.includes('.zahin-orb[data-state="speaking"] .zahin-orb-ring{animation-duration:2.4s}'));
  assert.ok(css.includes('.zahin-orb-interactive:hover .zahin-orb-spark{animation-duration:.8s}'));
  assert.ok(css.includes('.zahin-orb-interactive:active{transform:scale(1.08)}'));
});

test('Zahin orb honors prefers-reduced-motion for CSS and SMIL animation', () => {
  assert.ok(orb.includes('window.matchMedia("(prefers-reduced-motion: reduce)")'));
  assert.ok(orb.includes('svg.pauseAnimations()'));
  assert.ok(css.includes('@media(prefers-reduced-motion:reduce){.zahin-orb,.zahin-orb *{animation:none!important;transition:none!important}}'));
});

test('chat surface uses the animated orb in header, welcome and thinking states', () => {
  assert.ok(chat.includes('<span className="ai-chat-brand-mark"><ZahinOrb state={loading ? "thinking" : "idle"} /></span>'));
  assert.ok(chat.includes('<div className="ai-chat-welcome-mark"><ZahinOrb state={loading ? "thinking" : "idle"} interactive /></div>'));
  assert.ok(chat.includes('<p className="ai-chat-thinking"><ZahinOrb state="thinking" />'));
  assert.ok(voice.includes("state={speaking ? \"speaking\" : (thinking || connecting) ? \"thinking\" : \"idle\"}"));
});
