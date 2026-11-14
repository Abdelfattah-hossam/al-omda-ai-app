import { test } from "node:test";
import { strict as assert } from "node:assert";
import { bruteForceCaesar, decodeCtfValue, decodeJwtUnverified, identifyHash } from "./ctf-tools.js";

test("decodes common CTF encodings", () => {
  assert.equal(decodeCtfValue("SGVsbG8=", "base64"), "Hello");
  assert.equal(decodeCtfValue("48656c6c6f", "hex"), "Hello");
  assert.equal(decodeCtfValue("Hello%20world", "url"), "Hello world");
  assert.equal(decodeCtfValue("Uryyb", "rot13"), "Hello");
  assert.equal(decodeCtfValue("01001000 01101001", "binary"), "Hi");
  assert.equal(decodeCtfValue("&lt;flag&gt;", "html"), "<flag>");
  assert.equal(decodeCtfValue("\\u0048\\x69", "unicode"), "Hi");
});

test("rejects malformed, misplaced, and non-canonical Base64 padding", () => {
  assert.equal(decodeCtfValue("SGVsbG8", "base64"), "Hello");
  assert.equal(decodeCtfValue("SGVsbG8", "base64url"), "Hello");
  assert.throws(() => decodeCtfValue("SGVsbG8===", "base64"), /Invalid Base64/);
  assert.throws(() => decodeCtfValue("SGVsbG8=xx", "base64"), /Invalid Base64/);
  assert.throws(() => decodeCtfValue("A", "base64"), /Invalid Base64/);
  assert.throws(() => decodeCtfValue("SGVsbG8+", "base64url"), /Invalid Base64URL/);
  assert.throws(() => decodeCtfValue("Zh==", "base64"), /Invalid Base64/);
});

test("supports Caesar shifts and bounded brute force", () => {
  assert.equal(decodeCtfValue("Khoor", "caesar", 23), "Hello");
  const results = bruteForceCaesar("abc");
  assert.equal(results.length, 26);
  assert.equal(results[0].text, "abc");
});

test("identifies hash format candidates without claiming certainty", () => {
  const result = identifyHash("a".repeat(32));
  assert.deepEqual(result.candidates, ["MD5", "NTLM", "MD4 (possible)"]);
  assert.match(result.note, /heuristic/);
});

test("decodes JWT without claiming signature verification", () => {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const result = decodeJwtUnverified(encode({ alg: "none" }) + "." + encode({ sub: "123" }) + ".signature");
  assert.equal((result.payload as any).sub, "123");
  assert.equal(result.signatureVerified, false);
});

test("rejects malformed and oversized CTF inputs", () => {
  assert.throws(() => decodeCtfValue("xyz", "hex"), /Hex input/);
  assert.throws(() => decodeCtfValue("010", "binary"), /groups of eight/);
  assert.throws(() => decodeJwtUnverified("not.a.jwt.with.too.many.parts"), /exactly three/);
  assert.throws(() => decodeCtfValue("a".repeat(100001), "base64"), /100,000/);
});
