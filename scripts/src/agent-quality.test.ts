import test from "node:test";
import assert from "node:assert/strict";
import { inferAgentDomain } from "./agent-quality.js";

test("prioritizes explicit engineering context over the word code", () => {
  assert.equal(inferAgentDomain("Calculate the beam load under the building code"), "engineering");
  assert.equal(inferAgentDomain("Calculate structural loads under local building codes"), "engineering");
});

test("keeps explicit software requests in the software domain", () => {
  assert.equal(inferAgentDomain("Refactor the software architecture"), "software");
  assert.equal(inferAgentDomain("Write TypeScript code for an API"), "software");
});
