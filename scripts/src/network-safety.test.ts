import { test } from "node:test";
import { strict as assert } from "node:assert";
import { isBlockedNetworkAddress } from "./network-safety.js";

test("blocks private, loopback, link-local, carrier-grade NAT and reserved IPv4", () => {
  for (const address of ["10.0.0.1", "127.0.0.1", "192.168.1.10", "172.20.0.1", "169.254.1.1", "100.64.0.1", "198.18.0.1", "224.0.0.1", "0.0.0.0"]) {
    assert.equal(isBlockedNetworkAddress(address), true, address);
  }
});

test("allows ordinary public IPv4", () => {
  assert.equal(isBlockedNetworkAddress("1.1.1.1"), false);
  assert.equal(isBlockedNetworkAddress("8.8.8.8"), false);
});

test("blocks IPv6 unspecified, loopback, ULA, link-local, multicast and mapped private IPv4", () => {
  for (const address of ["::", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:192.168.1.2", "2001:db8::1"]) {
    assert.equal(isBlockedNetworkAddress(address), true, address);
  }
});

test("allows ordinary public IPv6", () => {
  assert.equal(isBlockedNetworkAddress("2606:4700:4700::1111"), false);
  assert.equal(isBlockedNetworkAddress("2001:4860:4860::8888"), false);
});

test("fails closed for malformed addresses", () => {
  assert.equal(isBlockedNetworkAddress("not-an-ip"), true);
});
