import assert from "node:assert/strict";
import test from "node:test";
import {
  GLOBAL_MAP_ATTRIBUTION,
  GLOBAL_MAP_CENTER,
  GLOBAL_MAP_DEFAULT_ZOOM,
  GLOBAL_MAP_MAX_ZOOM,
  GLOBAL_MAP_MIN_ZOOM,
  GLOBAL_MAP_TILE_URL,
  GLOBAL_MAP_ZOOM_STEP,
  isValidGlobalMapZoom,
} from "./global-map-config.js";

test("global map uses a real, attributed street-tile source", () => {
  assert.match(GLOBAL_MAP_TILE_URL, /^https:\/\/\{s\}\.basemaps\.cartocdn\.com\/rastertiles\/voyager\//);
  assert.match(GLOBAL_MAP_ATTRIBUTION, /OpenStreetMap/);
  assert.match(GLOBAL_MAP_ATTRIBUTION, /CARTO/);
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
