import { test } from "node:test";
import { strict as assert } from "node:assert";
import { getLocalAgentOrigin } from "../../artifacts/al-omda-ai/src/lib/local-agent-url.ts";

test("accepts only local runtime URLs and preserves an optional base path", () => {
  assert.equal(getLocalAgentOrigin("http://127.0.0.1:4318/"), "http://127.0.0.1:4318");
  assert.equal(getLocalAgentOrigin("https://localhost:4318/agent/"), "https://localhost:4318/agent");
  assert.equal(getLocalAgentOrigin("http://[::1]:4318"), "http://[::1]:4318");
});

test("rejects remote hosts, unsupported protocols, and embedded credentials", () => {
  assert.throws(() => getLocalAgentOrigin("https://example.com"), /localhost/);
  assert.throws(() => getLocalAgentOrigin("http://192.168.1.10:4318"), /localhost/);
  assert.throws(() => getLocalAgentOrigin("file:///tmp/runtime"), /localhost/);
  assert.throws(() => getLocalAgentOrigin("http://user:pass@127.0.0.1:4318"), /localhost/);
});
