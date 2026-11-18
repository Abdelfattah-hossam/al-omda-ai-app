export const GLOBAL_MAP_STYLE_URL =
  "https://tiles.openfreemap.org/styles/liberty";

export const GLOBAL_MAP_CENTER: [number, number] = [0, 18];
export const GLOBAL_MAP_DEFAULT_ZOOM = 0.2;
export const GLOBAL_MAP_MIN_ZOOM = 0.1;
export const GLOBAL_MAP_MAX_ZOOM = 19;
export const GLOBAL_MAP_ZOOM_STEP = 0.5;

export function isValidGlobalMapZoom(value: number): boolean {
  return Number.isFinite(value) && value >= GLOBAL_MAP_MIN_ZOOM && value <= GLOBAL_MAP_MAX_ZOOM;
}

export function getGlobalMapZoomTarget(currentZoom: number, direction: -1 | 1): number | null {
  if (!isValidGlobalMapZoom(currentZoom)) return null;
  const target = Math.min(
    GLOBAL_MAP_MAX_ZOOM,
    Math.max(GLOBAL_MAP_MIN_ZOOM, currentZoom + direction * GLOBAL_MAP_ZOOM_STEP),
  );
  return target === currentZoom ? null : target;
}
