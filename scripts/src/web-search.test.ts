import { test } from "node:test";
import { strict as assert } from "node:assert";
import { buildBingCompatibleSearchUrl, parseBingCompatibleSearchPayload, requestBingCompatibleSearch } from "./web-search.js";

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

test("sends the standard Bing subscription header and parses bounded HTTP results", async () => {
  let capturedHeaders: Headers | undefined;
  let capturedRedirect: unknown;
  const fakeFetch: typeof fetch = async (_input, init) => {
    capturedHeaders = new Headers(init?.headers);
    capturedRedirect = init?.redirect;
    return new Response(JSON.stringify({ webPages: { value: [{ name: "Docs", url: "https://example.com/docs", snippet: "Useful docs" }] } }), { status: 200 });
  };
  const result = await requestBingCompatibleSearch(new URL("https://search.example/v7/search?q=docs"), "secret-test-key", fakeFetch);
  assert.equal(capturedHeaders?.get("Ocp-Apim-Subscription-Key"), "secret-test-key");
  assert.equal(capturedRedirect, "error");
  assert.equal(result.results[0].title, "Docs");
});

test("rejects failed HTTP responses and oversized provider bodies", async () => {
  const failedFetch: typeof fetch = async () => new Response("unavailable", { status: 503 });
  await assert.rejects(() => requestBingCompatibleSearch(new URL("https://search.example/search"), "", failedFetch), /HTTP 503/);

  const oversizedFetch: typeof fetch = async () => new Response("x".repeat(150001), { status: 200 });
  await assert.rejects(() => requestBingCompatibleSearch(new URL("https://search.example/search"), "", oversizedFetch), /150 KB/);
});

test("rejects invalid JSON from the search provider", async () => {
  const invalidFetch: typeof fetch = async () => new Response("not-json", { status: 200 });
  await assert.rejects(() => requestBingCompatibleSearch(new URL("https://search.example/search"), "", invalidFetch), /valid JSON/);
});
