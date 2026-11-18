import assert from "node:assert/strict";
import test from "node:test";
import {
  GLOBAL_MAP_CENTER,
  GLOBAL_MAP_DEFAULT_ZOOM,
  GLOBAL_MAP_MAX_ZOOM,
  GLOBAL_MAP_MIN_ZOOM,
  GLOBAL_MAP_STYLE_URL,
  GLOBAL_MAP_ZOOM_STEP,
  getGlobalMapZoomTarget,
  isValidGlobalMapZoom,
} from "./global-map-config.js";

test("global map uses the free OpenFreeMap Liberty vector style", () => {
  assert.equal(GLOBAL_MAP_STYLE_URL, "https://tiles.openfreemap.org/styles/liberty");
});

test("global map default camera and zoom steps stay within supported limits", () => {
  assert.equal(GLOBAL_MAP_CENTER.length, 2);
  assert.ok(GLOBAL_MAP_CENTER.every(Number.isFinite));
  assert.ok(isValidGlobalMapZoom(GLOBAL_MAP_DEFAULT_ZOOM));
  assert.ok(GLOBAL_MAP_MIN_ZOOM < GLOBAL_MAP_MAX_ZOOM);
  assert.equal(GLOBAL_MAP_ZOOM_STEP, 0.5);
});

test("global map zoom validation rejects invalid and out-of-range values", () => {
  assert.equal(isValidGlobalMapZoom(GLOBAL_MAP_MIN_ZOOM), true);
  assert.equal(isValidGlobalMapZoom(GLOBAL_MAP_MAX_ZOOM), true);
  assert.equal(isValidGlobalMapZoom(GLOBAL_MAP_MIN_ZOOM - 0.1), false);
  assert.equal(isValidGlobalMapZoom(GLOBAL_MAP_MAX_ZOOM + 0.1), false);
  assert.equal(isValidGlobalMapZoom(Number.NaN), false);
  assert.equal(isValidGlobalMapZoom(Number.POSITIVE_INFINITY), false);
});

test("global map zoom controls stop at bounds and preserve fractional zoom steps", () => {
  assert.equal(getGlobalMapZoomTarget(GLOBAL_MAP_MIN_ZOOM, -1), null);
  assert.equal(getGlobalMapZoomTarget(GLOBAL_MAP_MAX_ZOOM, 1), null);
  assert.equal(getGlobalMapZoomTarget(2.25, 1), 2.75);
  assert.equal(getGlobalMapZoomTarget(18.75, 1), GLOBAL_MAP_MAX_ZOOM);
  assert.equal(getGlobalMapZoomTarget(GLOBAL_MAP_MIN_ZOOM + 0.25, -1), GLOBAL_MAP_MIN_ZOOM);
  assert.equal(getGlobalMapZoomTarget(18.75, -1), 18.25);
  assert.equal(getGlobalMapZoomTarget(Number.NaN, 1), null);
});
