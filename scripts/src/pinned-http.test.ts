import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { requestPinnedHttp, requestPinnedHttpWithFallback } from "./pinned-http.js";

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

test("rejects protocol upgrades instead of leaving the request pending", async () => {
  const server = createServer();
  server.on("upgrade", (_request, socket) => {
    socket.end("HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: test\r\n\r\n");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  try {
    const target = new URL(`http://upgrade-test.invalid:${address.port}/`);
    await assert.rejects(
      requestPinnedHttp(target, { address: "127.0.0.1", family: 4 }, "GET", new Headers({ connection: "Upgrade", upgrade: "test" })),
      /Protocol upgrades are not supported/
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});


test("falls back to the next validated address within one overall deadline", async () => {
  const server = createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end(request.headers.host || "missing-host");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  try {
    const target = new URL("http://fallback-test.invalid:" + address.port + "/");
    const response = await requestPinnedHttpWithFallback(
      target,
      [{ address: "127.0.0.2", family: 4 }, { address: "127.0.0.1", family: 4 }],
      "GET",
      new Headers(),
      3000,
    );
    assert.equal(response.status, 200);
    assert.equal(await new Response(response.body).text(), "fallback-test.invalid:" + address.port);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});


test("tries another validated address when the first route stalls", async () => {
  const server = createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end(request.headers.host || "missing-host");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  try {
    const target = new URL("http://stalled-fallback-test.invalid:" + address.port + "/");
    const startedAt = Date.now();
    const response = await requestPinnedHttpWithFallback(
      target,
      [{ address: "203.0.113.1", family: 4 }, { address: "127.0.0.1", family: 4 }],
      "GET",
      new Headers(),
      3000,
    );
    assert.ok(Date.now() - startedAt < 2500, "the first route must not consume the complete request deadline");
    assert.equal(response.status, 200);
    assert.equal(await new Response(response.body).text(), "stalled-fallback-test.invalid:" + address.port);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
