export const GLOBAL_MAP_TILE_URL =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

export const GLOBAL_MAP_CENTER: [number, number] = [24, 12];
export const GLOBAL_MAP_DEFAULT_ZOOM = 2;
export const GLOBAL_MAP_MIN_ZOOM = 2;
export const GLOBAL_MAP_MAX_ZOOM = 19;
export const GLOBAL_MAP_ZOOM_STEP = 0.5;
export const GLOBAL_MAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>';

export function isValidGlobalMapZoom(value: number): boolean {
  return Number.isFinite(value) && value >= GLOBAL_MAP_MIN_ZOOM && value <= GLOBAL_MAP_MAX_ZOOM;
}
