import { test } from "node:test";
import { strict as assert } from "node:assert";
import { buildMcpEnvironment } from "./mcp-env.js";

test("passes only the required desktop session variables by default", () => {
  const env = buildMcpEnvironment({
    PATH: "/bin", HOME: "/home/test", DISPLAY: ":0", WAYLAND_DISPLAY: "wayland-0",
    XDG_RUNTIME_DIR: "/run/user/1000", DBUS_SESSION_BUS_ADDRESS: "unix:path=/run/user/1000/bus",
    OPENAI_API_KEY: "must-not-leak", GEMINI_API_KEY: "must-not-leak",
  });
  assert.equal(env.DISPLAY, ":0");
  assert.equal(env.WAYLAND_DISPLAY, "wayland-0");
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.GEMINI_API_KEY, undefined);
});

test("passes only explicitly selected additional secret variables", () => {
  const env = buildMcpEnvironment({ PROJECT_TOKEN: "allowed", OTHER_SECRET: "blocked" }, ["PROJECT_TOKEN", "bad-name"]);
  assert.equal(env.PROJECT_TOKEN, "allowed");
  assert.equal(env.OTHER_SECRET, undefined);
  assert.equal(env["bad-name"], undefined);
});
