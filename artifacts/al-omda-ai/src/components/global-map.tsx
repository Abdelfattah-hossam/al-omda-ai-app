import { useCallback, useEffect, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  GLOBAL_MAP_ATTRIBUTION,
  GLOBAL_MAP_CENTER,
  GLOBAL_MAP_DEFAULT_ZOOM,
  GLOBAL_MAP_MAX_ZOOM,
  GLOBAL_MAP_MIN_ZOOM,
  GLOBAL_MAP_TILE_URL,
  GLOBAL_MAP_ZOOM_STEP,
  getGlobalMapTileLoadState,
  getGlobalMapZoomTarget,
} from "./global-map-config";

type GlobalMapProps = {
  isAr: boolean;
};

type TileStatus = "loaded" | "error";

function getTileKey(coords: L.Coords): string {
  return `${coords.z}:${coords.x}:${coords.y}`;
}

export default function GlobalMap({ isAr }: GlobalMapProps) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const [tilesError, setTilesError] = useState(false);
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const [tilesLoading, setTilesLoading] = useState(true);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const map = L.map(element, {
      center: GLOBAL_MAP_CENTER,
      zoom: GLOBAL_MAP_DEFAULT_ZOOM,
      minZoom: GLOBAL_MAP_MIN_ZOOM,
      maxZoom: GLOBAL_MAP_MAX_ZOOM,
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: false,
      worldCopyJump: true,
      zoomSnap: GLOBAL_MAP_ZOOM_STEP,
      zoomDelta: GLOBAL_MAP_ZOOM_STEP,
      touchZoom: true,
      doubleClickZoom: true,
      dragging: true,
      maxBounds: [[-85, -540], [85, 540]],
      maxBoundsViscosity: 0.75,
    });

    const tileLayer = L.tileLayer(GLOBAL_MAP_TILE_URL, {
      subdomains: "abcd",
      maxZoom: GLOBAL_MAP_MAX_ZOOM,
      attribution: GLOBAL_MAP_ATTRIBUTION,
      // The URL already supports CARTO's {r} suffix. Avoid Leaflet's extra
      // retina zoom offset, which would otherwise conflict with maxZoom.
      detectRetina: false,
    });
    const tileStatuses = new Map<string, TileStatus>();

    tileLayer.on("loading", () => {
      tileStatuses.clear();
      setTilesLoading(true);
      setTilesLoaded(false);
      setTilesError(false);
    });
    tileLayer.on("tileload", (event: L.TileEvent) => {
      tileStatuses.set(getTileKey(event.coords), "loaded");
    });
    tileLayer.on("tileerror", (event: L.TileEvent) => {
      tileStatuses.set(getTileKey(event.coords), "error");
    });
    tileLayer.on("tileunload", (event: L.TileEvent) => {
      tileStatuses.delete(getTileKey(event.coords));
    });
    tileLayer.on("load", () => {
      const statuses = [...tileStatuses.values()];
      const successfulTiles = statuses.filter((status) => status === "loaded").length;
      const failedTiles = statuses.filter((status) => status === "error").length;
      const tileState = getGlobalMapTileLoadState(successfulTiles, failedTiles);
      setTilesLoading(false);
      setTilesLoaded(tileState.loaded);
      setTilesError(tileState.error);
    });
    tileLayer.addTo(map);
    tileLayerRef.current = tileLayer;

    L.control.scale({ imperial: false, metric: true, position: "bottomleft" }).addTo(map);
    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resizeObserver.observe(element);
    const resizeFrameId = requestAnimationFrame(() => map.invalidateSize({ pan: false }));

    return () => {
      cancelAnimationFrame(resizeFrameId);
      resizeObserver.disconnect();
      mapRef.current = null;
      tileLayerRef.current = null;
      map.remove();
    };
  }, []);

  const zoomIn = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const target = getGlobalMapZoomTarget(map.getZoom(), 1);
    if (target !== null) map.setZoom(target);
  }, []);
  const zoomOut = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const target = getGlobalMapZoomTarget(map.getZoom(), -1);
    if (target !== null) map.setZoom(target);
  }, []);
  const reset = useCallback(() => mapRef.current?.setView(GLOBAL_MAP_CENTER, GLOBAL_MAP_DEFAULT_ZOOM, { animate: true }), []);
  const retryTiles = useCallback(() => {
    setTilesError(false);
    setTilesLoaded(false);
    setTilesLoading(true);
    tileLayerRef.current?.redraw();
  }, []);

  return (
    <div className="global-map-canvas">
      <div ref={elementRef} className="global-map-leaflet" role="region" aria-label={isAr ? "خريطة عالمية تفاعلية واقعية" : "Interactive realistic world map"} />
      <div className="global-map-floating-controls" role="group" aria-label={isAr ? "أدوات الخريطة" : "Map controls"}>
        <button type="button" onClick={zoomIn} aria-label={isAr ? "تكبير الخريطة" : "Zoom in"}>+</button>
        <button type="button" onClick={zoomOut} aria-label={isAr ? "تصغير الخريطة" : "Zoom out"}>−</button>
        <button type="button" onClick={reset} aria-label={isAr ? "إعادة ضبط الخريطة" : "Reset map"} title={isAr ? "إعادة ضبط" : "Reset"}>⌖</button>
      </div>
      {tilesLoading && <div className="global-map-tile-loading" role="status">{isAr ? "جارٍ تحميل الخريطة…" : "Loading map…"}</div>}
      {tilesError && !tilesLoaded && !tilesLoading && <div className="global-map-tile-error" role="status"><strong>{isAr ? "تعذر تحميل الخريطة" : "Map tiles could not be loaded"}</strong><span>{isAr ? "تحقق من الاتصال وحاول مرة أخرى" : "Check your connection and retry"}</span><button type="button" onClick={retryTiles}>{isAr ? "إعادة المحاولة" : "Retry"}</button></div>}
      <div className="global-map-provider-label">{isAr ? "خرائط الشوارع · OpenStreetMap" : "Street map · OpenStreetMap"}</div>
    </div>
  );
}
