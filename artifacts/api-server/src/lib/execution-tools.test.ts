import assert from "node:assert/strict";
import test from "node:test";
import { extractFetchableUrl, isFetchUrlAllowed, runFetchUrlTool } from "./execution-tools.js";

test("extractFetchableUrl finds the first http(s) URL and strips trailing punctuation", () => {
  assert.equal(extractFetchableUrl("لخص محتوى https://example.com/page. من فضلك"), "https://example.com/page");
  assert.equal(extractFetchableUrl("see http://example.org/a?b=1&c=2)"), "http://example.org/a?b=1&c=2");
  assert.equal(extractFetchableUrl("لا يوجد رابط هنا"), null);
  assert.equal(extractFetchableUrl("ftp://example.com/x"), null);
  assert.equal(extractFetchableUrl(""), null);
});

test("isFetchUrlAllowed blocks internal and credentialed targets", () => {
  const blocked = [
    "http://localhost/x", "http://127.0.0.1/x", "http://10.0.0.5/x",
    "http://192.168.1.1/", "http://172.16.0.1/", "http://172.31.255.255/",
    "http://169.254.169.254/latest", "http://0.0.0.0/", "http://[::1]/",
    "http://printer.local/", "http://db.internal/", "http://nas.lan/",
    "https://user:pass@example.com/", "ftp://example.com/", "http://224.0.0.1/",
    "http://100.64.0.1/", "http://192.0.0.8/",
  ];
  for (const item of blocked) {
    assert.equal(isFetchUrlAllowed(new URL(item)), false, item);
  }
  assert.equal(isFetchUrlAllowed(new URL("https://example.com/page")), true);
  assert.equal(isFetchUrlAllowed(new URL("http://172.15.9.9/")), true);
  assert.equal(isFetchUrlAllowed(new URL("https://192.169.0.1/")), true);
  assert.equal(isFetchUrlAllowed(new URL("https://news.ycombinator.com/item?id=1")), true);
});

function fakeFetch(body: string, init?: { status?: number; contentType?: string }): typeof fetch {
  return (async () => new Response(body, {
    status: init?.status ?? 200,
    headers: { "content-type": init?.contentType ?? "text/html; charset=utf-8" },
  })) as typeof fetch;
}

test("runFetchUrlTool converts HTML pages to bounded text evidence", async () => {
  const run = await runFetchUrlTool("https://example.com/", fakeFetch("<html><head><style>body{color:red}</style></head><body><h1>تقرير</h1><p>محتوى مهم &amp; مفيد</p><script>alert(1)</script></body></html>"));
  assert.equal(run.ok, true);
  assert.equal(run.tool, "fetch_url");
  assert.equal(run.riskClass, "read");
  assert.ok(run.detail.includes("200"));
  assert.ok(run.data!.includes("تقرير"));
  assert.ok(run.data!.includes("محتوى مهم & مفيد"));
  assert.ok(!run.data!.includes("alert"));
  assert.ok(!run.data!.includes("color:red"));
});

test("runFetchUrlTool refuses blocked URLs without calling fetch", async () => {
  let called = false;
  const spy = (async () => { called = true; return new Response("x"); }) as typeof fetch;
  const run = await runFetchUrlTool("http://169.254.169.254/latest/meta-data", spy);
  assert.equal(run.ok, false);
  assert.equal(called, false);
});

test("runFetchUrlTool reports HTTP errors and unsupported content types", async () => {
  const missing = await runFetchUrlTool("https://example.com/nope", fakeFetch("nope", { status: 404, contentType: "text/plain" }));
  assert.equal(missing.ok, false);
  assert.ok(missing.detail.includes("404"));
  const binary = await runFetchUrlTool("https://example.com/file", fakeFetch("PK\x03\x04", { contentType: "application/zip" }));
  assert.equal(binary.ok, false);
  assert.ok(binary.detail.includes("unsupported content type"));
});

test("runFetchUrlTool rejects invalid URLs", async () => {
  const run = await runFetchUrlTool("not a url");
  assert.equal(run.ok, false);
  assert.equal(run.detail, "invalid URL");
});
