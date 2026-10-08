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
  precision: "commune" | "department" | "region";
  insee?: string;
  overseas?: boolean;
}

export interface Timing {
  confidence: "high" | "medium" | "low";
  evidence_quote: string;
  evidence_page: number;
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
  source: { fiche_url: string; fetched_at: string };
  review_status: "unreviewed" | "reviewed";
}

/** Any element of the national inventory, as listed on culture.gouv.fr. */
export interface InventoryEntry {
  id: string;
  title_fr: string;
  themes: Theme[];
  year_included: number;
  fiche_url: string | null;
}
