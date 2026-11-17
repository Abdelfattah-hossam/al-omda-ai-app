import assert from "node:assert/strict";
import test from "node:test";
import { parseCodeProjectArtifact } from "./code-project-artifact.js";

const validProject = () => ({
  title: "Original storefront",
  framework: "Vite + React + TypeScript",
  entryPoint: "src/main.tsx",
  files: [
    { path: "package.json", content: JSON.stringify({ name: "storefront", scripts: { build: "vite build", test: "vitest run" }, dependencies: { vite: "^7.0.0" } }) },
    { path: "README.md", content: "# Storefront\n\nRun npm install and npm run build." },
    { path: "index.html", content: "<div id=\"root\"></div>" },
    { path: "src/main.tsx", content: "import React from 'react';" },
    { path: "src/App.tsx", content: "export default function App(){ return <main>Store</main> }" },
  ],
});

test("accepts a bounded multi-file project with build instructions", () => {
  const project = parseCodeProjectArtifact(JSON.stringify(validProject()));
  assert.ok(project);
  assert.equal(project.files.length, 5);
  assert.equal(project.entryPoint, "src/main.tsx");
  assert.equal(project.buildCommand, "npm run build");
  assert.equal(project.testCommand, "npm test");
  assert.equal(project.buildStatus, "not_run");
  assert.equal(project.testStatus, "not_run");
});

test("rejects path traversal, absolute paths, duplicate paths, and environment secrets", () => {
  for (const path of ["../secret.txt", "/etc/passwd", "src/../../secret.txt", ".env", "keys/private.pem"]) {
    const value = validProject();
    value.files.push({ path, content: "x" });
    assert.equal(parseCodeProjectArtifact(JSON.stringify(value)), null, "must reject " + path);
  }
  const duplicate = validProject();
  duplicate.files.push({ path: "SRC/app.tsx", content: "duplicate" });
  assert.equal(parseCodeProjectArtifact(JSON.stringify(duplicate)), null);
  const secret = validProject();
  secret.files[3].content = "const apiKey = \"sk-123456789012345678901234567890\";";
  assert.equal(parseCodeProjectArtifact(JSON.stringify(secret)), null);
});

test("allows placeholder env examples but rejects nested env files and install hooks", () => {
  const example = validProject();
  example.files.push({ path: ".env.example", content: "PUBLIC_API_URL=https://example.invalid" });
  assert.ok(parseCodeProjectArtifact(JSON.stringify(example)));
  const nestedEnv = validProject();
  nestedEnv.files.push({ path: "src/.env.local", content: "TOKEN=placeholder" });
  assert.equal(parseCodeProjectArtifact(JSON.stringify(nestedEnv)), null);
  const lifecycle = validProject();
  lifecycle.files[0].content = JSON.stringify({ name: "storefront", scripts: { build: "vite build", postinstall: "node setup.js" } });
  assert.equal(parseCodeProjectArtifact(JSON.stringify(lifecycle)), null);
});

test("requires package metadata, a build script, README, and a real entry point", () => {
  const noReadme = validProject();
  noReadme.files = noReadme.files.filter((file) => file.path !== "README.md");
  assert.equal(parseCodeProjectArtifact(JSON.stringify(noReadme)), null);
  const noBuild = validProject();
  noBuild.files[0].content = JSON.stringify({ name: "x", scripts: { test: "vitest" } });
  assert.equal(parseCodeProjectArtifact(JSON.stringify(noBuild)), null);
  const noEntry = validProject();
  noEntry.files = noEntry.files.filter((file) => file.path !== "src/main.tsx" && file.path !== "index.html");
  assert.equal(parseCodeProjectArtifact(JSON.stringify(noEntry)), null);
});

test("accepts a JSON marker or fenced JSON and rejects oversized manifests", () => {
  const source = JSON.stringify(validProject());
  assert.ok(parseCodeProjectArtifact("ALOMDA_CODE_PROJECT_JSON:" + source));
  assert.ok(parseCodeProjectArtifact("```json\n" + source + "\n```"));
  const tooMany = validProject();
  tooMany.files = Array.from({ length: 61 }, (_, index) => ({ path: "src/file" + index + ".ts", content: "x" }));
  assert.equal(parseCodeProjectArtifact(JSON.stringify(tooMany)), null);
});
