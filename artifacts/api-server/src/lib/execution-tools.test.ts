import assert from "node:assert/strict";
import test from "node:test";
import { extractFetchableUrl, findAssetMentions, isFetchUrlAllowed, isTextAssetMime, runFetchUrlTool, runReadAssetTool, runRequestReadTools } from "./execution-tools.js";

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

test("findAssetMentions matches by leaf name and stem, case-insensitive, max 2", () => {
  const assets = [
    { path: "u/inbox/11111111-1111-1111-1111-111111111111-sales.csv", name: "11111111-1111-1111-1111-111111111111-sales.csv", mimeType: "text/csv", size: 100 },
    { path: "u/inbox/notes.txt", name: "notes.txt", mimeType: "text/plain", size: 50 },
    { path: "u/inbox/report.pdf", name: "report.pdf", mimeType: "application/pdf", size: 10 },
  ];
  assert.deepEqual(findAssetMentions("لخص محتوى الملف SALES.CSV من فضلك", assets).map((a) => a.name), [assets[0].name]);
  assert.deepEqual(findAssetMentions("compare notes.txt with report.pdf", assets).map((a) => a.name), [assets[1].name, assets[2].name]);
  assert.equal(findAssetMentions("لا يوجد ملف هنا", assets).length, 0);
  assert.equal(findAssetMentions("", assets).length, 0);
  // stem shorter than 4 chars never matches alone
  assert.equal(findAssetMentions("show me the ai file", [{ path: "p", name: "ai.txt", mimeType: "text/plain", size: 1 }]).length, 0);
});

test("isTextAssetMime accepts text-like types only", () => {
  assert.equal(isTextAssetMime("text/csv"), true);
  assert.equal(isTextAssetMime("text/plain; charset=utf-8"), true);
  assert.equal(isTextAssetMime("application/json"), true);
  assert.equal(isTextAssetMime("image/svg+xml"), true);
  assert.equal(isTextAssetMime("application/pdf"), false);
  assert.equal(isTextAssetMime(null), false);
});

test("runReadAssetTool returns bounded text evidence", async () => {
  const run = await runReadAssetTool(
    { path: "u/inbox/x-sales.csv", name: "11111111-1111-1111-1111-111111111111-sales.csv", mimeType: "text/csv", size: 24 },
    { readAssetText: async () => ({ text: "name,total\na,10", bytes: 16 }) },
  );
  assert.equal(run.ok, true);
  assert.equal(run.tool, "read_workspace_asset");
  assert.ok(run.detail.includes("sales.csv"));
  assert.ok(run.data!.includes("a,10"));
});

test("runReadAssetTool refuses binary types, oversize files and read errors", async () => {
  let called = 0;
  const deps = { readAssetText: async () => { called++; throw new Error("storage down"); } };
  const binary = await runReadAssetTool({ path: "p", name: "x.pdf", mimeType: "application/pdf", size: 10 }, deps);
  assert.equal(binary.ok, false);
  assert.equal(called, 0);
  const big = await runReadAssetTool({ path: "p", name: "x.csv", mimeType: "text/csv", size: 300 * 1024 }, deps);
  assert.equal(big.ok, false);
  assert.equal(called, 0);
  const failed = await runReadAssetTool({ path: "p", name: "x.csv", mimeType: "text/csv", size: 10 }, deps);
  assert.equal(failed.ok, false);
  assert.ok(failed.detail.includes("storage down"));
});

test("runRequestReadTools runs url and asset tools together and survives listing failures", async () => {
  const runs = await runRequestReadTools("لخص https://example.com مع مقارنة بالملف data.csv", {
    fetchImpl: fakeFetch("plain text content", { contentType: "text/plain" }),
    listAssets: async () => [{ path: "u/inbox/11111111-1111-1111-1111-111111111111-data.csv", name: "11111111-1111-1111-1111-111111111111-data.csv", mimeType: "text/csv", size: 10 }],
    readAssetText: async () => ({ text: "k,v\n1,2", bytes: 7 }),
  });
  assert.equal(runs.length, 2);
  assert.equal(runs[0].tool, "fetch_url");
  assert.equal(runs[1].tool, "read_workspace_asset");
  assert.ok(runs.every((run) => run.ok));
  const resilient = await runRequestReadTools("اقرأ data.csv", {
    listAssets: async () => { throw new Error("list failed"); },
    readAssetText: async () => ({ text: "x", bytes: 1 }),
  });
  assert.equal(resilient.length, 0);
});

test("redirects cannot bypass private-network URL checks", async () => {
 let calls=0;
 const mock=(async()=>{calls++;return new Response(null,{status:302,headers:{location:"http://127.0.0.1/secret"}})}) as typeof fetch;
 const result=await runFetchUrlTool("https://example.com/start",mock);
 assert.equal(result.ok,false); assert.equal(calls,1);
});
test("safe public redirects preserve normal link reading", async () => {
 let calls=0;
 const mock=(async()=>++calls===1?new Response(null,{status:302,headers:{location:"/final"}}):new Response("public page",{headers:{"content-type":"text/plain"}})) as typeof fetch;
 const result=await runFetchUrlTool("https://example.com/start",mock);
 assert.equal(result.ok,true);assert.equal(calls,2);
});
