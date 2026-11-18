import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, Marker, setWorkerUrl } from "maplibre-gl";
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
      map.setPaintProperty(layer.id, "fill-color", "#ffffff");
      map.setPaintProperty(layer.id, "fill-outline-color", "#d1d5db");
      map.setPaintProperty(layer.id, "fill-opacity", 1);
    }
    if (isLand) {
      map.setPaintProperty(layer.id, "fill-color", "#f3f4f6");
      map.setPaintProperty(layer.id, "fill-outline-color", "#d1d5db");
      map.setPaintProperty(layer.id, "fill-opacity", 0.98);
    }
    if (isBoundary || isCoastline) {
      map.setPaintProperty(layer.id, "line-color", "#d1d5db");
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

    const activityMarkers: Marker[] = [];
    let mapLoaded = false;
    const fitWorld = () => map.fitBounds([[-180, -82], [180, 82]], {
      padding: { top: 8, bottom: 8, left: 10, right: 10 },
      duration: 0,
    });
    map.on("load", () => {
      mapLoaded = true;
      fitWorld();
      applyWorldOutlineStyle(map);
      // Geographic markers remain attached to their coordinates while panning and zooming.
      const markerLocations: Array<{ coordinates: [number, number]; country: string; users: string }> = [
        { coordinates: [-105, 42], country: "United States", users: "8,420" },
        { coordinates: [-65, -15], country: "Brazil", users: "3,180" },
        { coordinates: [20, 0], country: "Central Africa", users: "2,640" },
        { coordinates: [105, 35], country: "China", users: "5,210" },
        { coordinates: [135, -25], country: "Australia", users: "1,764" },
      ];
      for (const location of markerLocations) {
        const markerElement = document.createElement("span");
        markerElement.className = "global-map-activity-dot";
        markerElement.setAttribute("role", "img");
        markerElement.setAttribute("aria-label", `${location.country}: ${location.users} active users`);
        markerElement.title = `${location.country} · ${location.users} active users`;
        activityMarkers.push(
          new Marker({ element: markerElement, anchor: "center" }).setLngLat(location.coordinates).addTo(map),
        );
      }
      setTilesLoading(false);
      setTilesError(false);
    });
    map.on("error", () => {
      if (!map.isStyleLoaded()) {
        setTilesLoading(false);
        setTilesError(true);
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
      // Refit after a real container resize so the full world and all markers remain visible.
      if (mapLoaded) fitWorld();
    });
    resizeObserver.observe(element);
    const resizeFrameId = requestAnimationFrame(() => map.resize());
    mapRef.current = map;

    return () => {
      cancelAnimationFrame(resizeFrameId);
      resizeObserver.disconnect();
      mapRef.current = null;
      activityMarkers.forEach((marker) => marker.remove());
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

      <span className="global-map-map-note">{isAr ? "علامات توضيحية — لا تمثل مواقع المستخدمين الفعلية" : "Illustrative markers — not actual user locations"}</span>
      {tilesLoading && <div className="global-map-tile-loading" role="status">{isAr ? "جارٍ تحميل الخريطة…" : "Loading map…"}</div>}
      {tilesError && <div className="global-map-tile-error" role="status">{isAr ? "تعذر تحميل تفاصيل الخريطة" : "Map details could not be loaded"}</div>}
    </div>
  );
}
