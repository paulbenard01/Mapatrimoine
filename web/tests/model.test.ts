import { describe, expect, test } from "vitest";
import {
  annotate,
  applyFilters,
  distanceKm,
  fold,
  mergeEntries,
  monthCounts,
  occursInMonth,
  sortItems,
  themeCounts,
  type Filters,
} from "../src/model";
import type { Element, InventoryEntry } from "../src/types";

function element(id: string, over: Partial<Element> = {}): Element {
  return {
    id,
    title_fr: id,
    theme: "social-festive",
    domain: "d",
    year_included: 2020,
    kind: "event",
    summary: { fr: "fr", en: "en", lang_review: "draft" },
    locations: [{ label: "Paris", lat: 48.8566, lon: 2.3522, precision: "commune" }],
    recurrence: { type: "fixed", month: 6, day: 24 },
    timing: { confidence: "high", evidence_quote: "q", evidence_page: 1, notes: "" },
    source: { fiche_url: "https://www.culture.gouv.fr/x", fetched_at: "2026-10-08", fiche_read: true },
    review_status: "unreviewed",
    ...over,
  };
}

const inventoryOf = (e: Element): InventoryEntry => ({
  id: e.id,
  title_fr: e.title_fr,
  themes: [e.theme],
  year_included: e.year_included,
  fiche_url: e.source.fiche_url,
});

const inventory: Filters = { view: "inventory", q: "", themes: [], month: null, zone: "all", radiusKm: null };
const agenda: Filters = { ...inventory, view: "agenda" };
const TODAY = "2026-10-08";

const sanch = element("La Sanch", {
  theme: "rituals",
  recurrence: { type: "easter_offset", days: -2 },
  locations: [{ label: "Perpignan", lat: 42.699, lon: 2.9045, precision: "commune" }],
});
const noel = element("Les fêtes de Noël en Provence", {
  recurrence: { type: "fixed", month: 12, day: 4, duration_days: 61 },
});
const kabwet = element("Carnaval en kabwet", {
  recurrence: { type: "easter_offset", days: -49 },
  locations: [{ label: "Saint-Louis", lat: 15.95, lon: -61.31, precision: "commune", overseas: true }],
});
const menton = element("La fête du Citron", { recurrence: { type: "unknown" } });
const festNoz = element("Le fest-noz", { kind: "practice", recurrence: null, timing: null });
const curated = [sanch, noel, kabwet, menton, festNoz];
const lace: InventoryEntry = {
  id: "dentelle",
  title_fr: "La dentelle au fuseau du Puy-en-Velay",
  themes: ["know-how", "social-festive"],
  year_included: 2008,
  fiche_url: null,
};
const entries = mergeEntries([...curated.map(inventoryOf), lace], curated);

describe("entries", () => {
  test("every inventory entry is kept; curated ones are enriched", () => {
    expect(entries).toHaveLength(6);
    expect(entries.find((e) => e.id === "dentelle")?.element).toBeNull();
    expect(entries.find((e) => e.id === "La Sanch")?.element?.kind).toBe("event");
  });

  test("a curated element missing from the inventory is still shown", () => {
    expect(mergeEntries([], [sanch])[0].themes).toEqual(["rituals"]);
  });
});

describe("annotate", () => {
  test("computes next occurrence, days until and movable flag", () => {
    const s = annotate(entries, TODAY, null).find((i) => i.entry.id === "La Sanch")!;
    expect(s.next?.start).toBe("2027-03-26");
    expect(s.daysUntil).toBe(169);
    expect(s.movable).toBe(true);
    expect(s.distanceKm).toBeNull();
  });

  test("an ongoing event has 0 days until", () => {
    const [n] = annotate(mergeEntries([], [noel]), "2027-01-10", null);
    expect(n.ongoing).toBe(true);
    expect(n.daysUntil).toBe(0);
  });

  test("undocumented entries have no date and no distance", () => {
    const d = annotate(entries, TODAY, { lat: 45, lon: 3 }).find((i) => i.entry.id === "dentelle")!;
    expect(d.next).toBeNull();
    expect(d.distanceKm).toBeNull();
  });
});

