// Shareable state <-> URL query string. The visitor's position is never part of it.
import { SORTS, type Filters, type Sort, type View, type Zone } from "./model";
import { THEMES, type Theme } from "./types";

export type Lang = "fr" | "en";
export type Pane = "map" | "list";

export interface State extends Filters {
  lang: Lang;
  sort: Sort;
  selected: string | null;
  pane: Pane; // which pane is shown on narrow screens
}

export const RADII = [10, 25, 50, 100, 250] as const;

export function defaultLang(languages: readonly string[]): Lang {
  for (const tag of languages) {
    const base = tag.toLowerCase().split("-")[0];
    if (base === "fr") return "fr";
    if (base === "en") return "en";
  }
  return "fr";
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function parseState(search: string, languages: readonly string[]): State {
  const p = new URLSearchParams(search);
  const month = Number(p.get("month"));
  const radius = Number(p.get("r"));
  const view = oneOf<View>(p.get("view"), ["inventory", "agenda"], "inventory");
  const themes = (p.get("theme") ?? "")
    .split(",")
    .filter((t): t is Theme => (THEMES as readonly string[]).includes(t));
  return {
    lang: oneOf<Lang>(p.get("lang"), ["fr", "en"], defaultLang(languages)),
    view,
    q: (p.get("q") ?? "").slice(0, 100),
    themes,
    month: view === "agenda" && Number.isInteger(month) && month >= 1 && month <= 12 ? month : null,
    zone: oneOf<Zone>(p.get("zone"), ["all", "metro", "overseas"], "all"),
    radiusKm: (RADII as readonly number[]).includes(radius) ? radius : null,
    sort: oneOf<Sort>(p.get("sort"), SORTS[view], SORTS[view][0]),
    selected: p.get("id"),
    pane: oneOf<Pane>(p.get("pane"), ["map", "list"], "list"),
  };
}

/** Query string with only non-default values. `extra` keeps unrelated params (e.g. today). */
export function serializeState(state: State, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  p.set("lang", state.lang);
  if (state.view !== "inventory") p.set("view", state.view);
  if (state.q.trim()) p.set("q", state.q.trim());
  if (state.themes.length) p.set("theme", state.themes.join(","));
  if (state.month !== null) p.set("month", String(state.month));
  if (state.zone !== "all") p.set("zone", state.zone);
  if (state.radiusKm !== null) p.set("r", String(state.radiusKm));
  if (state.sort !== SORTS[state.view][0]) p.set("sort", state.sort);
  if (state.selected) p.set("id", state.selected);
  if (state.pane !== "list") p.set("pane", state.pane);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return `?${p.toString()}`;
}

/** "Today" as a local calendar date, overridable with ?today=YYYY-MM-DD (tests, screenshots). */
export function resolveToday(search: string, now: Date): string {
  const override = new URLSearchParams(search).get("today");
  if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) return override;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
