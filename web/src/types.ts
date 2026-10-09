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
  summary: Summary;
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
  src: string; // Commons thumbnail or PCI Lab image URL, or a site path (img/fiches/...)
  page: string; // where the image is described and credited
  source: "commons" | "pcilab" | "fiche";
  credit: string; // author as credited on Commons, or the publisher for fiche images
  licence: string | null; // e.g. "CC BY-SA 4.0"; null when the fiche states none
  licence_url: string | null;
  alt: string;
}

/** Any element of the national inventory, as listed on culture.gouv.fr. */
export interface Summary {
  fr: string;
  en: string;
  lang_review: "draft" | "reviewed";
}

export interface InventoryEntry {
  id: string;
  title_fr: string;
  themes: Theme[];
  year_included: number;
  fiche_url: string | null;
  locations: Location[]; // empty when no place could be established
  location_sources: LocationSource[]; // empty for documented elements (see Element)
  image: Picture | null;
  /** Short summary tier (data/summaries.yaml) for elements not curated yet; never dated. */
  kind?: "event" | "practice" | null;
  summary?: Summary;
  summary_source?: { publisher: string; url: string };
  review_status?: "unreviewed" | "reviewed";
  /** Inscription on a UNESCO intangible heritage list that this element is (part of). */
  unesco?: Unesco | null;
}

export interface Unesco {
  name_en: string;
  name_fr: string | null;
  list: "RL" | "USL" | "GSP";
  year: number;
  url: string;
}

export interface VocabularyTerm {
  fr: string;
  en: string;
  def_fr: string;
  def_en: string;
}

/** Printable bilingual mediation sheet (milestone M6), drafts until Paul reviews them. */
export interface MediationSheet {
  audience: "general" | "school" | "family";
  questions: { fr: string[]; en: string[] };
  vocabulary: VocabularyTerm[];
  /** Extended sheets (elements inscribed by UNESCO). */
  context?: { fr: string; en: string };
  unesco?: { fr: string; en: string };
  activity?: { title_fr: string; title_en: string; fr: string; en: string; levels: Level[] };
  lang_review: "draft" | "reviewed";
  review_status: "unreviewed" | "reviewed";
}

export type Level = "primary" | "middle" | "high" | "university" | "adult";

/** An event listed by a tourist office in DATAtourisme and matched to a documented element (M5). */
export interface AnnouncedEvent {
  title: string;
  commune: string;
  periods: { start: string; end: string }[];
  url: string | null;
  publisher: string;
}

export interface Announced {
  source: string;
  source_url: string;
  licence: string;
  generated_on: string;
  elements: Record<string, AnnouncedEvent[]>;
}

type Bi = { fr: string; en: string };

/** A link to a public recording or film of an element (data/media.yaml). */
export interface MediaLink {
  title: string;
  url: string;
  publisher: string;
  kind: "audio" | "video";
  year?: number;
  note?: Bi;
}

export interface LessonStep {
  minutes: number;
  title: Bi;
  teacher: Bi;
  students: Bi;
  prompts?: { fr: string[]; en: string[] };
}

/** A one-hour lesson plan (data/lessons/<id>.yaml). */
export interface Lesson {
  id: string;
  level: "primary" | "middle" | "high" | "university";
  title: Bi;
  grade: Bi;
  duration_min: number;
  summary: Bi;
  curriculum: Bi;
  objectives: { fr: string[]; en: string[] };
  materials: { fr: string[]; en: string[] };
  elements: string[];
  steps: LessonStep[];
  assessment: Bi;
  differentiation: Bi;
  going_further: Bi;
  answer_key?: Bi;
  lang_review: "draft" | "reviewed";
  review_status: "unreviewed" | "reviewed";
}

/** A guided tour across several elements (data/stories/<id>.yaml). */
export interface Story {
  id: string;
  kind: "theme" | "place";
  title: Bi;
  tagline: Bi;
  intro: Bi;
  steps: { element: string; heading: Bi; text: Bi; look_for?: Bi }[];
  outro: Bi;
  lang_review: "draft" | "reviewed";
  review_status: "unreviewed" | "reviewed";
}

export interface Resources {
  media: Record<string, MediaLink[]>;
  lessons: Lesson[];
  stories: Story[];
}
