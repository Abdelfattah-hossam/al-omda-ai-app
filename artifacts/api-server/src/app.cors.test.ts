import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "./app.js";

const allowedOrigins = [
  "https://al-omda-ai-app.abdelfattahhossam1.workers.dev",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];
let server: ReturnType<typeof app.listen>;
let baseUrl: string;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()),
  );
});

test("returns exact CORS origins only for configured app and development origins", async () => {
  for (const origin of allowedOrigins) {
    const response = await fetch(`${baseUrl}/api/healthz`, { headers: { origin } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    assert.equal(response.headers.get("access-control-allow-credentials"), null);
  }
});

test("does not grant CORS access to an unlisted origin", async () => {
  const response = await fetch(`${baseUrl}/api/healthz`, {
    headers: { origin: "https://attacker.example" },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("same-origin requests without Origin remain usable without CORS headers", async () => {
  const response = await fetch(`${baseUrl}/api/healthz`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("answers allowed preflight requests with bounded methods and headers", async () => {
  const origin = allowedOrigins[0];
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), origin);
  assert.match(response.headers.get("access-control-allow-methods") || "", /POST/);
  assert.match(response.headers.get("access-control-allow-headers") || "", /Content-Type/i);
  assert.equal(response.headers.get("access-control-allow-credentials"), null);
});

test("does not grant preflight access to unlisted or missing origins", async () => {
  const rejected = await fetch(`${baseUrl}/api/auth/login`, {
    method: "OPTIONS",
    headers: {
      origin: "https://attacker.example",
      "access-control-request-method": "POST",
    },
  });
  assert.equal(rejected.headers.get("access-control-allow-origin"), null);

  const missing = await fetch(`${baseUrl}/api/auth/login`, {
    method: "OPTIONS",
    headers: { "access-control-request-method": "POST" },
  });
  assert.equal(missing.headers.get("access-control-allow-origin"), null);
});

test("does not authorize TRACE in a preflight response", async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "OPTIONS",
    headers: {
      origin: allowedOrigins[0],
      "access-control-request-method": "TRACE",
    },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), allowedOrigins[0]);
  assert.doesNotMatch(response.headers.get("access-control-allow-methods") || "", /\bTRACE\b/i);
});

test("does not authorize unlisted headers in a preflight response", async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "OPTIONS",
    headers: {
      origin: allowedOrigins[0],
      "access-control-request-method": "POST",
      "access-control-request-headers": "x-unauthorized",
    },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), allowedOrigins[0]);
  assert.doesNotMatch(response.headers.get("access-control-allow-headers") || "", /\bX-Unauthorized\b/i);
});
