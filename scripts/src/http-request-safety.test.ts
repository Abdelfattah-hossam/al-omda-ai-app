import { test } from "node:test";
import { strict as assert } from "node:assert";
import { assertCredentialRedirectAllowed, shouldForwardHttpHeader } from "./http-request-safety.js";

test("blocks credential-like headers for ordinary HTTP requests", () => {
  for (const header of ["Authorization", "Cookie", "X-API-Key", "X-Session-Token", "X-CSRF-Token", "Proxy-Authorization"]) {
    assert.equal(shouldForwardHttpHeader(header, false), false, header);
  }
  assert.equal(shouldForwardHttpHeader("Accept", false), true);
  assert.equal(shouldForwardHttpHeader("Content-Type", false), true);
});

test("allows configured role credentials only in the explicit credential mode", () => {
  assert.equal(shouldForwardHttpHeader("Authorization", true), true);
  assert.equal(shouldForwardHttpHeader("X-API-Key", true), true);
  assert.equal(shouldForwardHttpHeader("Host", true), false);
});

test("prevents authenticated role headers from crossing redirect origins", () => {
  assert.throws(() => assertCredentialRedirectAllowed(new URL("https://a.example/me"), new URL("https://b.example/me"), true), /cross-origin redirect/);
  assert.doesNotThrow(() => assertCredentialRedirectAllowed(new URL("https://a.example/me"), new URL("https://a.example/other"), true));
  assert.doesNotThrow(() => assertCredentialRedirectAllowed(new URL("https://a.example/me"), new URL("https://b.example/me"), false));
});
