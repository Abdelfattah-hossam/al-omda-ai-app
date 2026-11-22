import test from "node:test";
import assert from "node:assert/strict";
import { detectIosDevice } from "./download-file";

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_UA = "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPADOS_DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.1";
const DESKTOP_MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const WINDOWS_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

test("detects iPhone and iPad user agents", () => {
  assert.equal(detectIosDevice(IPHONE_UA, "iPhone", 5), true);
  assert.equal(detectIosDevice(IPAD_UA, "iPad", 5), true);
});

test("detects iPadOS desktop-mode Safari (MacIntel with touch)", () => {
  assert.equal(detectIosDevice(IPADOS_DESKTOP_UA, "MacIntel", 5), true);
});

test("does not flag desktop or Android browsers", () => {
  assert.equal(detectIosDevice(DESKTOP_MAC_UA, "MacIntel", 0), false);
  assert.equal(detectIosDevice(WINDOWS_UA, "Win32", 0), false);
  assert.equal(detectIosDevice(ANDROID_UA, "Linux armv8l", 5), false);
});
