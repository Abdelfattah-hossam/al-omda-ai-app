import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentProposalDirectory, listAgentProposalFiles, writeAgentProposal, writeDelegationManifest, type ProposalBudget } from "./agent-proposals.js";

test("creates isolated proposal directories and writes bounded files", async () => {
  const root = await mkdtemp(join(tmpdir(), "omda-proposals-"));
  try {
    const dir = await createAgentProposalDirectory(root, "run_123", "agent_1");
    const budget: ProposalBudget = { files: new Map(), totalBytes: 0 };
    const saved = await writeAgentProposal(dir, "src/fix.ts", "export const fixed = true;", budget);
    assert.equal(saved.path, "src/fix.ts");
    assert.equal(await readFile(join(dir, "src", "fix.ts"), "utf8"), "export const fixed = true;");
    assert.deepEqual(await listAgentProposalFiles(dir), [{ path: "src/fix.ts", bytes: 26 }]);
    assert.equal(budget.files.size, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rejects traversal, absolute paths, backslashes, and unsafe IDs", async () => {
  const root = await mkdtemp(join(tmpdir(), "omda-proposals-"));
  try {
    const dir = await createAgentProposalDirectory(root, "run_123", "agent_1");
    const budget: ProposalBudget = { files: new Map(), totalBytes: 0 };
    for (const value of ["../escape.txt", "/tmp/escape.txt", "a\\..\\escape.txt", "a//b.txt", ".env", ".env.local", ".git/config", ".omda/models.json", "node_modules/pkg/index.js", "dist/app.js"]) {
      await assert.rejects(() => writeAgentProposal(dir, value, "no", budget));
    }
    await assert.rejects(() => createAgentProposalDirectory(root, "../escape", "agent_1"), /Invalid delegation workspace ID/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rejects symlinked proposal directories and targets", async () => {
  const root = await mkdtemp(join(tmpdir(), "omda-proposals-"));
  const outside = await mkdtemp(join(tmpdir(), "omda-outside-"));
  try {
    const dir = await createAgentProposalDirectory(root, "run_123", "agent_1");
    await symlink(outside, join(dir, "escape"), "dir");
    const budget: ProposalBudget = { files: new Map(), totalBytes: 0 };
    await assert.rejects(() => writeAgentProposal(dir, "escape/pwned.txt", "bad", budget), /symlinks/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("enforces per-agent file and byte budgets and writes a shared manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "omda-proposals-"));
  try {
    const dir = await createAgentProposalDirectory(root, "run_123", "agent_1");
    const budget: ProposalBudget = { files: new Map(), totalBytes: 0 };
    await writeAgentProposal(dir, "same.txt", "one", budget);
    await writeAgentProposal(dir, "same.txt", "two-two", budget);
    assert.equal(budget.totalBytes, 7);
    await assert.rejects(() => writeAgentProposal(dir, "huge.txt", "x".repeat(1024 * 1024 + 1), budget), /1 MB/);
    const path = await writeDelegationManifest(root, "run_123", { status: "running", agents: [{ id: "agent_1" }] });
    assert.equal(path, ".omda/delegates/run_123/manifest.json");
    assert.match(await readFile(join(root, path), "utf8"), /agent_1/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
