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
  isValidGlobalMapZoom,
} from "./global-map-config";

type GlobalMapProps = {
  isAr: boolean;
};

export default function GlobalMap({ isAr }: GlobalMapProps) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const [tilesError, setTilesError] = useState(false);
  const [tilesLoaded, setTilesLoaded] = useState(false);

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
      zoomSnap: 0.25,
      zoomDelta: GLOBAL_MAP_ZOOM_STEP,
      touchZoom: true,
      doubleClickZoom: true,
      dragging: true,
      maxBounds: [[-85, -180], [85, 180]],
      maxBoundsViscosity: 0.75,
    });

    const tileLayer = L.tileLayer(
      GLOBAL_MAP_TILE_URL,
      {
        subdomains: "abcd",
        maxZoom: 20,
        attribution: GLOBAL_MAP_ATTRIBUTION,
        detectRetina: true,
      },
    );
    tileLayer.on("tileerror", () => setTilesError(true));
    tileLayer.on("tileload", () => { setTilesLoaded(true); setTilesError(false); });
    tileLayer.addTo(map);
    tileLayerRef.current = tileLayer;
    const handleViewStart = () => { setTilesLoaded(false); setTilesError(false); };
    map.on("movestart", handleViewStart);
    map.on("zoomstart", handleViewStart);

    L.control.scale({ imperial: false, metric: true, position: "bottomleft" }).addTo(map);
    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resizeObserver.observe(element);
    const resizeFrameId = requestAnimationFrame(() => map.invalidateSize({ pan: false }));

    return () => {
      cancelAnimationFrame(resizeFrameId);
      map.off("movestart", handleViewStart);
      map.off("zoomstart", handleViewStart);
      resizeObserver.disconnect();
      mapRef.current = null;
      tileLayerRef.current = null;
      map.remove();
    };
  }, []);

  const zoomIn = useCallback(() => {
    const map = mapRef.current;
    if (map && isValidGlobalMapZoom(Math.min(GLOBAL_MAP_MAX_ZOOM, map.getZoom() + GLOBAL_MAP_ZOOM_STEP))) map.zoomIn(GLOBAL_MAP_ZOOM_STEP);
  }, []);
  const zoomOut = useCallback(() => {
    const map = mapRef.current;
    if (map && isValidGlobalMapZoom(Math.max(GLOBAL_MAP_MIN_ZOOM, map.getZoom() - GLOBAL_MAP_ZOOM_STEP))) map.zoomOut(GLOBAL_MAP_ZOOM_STEP);
  }, []);
  const reset = useCallback(() => mapRef.current?.setView(GLOBAL_MAP_CENTER, GLOBAL_MAP_DEFAULT_ZOOM, { animate: true }), []);
  const retryTiles = useCallback(() => {
    setTilesError(false);
    setTilesLoaded(false);
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
      {tilesError && !tilesLoaded && <div className="global-map-tile-error" role="status"><strong>{isAr ? "تعذر تحميل الخريطة" : "Map tiles could not be loaded"}</strong><span>{isAr ? "تحقق من الاتصال وحاول مرة أخرى" : "Check your connection and retry"}</span><button type="button" onClick={retryTiles}>{isAr ? "إعادة المحاولة" : "Retry"}</button></div>}
      <div className="global-map-provider-label">{isAr ? "خرائط الشوارع · OpenStreetMap" : "Street map · OpenStreetMap"}</div>
    </div>
  );
}
