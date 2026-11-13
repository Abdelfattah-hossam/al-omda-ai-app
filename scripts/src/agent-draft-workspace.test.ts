import { test } from "node:test";
import { strict as assert } from "node:assert";
import { isAgentDraftPathAllowed, resolveAgentDraftPath } from "./agent-draft-workspace.js";
import { resolve } from "node:path";

test("resolves ordinary relative paths only inside the isolated draft workspace", () => {
  const root = resolve("/tmp/omda-draft");
  assert.equal(resolveAgentDraftPath(root, "src/new-file.ts"), resolve(root, "src", "new-file.ts"));
  assert.throws(() => resolveAgentDraftPath(root, "../outside.txt"), /outside/);
  assert.throws(() => resolveAgentDraftPath(root, "/etc/passwd"), /relative/);
  assert.throws(() => resolveAgentDraftPath(root, "."), /outside/);
});

test("blocks secrets, runtime state, dependencies, and generated build directories", () => {
  for (const path of [".env", ".env.local", ".git/config", ".omda/models.json", ".npmrc", "credentials.json", "id_rsa", "tls/private-key.pem", "node_modules/pkg/index.js", "dist/app.js", "build/output.js", "coverage/report.txt"]) {
    assert.equal(isAgentDraftPathAllowed(path), false, path);
    assert.throws(() => resolveAgentDraftPath(resolve("/tmp/omda-draft"), path), /not allowed/);
  }
  assert.equal(isAgentDraftPathAllowed("src/agent.ts"), true);
  assert.equal(isAgentDraftPathAllowed("docs/README.md"), true);
});
