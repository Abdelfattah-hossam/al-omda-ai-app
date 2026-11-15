import test from "node:test";
import assert from "node:assert/strict";
import { professionalStandards } from "./professional-standards.js";

test("legal standards require jurisdiction-aware answers without inferring jurisdiction", () => {
  assert.match(professionalStandards, /Legal rules depend on jurisdiction, date, facts, and procedural posture/);
  assert.match(professionalStandards, /Never infer the governing jurisdiction from the user's apparent location, language, nationality, or account settings/);
  assert.match(professionalStandards, /If jurisdiction is missing and materially changes the answer, ask one focused question/);
});

test("legal standards prohibit fabricated authorities and separate facts from analysis", () => {
  assert.match(professionalStandards, /Never invent statutes, cases, quotations, or legal citations/);
  assert.match(professionalStandards, /Separate verified law, user-provided facts, assumptions, and analysis/);
  assert.match(professionalStandards, /Use current primary sources when research access exists; give exact citations only after checking them/);
});

test("legal standards cover practical legal work and disclose professional limits", () => {
  for (const phrase of [
    "contracts, clauses, legal notices, pleadings, memoranda",
    "compliance matrices, due-diligence checklists",
    "limitation periods",
    "qualified local counsel",
    "not a claim of representation or guaranteed legal advice",
  ]) assert.ok(professionalStandards.includes(phrase), `Missing legal requirement: ${phrase}`);
});

test("engineering standards require units, assumptions, verification, and safety boundaries", () => {
  for (const phrase of [
    "State units, assumptions, formulas, versions, and constraints",
    "Independently verify arithmetic, dimensions, unit conversions, and totals",
    "Never invent site conditions, material properties, safety factors, code clauses, or survey measurements",
    "A conceptual plan is not a permit/construction drawing",
    "Safety-critical structural, electrical, fire, medical, and industrial decisions require qualified local professional verification",
  ]) assert.ok(professionalStandards.includes(phrase), `Missing engineering requirement: ${phrase}`);
});

test("software and office standards require actual implementation checks and honest handoff", () => {
  for (const phrase of [
    "requirements analysis, architecture",
    "authentication/authorization",
    "testing, debugging, performance",
    "run relevant tests, type checks, lint/build",
    "Never claim tests, deployment, security, or production readiness without actual verification",
    "Never render inert, misleading, duplicate, or irrelevant buttons",
    "Never claim an attachment exists before it has been generated and checked",
  ]) assert.ok(professionalStandards.includes(phrase), `Missing delivery requirement: ${phrase}`);
});

test("professional standards preserve user intent and avoid forcing file creation", () => {
  assert.match(professionalStandards, /do not force every answer into a specialist format/i);
  assert.match(professionalStandards, /never carry over an old file\/task to a casual message or unrelated request/i);
  assert.match(professionalStandards, /Do not force every request into Word or create a file when the user only wants a conversational answer/i);
});
