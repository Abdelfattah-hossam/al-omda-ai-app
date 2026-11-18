import { useCallback, useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, ScaleControl, setWorkerUrl } from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  GLOBAL_MAP_CENTER,
  GLOBAL_MAP_DEFAULT_ZOOM,
  GLOBAL_MAP_MAX_ZOOM,
  GLOBAL_MAP_MIN_ZOOM,
  GLOBAL_MAP_STYLE_URL,
  getGlobalMapZoomTarget,
} from "./global-map-config";

type GlobalMapProps = {
  isAr: boolean;
};

setWorkerUrl(maplibreWorkerUrl);

export default function GlobalMap({ isAr }: GlobalMapProps) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [tilesError, setTilesError] = useState(false);
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const [tilesLoading, setTilesLoading] = useState(true);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    let initialLoadCompleted = false;
    const map = new MapLibreMap({
      container: element,
      style: GLOBAL_MAP_STYLE_URL,
      center: GLOBAL_MAP_CENTER,
      zoom: GLOBAL_MAP_DEFAULT_ZOOM,
      minZoom: GLOBAL_MAP_MIN_ZOOM,
      maxZoom: GLOBAL_MAP_MAX_ZOOM,
      attributionControl: true,
      renderWorldCopies: true,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
      cooperativeGestures: false,
    });

    map.addControl(
      new ScaleControl({ maxWidth: 110, unit: "metric" }),
      "bottom-left",
    );

    map.on("load", () => {
      initialLoadCompleted = true;
      setTilesLoading(false);
      setTilesLoaded(true);
      setTilesError(false);
    });
    map.on("error", () => {
      if (!initialLoadCompleted) {
        setTilesLoading(false);
        setTilesLoaded(false);
        setTilesError(true);
      }
    });

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(element);
    const resizeFrameId = requestAnimationFrame(() => map.resize());
    mapRef.current = map;

    return () => {
      cancelAnimationFrame(resizeFrameId);
      resizeObserver.disconnect();
      mapRef.current = null;
      map.remove();
    };
  }, []);

  const zoomIn = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const target = getGlobalMapZoomTarget(map.getZoom(), 1);
    if (target !== null) map.easeTo({ zoom: target, duration: 180 });
  }, []);

  const zoomOut = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const target = getGlobalMapZoomTarget(map.getZoom(), -1);
    if (target !== null) map.easeTo({ zoom: target, duration: 180 });
  }, []);

  const reset = useCallback(() => {
    mapRef.current?.easeTo({
      center: GLOBAL_MAP_CENTER,
      zoom: GLOBAL_MAP_DEFAULT_ZOOM,
      bearing: 0,
      pitch: 0,
      duration: 350,
    });
  }, []);

  const retryTiles = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    setTilesError(false);
    setTilesLoaded(false);
    setTilesLoading(true);
    map.once("style.load", () => {
      map.once("idle", () => {
        setTilesLoading(false);
        setTilesLoaded(true);
        setTilesError(false);
      });
    });
    map.setStyle(GLOBAL_MAP_STYLE_URL);
  }, []);

  return (
    <div className="global-map-canvas">
      <div
        ref={elementRef}
        className="global-map-maplibre"
        role="region"
        aria-label={isAr ? "خريطة عالمية تفاعلية واقعية" : "Interactive realistic world map"}
      />
      <div className="global-map-floating-controls" role="group" aria-label={isAr ? "أدوات الخريطة" : "Map controls"}>
        <button type="button" onClick={zoomIn} aria-label={isAr ? "تكبير الخريطة" : "Zoom in"} title={isAr ? "تكبير" : "Zoom in"}>+</button>
        <button type="button" onClick={zoomOut} aria-label={isAr ? "تصغير الخريطة" : "Zoom out"} title={isAr ? "تصغير" : "Zoom out"}>−</button>
        <button type="button" onClick={reset} aria-label={isAr ? "إعادة ضبط الخريطة" : "Reset map"} title={isAr ? "إعادة ضبط" : "Reset"}>⌖</button>
      </div>
      {tilesLoading && <div className="global-map-tile-loading" role="status">{isAr ? "جارٍ تحميل الخريطة…" : "Loading map…"}</div>}
      {tilesError && !tilesLoaded && !tilesLoading && (
        <div className="global-map-tile-error" role="status">
          <strong>{isAr ? "تعذر تحميل الخريطة" : "Map could not be loaded"}</strong>
          <span>{isAr ? "تحقق من الاتصال وحاول مرة أخرى" : "Check your connection and retry"}</span>
          <button type="button" onClick={retryTiles}>{isAr ? "إعادة المحاولة" : "Retry"}</button>
        </div>
      )}
      <div className="global-map-provider-label">{isAr ? "خرائط متجهية · OpenFreeMap" : "Vector map · OpenFreeMap"}</div>
    </div>
  );
}