describe("filters", () => {
  const items = annotate(entries, TODAY, null);
  const ids = (f: Filters) => applyFilters(items, f, null).map((i) => i.entry.id);

  test("the inventory view lists everything; the agenda view only events", () => {
    expect(ids(inventory)).toHaveLength(6);
    expect(ids(agenda).sort()).toEqual(["Carnaval en kabwet", "La Sanch", "La fête du Citron", "Les fêtes de Noël en Provence"]);
  });

  test("search ignores case and accents", () => {
    expect(fold("Fêtes de NOËL")).toBe("fetes de noel");
    expect(ids({ ...inventory, q: "noel provence" })).toEqual(["Les fêtes de Noël en Provence"]);
    expect(ids({ ...inventory, q: "puy dentelle" })).toEqual(["dentelle"]);
    expect(ids({ ...agenda, q: "puy dentelle" })).toHaveLength(4); // no search box in the agenda
  });

  test("themes match any of an entry's themes", () => {
    expect(ids({ ...inventory, themes: ["know-how"] })).toEqual(["dentelle"]);
    expect(ids({ ...inventory, themes: ["rituals"] })).toEqual(["La Sanch"]);
  });

  test("zone keeps mapped elements only", () => {
    expect(ids({ ...inventory, zone: "overseas" })).toEqual(["Carnaval en kabwet"]);
    expect(ids({ ...inventory, zone: "metro" })).toHaveLength(4);
  });

  test("month filter (agenda) keeps events with a day in that month", () => {
    expect(ids({ ...agenda, month: 1 })).toEqual(["Les fêtes de Noël en Provence"]);
    expect(ids({ ...agenda, month: 3 })).toEqual(["La Sanch"]);
  });

  test("radius keeps nearby mapped elements, only when a position is known", () => {
    const here = { lat: 42.7, lon: 2.9 };
    const near = applyFilters(annotate(entries, TODAY, here), { ...inventory, radiusKm: 50 }, here);
    expect(near.map((i) => i.entry.id)).toEqual(["La Sanch"]);
    expect(ids({ ...inventory, radiusKm: 50 })).toHaveLength(6);
  });

  test("month counts ignore the month filter and practices", () => {
    expect(monthCounts(items, { ...agenda, month: 3 }, null)).toEqual([1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
  });

  test("theme counts ignore the theme filter and count every listed theme", () => {
    const counts = themeCounts(items, { ...inventory, themes: ["rituals"] }, null);
    expect(counts.get("social-festive")).toBe(5);
    expect(counts.get("know-how")).toBe(1);
    expect(counts.get("rituals")).toBe(1);
  });

  test("occursInMonth across the year boundary", () => {
    expect(occursInMonth({ start: "2026-12-04", end: "2027-02-02" }, 1)).toBe(true);
    expect(occursInMonth({ start: "2026-12-04", end: "2027-02-02" }, 3)).toBe(false);
  });
});

describe("sort", () => {
  const items = annotate(entries, TODAY, null);

  test("by date: dated events first, then undated ones", () => {
    const sorted = sortItems(applyFilters(items, agenda, null), "date").map((i) => i.entry.id);
    expect(sorted).toEqual(["Les fêtes de Noël en Provence", "Carnaval en kabwet", "La Sanch", "La fête du Citron"]);
  });

  test("by name (French collation) and by most recent inclusion", () => {
    expect(sortItems(items, "name")[0].entry.id).toBe("Carnaval en kabwet");
    expect(sortItems(items, "year").at(-1)?.entry.id).toBe("dentelle");
  });

  test("by distance, unknown distances last", () => {
    const here = { lat: 15.9, lon: -61.3 };
    const sorted = sortItems(annotate(entries, TODAY, here), "distance").map((i) => i.entry.id);
    expect(sorted[0]).toBe("Carnaval en kabwet");
    expect(sorted.at(-1)).toBe("dentelle");
  });
});

test("distance Paris-Perpignan is about 690 km", () => {
  const d = distanceKm({ lat: 48.8566, lon: 2.3522 }, { lat: 42.699, lon: 2.9045 });
  expect(d).toBeGreaterThan(680);
  expect(d).toBeLessThan(700);
});
