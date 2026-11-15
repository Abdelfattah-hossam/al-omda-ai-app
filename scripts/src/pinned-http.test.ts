import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createServer, type AddressInfo } from "node:net";
import { requestPinnedHttp } from "./pinned-http.js";

test("connects to the validated IP while preserving the requested hostname", async () => {
  const server = createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end(request.headers.host || "missing-host");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  try {
    const target = new URL(`http://rebind-test.invalid:${address.port}/health?source=runtime`);
    const response = await requestPinnedHttp(target, { address: "127.0.0.1", family: 4 }, "GET", new Headers());
    assert.equal(response.status, 200);
    assert.equal(await new Response(response.body).text(), `rebind-test.invalid:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("returns an empty body for HEAD requests", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("must not be read");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  try {
    const target = new URL(`http://head-test.invalid:${address.port}/`);
    const response = await requestPinnedHttp(target, { address: "127.0.0.1", family: 4 }, "HEAD", new Headers());
    assert.equal(response.status, 200);
    assert.equal(response.body, null);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
