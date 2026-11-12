import { test } from "node:test";
import { strict as assert } from "node:assert";
import { buildCommandEnvironment } from "./command-env.js";

test("preserves the Windows environment required by child processes", () => {
  const env = buildCommandEnvironment({
    Path: "C:\\Windows\\System32", USERPROFILE: "C:\\Users\\test",
    SYSTEMROOT: "C:\\Windows", COMSPEC: "C:\\Windows\\System32\\cmd.exe",
    PATHEXT: ".COM;.EXE;.BAT;.CMD", APPDATA: "C:\\Users\\test\\AppData\\Roaming",
    LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local", TEMP: "C:\\Temp",
  });
  assert.equal(env.PATH, "C:\\Windows\\System32");
  assert.equal(env.SYSTEMROOT, "C:\\Windows");
  assert.equal(env.COMSPEC, "C:\\Windows\\System32\\cmd.exe");
  assert.equal(env.PATHEXT, ".COM;.EXE;.BAT;.CMD");
  assert.equal(env.CI, "1");
  assert.equal(env.NO_COLOR, "1");
});

test("preserves desktop session variables but never inherits API secrets", () => {
  const env = buildCommandEnvironment({
    PATH: "/usr/bin", DISPLAY: ":0", WAYLAND_DISPLAY: "wayland-0",
    XDG_RUNTIME_DIR: "/run/user/1000", OPENAI_API_KEY: "never-forward",
    GEMINI_API_KEY: "never-forward", NODE_OPTIONS: "--require ./evil.js",
  });
  assert.equal(env.DISPLAY, ":0");
  assert.equal(env.WAYLAND_DISPLAY, "wayland-0");
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.GEMINI_API_KEY, undefined);
  assert.equal(env.NODE_OPTIONS, undefined);
});
