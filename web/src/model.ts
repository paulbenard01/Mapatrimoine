// Pure derivations: inventory entries + curated elements -> filtered, sorted items.
import { daysBetween, isMovableFeast, isOngoing, nextOccurrence, type Occurrence } from "./recurrence";
import type { Element, InventoryEntry, Location, Theme } from "./types";

export type View = "inventory" | "agenda" | "resources";
export type Zone = "all" | "metro" | "overseas";
export type Sort = "name" | "year" | "date" | "distance";

export const SORTS: Record<View, Sort[]> = {
  inventory: ["name", "year", "distance"],
  agenda: ["date", "distance"],
  resources: ["name"],
};

export interface Filters {
  view: View;
  q: string; // search titles and summaries (every view)
  themes: Theme[]; // empty = all
  month: number | null; // 1-12, agenda only
  zone: Zone; // applies to located elements only
  radiusKm: number | null; // only applied when a position is known
  unesco: boolean; // only elements inscribed on a UNESCO list
}

export interface Position {
  lat: number;
  lon: number;
}

/** One inventory element, enriched when it has been curated (located, summarised, dated). */
export interface Entry extends InventoryEntry {
  element: Element | null;
}

export interface Item {
  entry: Entry;
  element: Element | null;
  next: Occurrence | null;
  daysUntil: number | null; // 0 when ongoing
  ongoing: boolean;
  movable: boolean;
  distanceKm: number | null;
}

export function mergeEntries(inventory: InventoryEntry[], elements: Element[]): Entry[] {
  const curated = new Map(elements.map((e) => [e.id, e]));
  const entries: Entry[] = inventory.map((i) => ({ ...i, element: curated.get(i.id) ?? null }));
  const listed = new Set(inventory.map((i) => i.id));
  for (const e of elements) {
    if (!listed.has(e.id)) {
      entries.push({
        id: e.id,
        title_fr: e.title_fr,
        themes: [e.theme],
        year_included: e.year_included,
        fiche_url: e.source.fiche_url,
        locations: [],
        location_sources: [],
        image: null,
        element: e,
      });
    }
  }
  return entries;
}

/** Great-circle distance (haversine), in km. Runs on the device only. */
export function distanceKm(a: Position, b: Position): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Places shown on the map: the documented element's places, else the located ones. */
export function placesOf(entry: Entry): Location[] {
  return entry.element?.locations.length ? entry.element.locations : entry.locations;
}

export function isOverseas(entry: Entry): boolean {
  return placesOf(entry).some((l) => l.overseas);
}

export function annotate(entries: Entry[], today: string, position: Position | null): Item[] {
  return entries.map((entry) => {
    const element = entry.element;
    const places = placesOf(entry);
    const next = element?.recurrence ? nextOccurrence(element.recurrence, today) : null;
    const ongoing = next ? isOngoing(next, today) : false;
    return {
      entry,
      element,
      next,
      ongoing,
      daysUntil: next ? Math.max(0, daysBetween(today, next.start)) : null,
      movable: element?.recurrence ? isMovableFeast(element.recurrence) : false,
      distanceKm:
        position && places.length ? Math.min(...places.map((l) => distanceKm(position, l))) : null,
    };
  });
}

/** Lower-case, accent-free text for search. */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, " ")
    .toLowerCase();
}

/** True if the occurrence has at least one day in `month` (1-12). */
export function occursInMonth(occ: Occurrence, month: number): boolean {
  const [sy, sm] = occ.start.split("-").map(Number);
  const [ey, em] = occ.end.split("-").map(Number);
  for (let i = sy * 12 + sm - 1; i <= ey * 12 + em - 1; i++) {
    if ((i % 12) + 1 === month) return true;
  }
  return false;
}

interface Skip {
  themes?: boolean;
  month?: boolean;
}

function matches(item: Item, f: Filters, position: Position | null, skip: Skip = {}): boolean {
  const { entry, element } = item;
  if (f.view === "agenda" && element?.kind !== "event") return false;
  if (!skip.themes && f.themes.length && !entry.themes.some((t) => f.themes.includes(t))) return false;
  if (f.unesco && !entry.unesco) return false;
  if (f.q.trim()) {
    const words = fold(f.q).split(/\s+/).filter(Boolean);
    // Titles and summaries in both languages, so "dance" or "danse" finds the same elements.
    const summary = element?.summary ?? entry.summary;
    const hay = fold([entry.title_fr, summary?.fr, summary?.en].filter(Boolean).join(" "));
    if (!words.every((w) => hay.includes(w))) return false;
  }
  if (f.zone !== "all") {
    if (!placesOf(entry).length) return false;
    if ((f.zone === "overseas") !== isOverseas(entry)) return false;
  }
  if (position && f.radiusKm !== null) {
    if (item.distanceKm === null || item.distanceKm > f.radiusKm) return false;
  }
  if (!skip.month && f.view === "agenda" && f.month !== null) {
    return item.next !== null && occursInMonth(item.next, f.month);
  }
  return true;
}

export function applyFilters(items: Item[], f: Filters, position: Position | null): Item[] {
  return items.filter((item) => matches(item, f, position));
}

/** Dated events per month (index 0 = January) over the coming twelve months. */
export function monthCounts(items: Item[], f: Filters, position: Position | null): number[] {
  const counts = new Array<number>(12).fill(0);
  const agenda = { ...f, view: "agenda" as const };
  for (const item of items) {
    if (!item.next || !matches(item, agenda, position, { month: true })) continue;
    for (let m = 1; m <= 12; m++) if (occursInMonth(item.next, m)) counts[m - 1]++;
  }
  return counts;
}

/** Items per theme under all other filters (an element listed under two themes counts twice). */
export function themeCounts(items: Item[], f: Filters, position: Position | null): Map<Theme, number> {
  const counts = new Map<Theme, number>();
  for (const item of items) {
    if (!matches(item, f, position, { themes: true })) continue;
    for (const t of item.entry.themes) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return counts;
}

const collator = new Intl.Collator("fr", { sensitivity: "base", ignorePunctuation: true });

export function sortItems(items: Item[], sort: Sort): Item[] {
  const byName = (a: Item, b: Item) => collator.compare(a.entry.title_fr, b.entry.title_fr);
  const sorted = [...items];
  switch (sort) {
    case "name":
      return sorted.sort(byName);
    case "year":
      return sorted.sort((a, b) => b.entry.year_included - a.entry.year_included || byName(a, b));
    case "distance":
      return sorted.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || byName(a, b));
    case "date": {
      // Dated events first (ongoing ones lead), then events without a computable date.
      const rank = (i: Item) => (i.next ? 0 : 1);
      return sorted.sort(
        (a, b) =>
          rank(a) - rank(b) ||
          (a.next && b.next ? a.next.start.localeCompare(b.next.start) : 0) ||
          byName(a, b),
      );
    }
  }
}

/** Month (1-12) of a YYYY-MM-DD date. */
export function monthOf(iso: string): number {
  return Number(iso.slice(5, 7));
}
