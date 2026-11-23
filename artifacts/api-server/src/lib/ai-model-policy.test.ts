import assert from "node:assert/strict";
import test from "node:test";
import { estimatePromptTokens, getHostedModelTemperature, getHostedProviderOrder, inferHostedModelPurpose, reorderProvidersForPromptSize } from "./ai-model-policy.js";

test("classifies precision work in English and Arabic", () => {
  assert.equal(inferHostedModelPurpose("Review this legal contract"), "precision");
  assert.equal(inferHostedModelPurpose("Calculate the structural beam load"), "precision");
  assert.equal(inferHostedModelPurpose("اشرح التشخيص الطبي"), "precision");
  assert.equal(inferHostedModelPurpose("Prepare an investment cash-flow forecast"), "precision");
});

test("uses a conservative configurable temperature for precision work", () => {
  const previous = process.env.OMDA_PRECISE_TEMPERATURE;
  try {
    process.env.OMDA_PRECISE_TEMPERATURE = "0.25";
    assert.equal(getHostedModelTemperature("Review this contract"), 0.25);
    process.env.OMDA_PRECISE_TEMPERATURE = "0.9";
    assert.equal(getHostedModelTemperature("Review this contract"), 0.2);
    process.env.OMDA_PRECISE_TEMPERATURE = "invalid";
    assert.equal(getHostedModelTemperature("Review this contract"), 0.2);
  } finally {
    if (previous === undefined) delete process.env.OMDA_PRECISE_TEMPERATURE;
    else process.env.OMDA_PRECISE_TEMPERATURE = previous;
  }
});

test("keeps research, general, and image requests within the low-temperature range", () => {
  assert.equal(getHostedModelTemperature("Research and compare model providers"), 0.25);
  assert.equal(getHostedModelTemperature("Hello, how are you?"), 0.2);
  assert.equal(getHostedModelTemperature("Describe this image", true), 0.3);
});

test("Auto leads with Groq and retains independent free providers for every text purpose",()=>{
 for(const purpose of ["precision","research","general"] as const){
  assert.deepEqual(getHostedProviderOrder(purpose),["groq","openrouter","gemini","cloudflare"]);
  assert.deepEqual(getHostedProviderOrder(purpose,true),["groq","openrouter","gemini","cloudflare"]);
 }
 assert.deepEqual(getHostedProviderOrder("general",false,true),["groq","openrouter","gemini"]);
});
test("long contexts lead with OpenRouter's free pool without dropping other providers",()=>{
 assert.deepEqual(reorderProvidersForPromptSize(["groq","openrouter","gemini","cloudflare"],6638),["openrouter","groq","gemini","cloudflare"]);
 assert.deepEqual(reorderProvidersForPromptSize(["groq","openrouter","gemini","cloudflare"],1200),["groq","openrouter","gemini","cloudflare"]);
 assert.deepEqual(reorderProvidersForPromptSize(["groq","gemini"],9000),["groq","gemini"]);
 assert.ok(estimatePromptTokens(["abc"])>=1);
});
