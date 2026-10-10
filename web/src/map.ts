// MapLibre map: clustered markers, shape = kind (circle event, diamond practice, ring not yet
// documented), colour = theme.
import type { FeatureCollection, Point } from "geojson";
import {
  MapLibreMap,
  Marker,
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

import { spreadStacked } from "./spread";
import { THEME_COLORS } from "./theme-colors";
import { THEMES, type Location, type Theme } from "./types";

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

/** One element as the map needs it; an element with several places gets one marker per place. */
export interface MapEntry {
  id: string;
  title: string;
  icon: string; // `${kind}-${theme}`, kind = event | practice | located
  theme: Theme;
  locations: Location[];
}

/** Cluster size in px: the same steps size the HTML donut and the invisible click target. */
// Zoom at which pins 50 m apart are about 30 px apart (France).
const STACK_ZOOM = 16;

const clusterRadius = (count: number) => (count >= 50 ? 26 : count >= 15 ? 22 : count >= 5 ? 19 : 16);

function donutSegment(start: number, end: number, r: number, r0: number, color: string): string {
  if (end - start === 1) end -= 0.00001;
  const a0 = 2 * Math.PI * (start - 0.25);
  const a1 = 2 * Math.PI * (end - 0.25);
  const [x0, y0, x1, y1] = [Math.cos(a0), Math.sin(a0), Math.cos(a1), Math.sin(a1)];
  const large = end - start > 0.5 ? 1 : 0;
  return (
    `<path d="M ${r + r0 * x0} ${r + r0 * y0} L ${r + r * x0} ${r + r * y0} ` +
    `A ${r} ${r} 0 ${large} 1 ${r + r * x1} ${r + r * y1} L ${r + r0 * x1} ${r + r0 * y1} ` +
    `A ${r0} ${r0} 0 ${large} 0 ${r + r0 * x0} ${r + r0 * y0}" fill="${color}"/>`
  );
}

/** A cluster as a donut chart of its themes, with the number of markers in the middle. */
function donut(props: Record<string, unknown>): HTMLElement {
  const counts = THEMES.map((t) => Number(props[t] ?? 0));
  const total = counts.reduce((a, b) => a + b, 0);
  const r = clusterRadius(total);
  const r0 = Math.round(r * 0.58);
  let start = 0;
  const segments = counts
    .map((n, i) => {
      if (!n) return "";
      const end = start + n / total;
      const path = donutSegment(start, end, r, r0, THEME_COLORS[THEMES[i]]);
      start = end;
      return path;
    })
    .join("");
  const el = document.createElement("div");
  el.className = "cluster-donut";
  el.innerHTML =
    `<svg width="${2 * r}" height="${2 * r}" viewBox="-1 -1 ${2 * r + 2} ${2 * r + 2}" aria-hidden="true">` +
    segments +
    `<circle cx="${r}" cy="${r}" r="${r0}" fill="#fff"/>` +
    `<circle cx="${r}" cy="${r}" r="${r}" fill="none" stroke="#1b1b1f" stroke-width="1.5"/>` +
    `<text x="${r}" y="${r}" text-anchor="middle" dominant-baseline="central">${total}</text></svg>`;
  return el;
}

function markerImage(shape: "circle" | "diamond" | "ring", fill: string, size = 26): ImageData {
  const ratio = 2;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size * ratio;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(ratio, ratio);
  const c = size / 2;
  const r = size / 2 - 3;
  ctx.beginPath();
  if (shape === "ring") {
    // Not documented yet: a smaller white disc with a thick theme-coloured ring.
    ctx.arc(c, c, r - 4, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = fill;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c, c, r - 1.5, 0, Math.PI * 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#1b1b1f";
    ctx.stroke();
    return ctx.getImageData(0, 0, size * ratio, size * ratio);
  }
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
  setEntries(entries: MapEntry[]): void;
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

  let pending: MapEntry[] = [];
  let selected: string | null = null;
  let flyOnLoad = false;
  let ready = false;
  let byId = new Map<string, MapEntry>();

  const toGeoJSON = (entries: MapEntry[]): FeatureCollection => {
    const pins = entries.flatMap((entry) =>
      entry.locations.map((loc) => ({
        lat: loc.lat,
        lon: loc.lon,
        id: entry.id,
        icon: entry.icon,
        theme: entry.theme,
        title: entry.title,
        // Documented elements draw above the located-only ones.
        rank: entry.icon.startsWith("located") ? 0 : 1,
      })),
    );
    // Pins on the same spot are spread 50 m apart; documented ones keep the true spot.
    const positions = spreadStacked(pins, (a, b) => b.rank - a.rank || a.id.localeCompare(b.id));
    return {
      type: "FeatureCollection",
      features: pins.map(({ lat: _lat, lon: _lon, ...properties }, i) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: positions[i] },
        properties,
      })),
    };
  };

  map.on("error", (e: ErrorEvent) => {
    // A failed style or tile request must not break the page; the list stays usable.
    if (!ready && String(e.error?.message ?? "").match(/style|Failed to fetch|NetworkError/i)) onError();
  });

  map.on("load", () => {
    for (const theme of THEMES) {
      map.addImage(`event-${theme}`, markerImage("circle", THEME_COLORS[theme]), { pixelRatio: 2 });
      map.addImage(`practice-${theme}`, markerImage("diamond", THEME_COLORS[theme]), { pixelRatio: 2 });
      map.addImage(`located-${theme}`, markerImage("ring", THEME_COLORS[theme], 22), { pixelRatio: 2 });
    }
    map.addSource("elements", {
      type: "geojson",
      data: toGeoJSON(pending),
      cluster: true,
      clusterRadius: 38,
      clusterMaxZoom: 8,
      // Markers per theme, for the donut charts.
      clusterProperties: Object.fromEntries(
        THEMES.map((t) => [t, ["+", ["case", ["==", ["get", "theme"], t], 1, 0]]]),
      ),
    });
    // Invisible click target under each HTML donut (the donut ignores pointer events).
    map.addLayer({
      id: "clusters",
      type: "circle",
      source: "elements",
      filter: ["has", "point_count"],
      paint: {
        "circle-opacity": 0,
        "circle-radius": ["step", ["get", "point_count"], 16, 5, 19, 15, 22, 50, 26],
      },
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
        "symbol-sort-key": ["get", "rank"],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });
    ready = true;
    view.select(selected, flyOnLoad);
  });

  // Donut markers for the clusters currently in view, keyed by cluster id.
  let donuts = new Map<number, Marker>();
  let donutsOnScreen = new Map<number, Marker>();
  const clearDonuts = () => {
    for (const marker of donutsOnScreen.values()) marker.remove();
    donuts = new Map();
    donutsOnScreen = new Map();
  };
  map.on("render", () => {
    if (!ready || !map.isSourceLoaded("elements")) return;
    const next = new Map<number, Marker>();
    for (const feature of map.querySourceFeatures("elements")) {
      const props = feature.properties;
      if (!props?.cluster) continue;
      const id = props.cluster_id as number;
      if (next.has(id)) continue;
      let marker = donuts.get(id);
      if (!marker) {
        const lngLat = (feature.geometry as Point).coordinates as [number, number];
        marker = new Marker({ element: donut(props) }).setLngLat(lngLat);
        donuts.set(id, marker);
      }
      next.set(id, marker);
      if (!donutsOnScreen.has(id)) marker.addTo(map);
    }
    for (const [id, marker] of donutsOnScreen) if (!next.has(id)) marker.remove();
    donutsOnScreen = next;
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
    const features = e.features ?? [];
    // Several pins under the pointer (a town or a department centre): zoom in until the
    // pins, spread 50 m apart, can be told apart, rather than picking one at random.
    if (new Set(features.map((f) => f.properties?.id)).size > 1 && map.getZoom() < STACK_ZOOM) {
      const coords = features.map((f) => (f.geometry as Point).coordinates as [number, number]);
      const lons = coords.map((c) => c[0]);
      const lats = coords.map((c) => c[1]);
      map.fitBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        { padding: 60, maxZoom: STACK_ZOOM, animate: !reducedMotion() },
      );
      return;
    }
    const id = features[0]?.properties?.id;
    if (id) onSelect(id);
  });
  for (const layer of ["clusters", "points"]) {
    map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
  }

  const view: MapView = {
    setEntries(entries) {
      pending = entries;
      byId = new Map(entries.map((e) => [e.id, e]));
      if (ready) {
        clearDonuts(); // cluster ids are reassigned when the data changes
        (map.getSource("elements") as GeoJSONSource).setData(toGeoJSON(entries));
      }
    },
    select(id, fly) {
      selected = id;
      if (!ready) {
        flyOnLoad = fly;
        return;
      }
      map.setFilter("selected-halo", ["all", ["!", ["has", "point_count"]], ["==", ["get", "id"], id ?? ""]]);
      const entry = id ? byId.get(id) : undefined;
      if (!entry || !fly) return;
      const locs = entry.locations;
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
