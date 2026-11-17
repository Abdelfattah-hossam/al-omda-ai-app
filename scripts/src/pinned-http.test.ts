import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fetchPinned } from "./pinned-http.js";

test("blocks private and loopback DNS answers by default", async () => {
  await assert.rejects(
    fetchPinned("https://rebinding.test/", {}, {
      resolveAddresses: async () => [{ address: "127.0.0.1", family: 4 }],
    }),
    /private or reserved/,
  );
});

test("pins the connection to the address that passed validation", async () => {
  let lookups = 0;
  const server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("pinned:" + req.headers.host);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const port = (server.address() as AddressInfo).port;
    const response = await fetchPinned("http://rebinding.test:" + port + "/resource", {}, {
      allowPrivate: true,
      resolveAddresses: async () => {
        lookups += 1;
        return [{ address: "127.0.0.1", family: 4 }];
      },
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "pinned:rebinding.test:" + port);
    assert.equal(lookups, 1, "The checked DNS result must be the one used for the socket.");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("caps response bodies and marks truncated responses", async () => {
  const server = createServer((_req, res) => { res.writeHead(200); res.end("0123456789"); });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const port = (server.address() as AddressInfo).port;
    const response = await fetchPinned("http://127.0.0.1:" + port + "/", {}, {
      allowPrivate: true,
      maxBytes: 4,
    });
    assert.equal(await response.text(), "0123");
    assert.equal(response.headers.get("x-omda-response-truncated"), "true");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
