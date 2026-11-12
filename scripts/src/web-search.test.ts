import { test } from "node:test";
import { strict as assert } from "node:assert";
import { buildBingCompatibleSearchUrl, parseBingCompatibleSearchPayload } from "./web-search.js";

test("builds a bounded Bing-compatible HTTPS search URL", () => {
  const url = buildBingCompatibleSearchUrl("https://search.example/v7.0/search", "  AL OMDA AI  ", 50, "en-US", "Moderate");
  assert.equal(url.searchParams.get("q"), "AL OMDA AI");
  assert.equal(url.searchParams.get("count"), "10");
  assert.equal(url.searchParams.get("mkt"), "en-US");
  assert.equal(url.searchParams.get("safeSearch"), "Moderate");
});

test("rejects unsafe endpoints and empty or oversized queries", () => {
  assert.throws(() => buildBingCompatibleSearchUrl("http://search.example/search", "hello"), /HTTPS/);
  assert.throws(() => buildBingCompatibleSearchUrl("https://user:pass@search.example/search", "hello"), /HTTPS/);
  assert.throws(() => buildBingCompatibleSearchUrl("https://search.example/search", "  "), /Search query/);
});

test("parses Bing Web Pages and compatible generic result shapes", () => {
  const parsed = parseBingCompatibleSearchPayload({
    webPages: { totalEstimatedMatches: 2, value: [
      { name: "First", url: "https://example.com/1", snippet: "A result", datePublished: "2026-11-01" },
      { title: "Second", link: "https://example.com/2", description: "Another result" },
    ] },
  });
  assert.equal(parsed.totalEstimatedMatches, 2);
  assert.equal(parsed.results.length, 2);
  assert.equal(parsed.results[0].title, "First");
  assert.equal(parsed.results[1].url, "https://example.com/2");
});

test("rejects non-object responses and ignores malformed result rows", () => {
  assert.throws(() => parseBingCompatibleSearchPayload([]), /invalid JSON object/);
  const parsed = parseBingCompatibleSearchPayload({ results: [null, { name: "Missing URL" }, { title: "Okay", url: "https://example.com" }] });
  assert.equal(parsed.results.length, 1);
});
