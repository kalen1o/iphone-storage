import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "~/lib/utils";

type LngLat = [number, number];

const defaultStyles = {
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
};

function resolveTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  if (document.documentElement.classList.contains("dark")) return "dark";
  if (document.documentElement.classList.contains("light")) return "light";
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export type MapCnPick = {
  lngLat: LngLat;
};

export function MapCn({
  className,
  center = [105.8342, 21.0278],
  zoom = 9,
  pickedLngLat,
  onPick,
}: {
  className?: string;
  center?: LngLat;
  zoom?: number;
  pickedLngLat?: LngLat | null;
  onPick?: (pick: MapCnPick) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const maplibreRef = useRef<any>(null);

  const styleUrl = useMemo(() => defaultStyles[resolveTheme()], []);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!containerRef.current) return;

      const mod: any = await import("maplibre-gl");
      const maplibre = mod?.default ?? mod;
      maplibreRef.current = maplibre;

      if (!mounted) return;

      const map = new maplibre.Map({
        container: containerRef.current,
        style: styleUrl,
        center,
        zoom,
        attributionControl: false,
      });

      map.addControl(new maplibre.NavigationControl({ showCompass: true }), "top-right");
      map.addControl(new maplibre.AttributionControl({ compact: true }), "bottom-right");

      map.on("load", () => {
        if (!mounted) return;
        setIsReady(true);
      });

      map.on("click", (e: any) => {
        const next: LngLat = [e.lngLat.lng, e.lngLat.lat];
        onPick?.({ lngLat: next });
      });

      mapRef.current = map;
    })();

    return () => {
      mounted = false;
      try {
        markerRef.current?.remove?.();
      } catch {}
      markerRef.current = null;

      try {
        mapRef.current?.remove?.();
      } catch {}
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current || !pickedLngLat || !maplibreRef.current) return;

    if (!markerRef.current) {
      markerRef.current = new maplibreRef.current.Marker({ draggable: true })
        .setLngLat(pickedLngLat)
        .addTo(mapRef.current);

      markerRef.current.on("dragend", () => {
        const lngLat = markerRef.current.getLngLat();
        onPick?.({ lngLat: [lngLat.lng, lngLat.lat] });
      });
    } else {
      markerRef.current.setLngLat(pickedLngLat);
    }
  }, [pickedLngLat, onPick]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.jumpTo({ center, zoom });
  }, [center, zoom]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border/10 bg-card/60 backdrop-blur-lg",
        className
      )}
    >
      <div ref={containerRef} className="h-full w-full" />
      {!isReady ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted-foreground">
          Loading map…
        </div>
      ) : null}
    </div>
  );
}
