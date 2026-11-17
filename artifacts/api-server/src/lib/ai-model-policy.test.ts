import assert from "node:assert/strict";
import test from "node:test";
import { getHostedModelTemperature, inferHostedModelPurpose } from "./ai-model-policy.js";

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
