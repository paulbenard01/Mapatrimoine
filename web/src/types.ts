import type { Rule } from "./recurrence";

export const THEMES = [
  "social-festive",
  "rituals",
  "performing-arts",
  "oral",
  "physical",
  "games",
  "know-how",
] as const;
export type Theme = (typeof THEMES)[number];

export interface Location {
  label: string;
  lat: number;
  lon: number;
  precision: "site" | "commune" | "department" | "region" | "approximate";
  insee?: string;
  overseas?: boolean;
}

export interface WebSource {
  url: string;
  publisher: string;
  says: string; // what the page states about timing (own words)
  checked_at: string; // YYYY-MM-DD
}

export interface Timing {
  confidence: "high" | "medium" | "low";
  evidence_quote?: string; // from the fiche, at most 25 words
  evidence_page?: number;
  web_sources?: WebSource[];
  notes: string;
}

export interface Element {
  id: string;
  title_fr: string;
  theme: Theme;
  domain: string;
  year_included: number;
  kind: "event" | "practice";
  summary: { fr: string; en: string; lang_review: "draft" | "reviewed" };
  locations: Location[];
  recurrence: Rule | null;
  timing: Timing | null;
  source: { fiche_url: string; fetched_at: string | null; fiche_read: boolean };
  review_status: "unreviewed" | "reviewed";
}

/** Where the places of a not-yet-documented element come from. */
export interface LocationSource {
  kind: "pcilab" | "web";
  url: string;
  publisher: string;
}

export interface Picture {
  src: string; // image URL (Wikimedia Commons thumbnail or PCI Lab fiche image)
  page: string; // where the image is described and credited
  source: "commons" | "pcilab";
  credit: string; // author as credited on Commons, or the publisher for fiche images
  licence: string | null; // e.g. "CC BY-SA 4.0"; null when the fiche states none
  licence_url: string | null;
  alt: string;
}

/** Any element of the national inventory, as listed on culture.gouv.fr. */
export interface InventoryEntry {
  id: string;
  title_fr: string;
  themes: Theme[];
  year_included: number;
  fiche_url: string | null;
  locations: Location[]; // empty when no place could be established
  location_sources: LocationSource[]; // empty for documented elements (see Element)
  image: Picture | null;
}
