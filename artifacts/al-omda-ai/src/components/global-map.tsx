import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type GlobalMapProps = {
  isAr: boolean;
};

export default function GlobalMap({ isAr }: GlobalMapProps) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const map = L.map(element, {
      center: [24, 12],
      zoom: 2,
      minZoom: 2,
      maxZoom: 19,
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: false,
      worldCopyJump: true,
      zoomSnap: 0.5,
      maxBounds: [[-85, -180], [85, 180]],
      maxBoundsViscosity: 0.75,
    });

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      {
        subdomains: "abcd",
        maxZoom: 20,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>',
        detectRetina: true,
      },
    ).addTo(map);

    L.control.scale({ imperial: false, metric: true, position: "bottomleft" }).addTo(map);
    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resizeObserver.observe(element);
    requestAnimationFrame(() => map.invalidateSize({ pan: false }));

    return () => {
      resizeObserver.disconnect();
      mapRef.current = null;
      map.remove();
    };
  }, []);

  const zoomIn = () => mapRef.current?.zoomIn();
  const zoomOut = () => mapRef.current?.zoomOut();
  const reset = () => mapRef.current?.setView([24, 12], 2, { animate: true });

  return (
    <div className="global-map-canvas">
      <div ref={elementRef} className="global-map-leaflet" role="application" aria-label={isAr ? "خريطة عالمية تفاعلية واقعية" : "Interactive realistic world map"} />
      <div className="global-map-floating-controls" aria-label={isAr ? "أدوات الخريطة" : "Map controls"}>
        <button type="button" onClick={zoomIn} aria-label={isAr ? "تكبير الخريطة" : "Zoom in"}>+</button>
        <button type="button" onClick={zoomOut} aria-label={isAr ? "تصغير الخريطة" : "Zoom out"}>−</button>
        <button type="button" onClick={reset} aria-label={isAr ? "إعادة ضبط الخريطة" : "Reset map"} title={isAr ? "إعادة ضبط" : "Reset"}>⌖</button>
      </div>
      <div className="global-map-provider-label">{isAr ? "خرائط الشوارع · OpenStreetMap" : "Street map · OpenStreetMap"}</div>
    </div>
  );
}
