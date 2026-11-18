import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, setWorkerUrl } from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  GLOBAL_MAP_CENTER,
  GLOBAL_MAP_DEFAULT_ZOOM,
  GLOBAL_MAP_MAX_ZOOM,
  GLOBAL_MAP_MIN_ZOOM,
  GLOBAL_MAP_STYLE_URL,
} from "./global-map-config";

type GlobalMapProps = {
  isAr: boolean;
};

setWorkerUrl(maplibreWorkerUrl);

function applyWorldOutlineStyle(map: MapLibreMap) {
  for (const layer of map.getStyle().layers ?? []) {
    const sourceLayer = "source-layer" in layer ? String(layer["source-layer"] ?? "") : "";
    const isBackground = layer.type === "background";
    const isBoundary = layer.type === "line" && /boundary/.test(sourceLayer);
    const isCoastline = layer.type === "line" && /water/.test(sourceLayer);
    const isLand = layer.type === "fill" && /landcover|landuse/.test(sourceLayer);
    const isWater = layer.type === "fill" && /water/.test(sourceLayer);

    map.setLayoutProperty(layer.id, "visibility", isBackground || isBoundary || isCoastline || isLand || isWater ? "visible" : "none");

    if (isBackground) map.setPaintProperty(layer.id, "background-color", "#ffffff");
    if (isWater) {
      map.setPaintProperty(layer.id, "fill-color", "#f7f9fb");
      map.setPaintProperty(layer.id, "fill-outline-color", "#e2e5e8");
      map.setPaintProperty(layer.id, "fill-opacity", 1);
    }
    if (isLand) {
      map.setPaintProperty(layer.id, "fill-color", "#ffffff");
      map.setPaintProperty(layer.id, "fill-outline-color", "#e2e5e8");
      map.setPaintProperty(layer.id, "fill-opacity", 0.98);
    }
    if (isBoundary || isCoastline) {
      map.setPaintProperty(layer.id, "line-color", isBoundary ? "#c5cbd1" : "#e1e5e9");
      map.setPaintProperty(layer.id, "line-opacity", isBoundary ? 0.9 : 0.72);
      map.setPaintProperty(layer.id, "line-width", [
        "interpolate", ["linear"], ["zoom"],
        0, 0.28, 2, 0.42, 5, 0.72, 9, 1,
      ]);
    }
  }
}

export default function GlobalMap({ isAr }: GlobalMapProps) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [tilesError, setTilesError] = useState(false);
  const [tilesLoading, setTilesLoading] = useState(true);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const map = new MapLibreMap({
      container: element,
      style: GLOBAL_MAP_STYLE_URL,
      center: GLOBAL_MAP_CENTER,
      zoom: GLOBAL_MAP_DEFAULT_ZOOM,
      minZoom: GLOBAL_MAP_MIN_ZOOM,
      maxZoom: GLOBAL_MAP_MAX_ZOOM,
      attributionControl: { compact: true },
      renderWorldCopies: false,
      scrollZoom: false,
      touchZoomRotate: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
      cooperativeGestures: false,
    });

    map.on("load", () => {
      map.fitBounds([[-180, -82], [180, 82]], { padding: { top: 8, bottom: 8, left: 10, right: 10 }, duration: 0 });
      applyWorldOutlineStyle(map);
      setTilesLoading(false);
      setTilesError(false);
    });
    map.on("error", () => {
      if (!map.isStyleLoaded()) {
        setTilesLoading(false);
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

  return (
    <div className="global-map-canvas global-map-outline-canvas">
      <div
        ref={elementRef}
        className="global-map-maplibre"
        role="img"
        aria-label={isAr ? "خريطة العالم بحدود الدول" : "World map with country outlines"}
      />
      <div className="global-map-activity-dots" aria-hidden="true">
        <span className="global-map-activity-dot dot-north-america" />
        <span className="global-map-activity-dot dot-south-america" />
        <span className="global-map-activity-dot dot-europe" />
        <span className="global-map-activity-dot dot-africa" />
        <span className="global-map-activity-dot dot-asia" />
        <span className="global-map-activity-dot dot-australia" />
      </div>
      {tilesLoading && <div className="global-map-tile-loading" role="status">{isAr ? "جارٍ تحميل الخريطة…" : "Loading map…"}</div>}
      {tilesError && <div className="global-map-tile-error" role="status">{isAr ? "تعذر تحميل تفاصيل الخريطة" : "Map details could not be loaded"}</div>}
      <span className="global-map-map-note">{isAr ? "نقاط توضيحية · لا تمثل مواقع فعلية" : "Illustrative markers · not live locations"}</span>
    </div>
  );
}
