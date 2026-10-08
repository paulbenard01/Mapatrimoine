import type { Theme } from "./types";

// Okabe-Ito colour-blind-safe palette. Colour is never the only cue: markers also differ by
// shape (kind), and every theme is named in the legend, list and detail panel.
export const THEME_COLORS: Record<Theme, string> = {
  "social-festive": "#E69F00",
  rituals: "#0072B2",
  "performing-arts": "#CC79A7",
  oral: "#56B4E9",
  physical: "#009E73",
  games: "#F0E442",
  "know-how": "#D55E00",
};
