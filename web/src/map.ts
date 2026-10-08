// MapLibre map: clustered markers, shape = kind (circle event, diamond practice), colour = theme.
import type { FeatureCollection, Point } from "geojson";
import {
  MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type ErrorEvent,
  type GeoJSONSource,
  type MapGeoJSONFeature,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre 6 loads its worker relative to its own module URL, which bundling breaks:
// let Vite bundle the worker (with its shared chunk) and pass the resulting URL.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

import { THEME_COLORS } from "./theme-colors";
import { THEMES, type Element } from "./types";

export const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

export type Bounds = [[number, number], [number, number]];

export const AREAS: Record<string, Bounds> = {
  metro: [
    [-5.2, 41.3],
    [9.6, 51.15],
  ],
  guadeloupe: [
    [-61.85, 15.83],
    [-61.0, 16.52],
  ],
  martinique: [
    [-61.25, 14.38],
    [-60.8, 14.9],
  ],
  guyane: [
    [-54.6, 2.1],
    [-51.6, 5.8],
  ],
  reunion: [
    [55.2, -21.4],
    [55.85, -20.85],
  ],
  mayotte: [
    [44.95, -13.05],
    [45.32, -12.62],
  ],
};

setWorkerUrl(workerUrl);

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function markerImage(shape: "circle" | "diamond", fill: string, size = 26): ImageData {
  const ratio = 2;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size * ratio;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(ratio, ratio);
  const c = size / 2;
  const r = size / 2 - 3;
  ctx.beginPath();
  if (shape === "circle") {
    ctx.arc(c, c, r - 1, 0, Math.PI * 2);
  } else {
    ctx.moveTo(c, c - r);
    ctx.lineTo(c + r, c);
    ctx.lineTo(c, c + r);
    ctx.lineTo(c - r, c);
    ctx.closePath();
  }
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#1b1b1f";
  ctx.stroke();
  return ctx.getImageData(0, 0, size * ratio, size * ratio);
}

export interface MapView {
  setElements(elements: Element[]): void;
  select(id: string | null, fly: boolean): void;
  fit(bounds: Bounds): void;
  resize(): void;
}

export function createMap(
  container: HTMLElement,
  ariaLabel: string,
  onSelect: (id: string) => void,
  onError: () => void,
): MapView | null {
  let map: MapLibreMap;
  try {
    map = new MapLibreMap({
      container,
      style: STYLE_URL,
      bounds: AREAS.metro,
      attributionControl: { compact: true },
      cooperativeGestures: false,
    });
  } catch {
    onError(); // no WebGL, for instance
    return null;
  }
  map.getCanvas().setAttribute("aria-label", ariaLabel);
  if (import.meta.env.DEV) (window as unknown as { __map: MapLibreMap }).__map = map;
  map.addControl(new NavigationControl({ showCompass: false }), "top-right");

  let pending: Element[] = [];
  let selected: string | null = null;
  let flyOnLoad = false;
  let ready = false;
  let byId = new Map<string, Element>();

  const toGeoJSON = (elements: Element[]): FeatureCollection => ({
    type: "FeatureCollection",
    features: elements.flatMap((element) =>
      element.locations.map((loc) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [loc.lon, loc.lat] },
        properties: {
          id: element.id,
          icon: `${element.kind}-${element.theme}`,
          title: element.title_fr,
        },
      })),
    ),
  });

  map.on("error", (e: ErrorEvent) => {
    // A failed style or tile request must not break the page; the list stays usable.
    if (!ready && String(e.error?.message ?? "").match(/style|Failed to fetch|NetworkError/i)) onError();
  });

  map.on("load", () => {
    for (const theme of THEMES) {
      map.addImage(`event-${theme}`, markerImage("circle", THEME_COLORS[theme]), { pixelRatio: 2 });
      map.addImage(`practice-${theme}`, markerImage("diamond", THEME_COLORS[theme]), { pixelRatio: 2 });
    }
    map.addSource("elements", {
      type: "geojson",
      data: toGeoJSON(pending),
      cluster: true,
      clusterRadius: 38,
      clusterMaxZoom: 8,
    });
    map.addLayer({
      id: "clusters",
      type: "circle",
      source: "elements",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#2b2d42",
        "circle-radius": ["step", ["get", "point_count"], 15, 5, 19, 15, 24],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });
    map.addLayer({
      id: "cluster-count",
      type: "symbol",
      source: "elements",
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": ["Noto Sans Bold"],
        "text-size": 13,
        "text-allow-overlap": true,
      },
      paint: { "text-color": "#ffffff" },
    });
    map.addLayer({
      id: "selected-halo",
      type: "circle",
      source: "elements",
      filter: ["==", ["get", "id"], ""],
      paint: {
        "circle-radius": 19,
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": "#1b1b1f",
        "circle-stroke-width": 3,
      },
    });
    map.addLayer({
      id: "points",
      type: "symbol",
      source: "elements",
      filter: ["!", ["has", "point_count"]],
      layout: {
        "icon-image": ["get", "icon"],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });
    ready = true;
    view.select(selected, flyOnLoad);
  });

  // Lets automated screenshots wait for rendered tiles.
  map.on("idle", () => container.setAttribute("data-idle", "true"));
  map.on("movestart", () => container.removeAttribute("data-idle"));

  map.on("click", "clusters", async (e: MapLayerMouseEvent) => {
    const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
    if (!feature) return;
    const source = map.getSource("elements") as GeoJSONSource;
    const zoom = await source.getClusterExpansionZoom(feature.properties.cluster_id);
    const center = (feature.geometry as Point).coordinates as [number, number];
    map.easeTo({ center, zoom, animate: !reducedMotion() });
  });
  map.on("click", "points", (e: MapLayerMouseEvent) => {
    const id = e.features?.[0]?.properties?.id;
    if (id) onSelect(id);
  });
  for (const layer of ["clusters", "points"]) {
    map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
  }

  const view: MapView = {
    setElements(elements) {
      pending = elements;
      byId = new Map(elements.map((e) => [e.id, e]));
      if (ready) (map.getSource("elements") as GeoJSONSource).setData(toGeoJSON(elements));
    },
    select(id, fly) {
      selected = id;
      if (!ready) {
        flyOnLoad = fly;
        return;
      }
      map.setFilter("selected-halo", ["all", ["!", ["has", "point_count"]], ["==", ["get", "id"], id ?? ""]]);
      const element = id ? byId.get(id) : undefined;
      if (!element || !fly) return;
      const locs = element.locations;
      if (locs.length === 1) {
        map.easeTo({
          center: [locs[0].lon, locs[0].lat],
          zoom: Math.max(map.getZoom(), 9),
          animate: !reducedMotion(),
        });
      } else {
        const lons = locs.map((l) => l.lon);
        const lats = locs.map((l) => l.lat);
        map.fitBounds(
          [
            [Math.min(...lons), Math.min(...lats)],
            [Math.max(...lons), Math.max(...lats)],
          ],
          { padding: 80, maxZoom: 10, animate: !reducedMotion() },
        );
      }
    },
    fit(bounds) {
      map.fitBounds(bounds, { padding: 24, animate: !reducedMotion() });
    },
    resize() {
      map.resize();
    },
  };
  return view;
}
