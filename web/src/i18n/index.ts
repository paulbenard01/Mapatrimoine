// UI strings and language-dependent formatting. Every visible string lives in fr.ts / en.ts.
import { parseDate, type Occurrence, type Rule } from "../recurrence";
import type { Lang } from "../state";
import type { Theme } from "../types";
import { en } from "./en";
import { fr } from "./fr";

export type Strings = typeof fr;

export const STRINGS: Record<Lang, Strings> = { fr, en };

export const THEME_LABELS: Record<Lang, Record<Theme, string>> = {
  fr: {
    "social-festive": "Pratiques sociales et festives",
    rituals: "Rituels",
    "performing-arts": "Arts du spectacle",
    oral: "Traditions et expressions orales",
    physical: "Pratiques physiques",
    games: "Jeux",
    "know-how": "Savoirs et savoir-faire",
  },
  en: {
    "social-festive": "Social and festive practices",
    rituals: "Rituals",
    "performing-arts": "Performing arts",
    oral: "Oral traditions and expressions",
    physical: "Physical practices",
    games: "Games",
    "know-how": "Knowledge and know-how",
  },
};

const LOCALE: Record<Lang, string> = { fr: "fr-FR", en: "en-GB" };

export function monthNames(lang: Lang, style: "short" | "long"): string[] {
  const fmt = new Intl.DateTimeFormat(LOCALE[lang], { month: style, timeZone: "UTC" });
  return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(Date.UTC(2026, i, 1))));
}

/** "ven. 3 avr. 2027" / "Fri 3 Apr 2027". */
export function formatDay(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALE[lang], {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(parseDate(iso))
    .replace(",", "");
}

/** Badge text: "In 12 days · Fri 3 Apr 2027", "Today · ...", "On now, until ...". */
export function badgeText(occ: Occurrence, daysUntil: number, ongoing: boolean, lang: Lang): string {
  const s = STRINGS[lang];
  if (ongoing && occ.end !== occ.start) return s.ongoingUntil(formatDay(occ.end, lang));
  const when = daysUntil === 0 ? s.today : daysUntil === 1 ? s.tomorrow : s.inDays(daysUntil);
  return `${when} · ${formatDay(occ.start, lang)}`;
}

const EASTER_NAMES: Record<number, [string, string]> = {
  [-52]: ["Jeudi gras", "Fat Thursday (Jeudi gras)"],
  [-49]: ["Dimanche gras", "the Sunday before Shrove Tuesday"],
  [-48]: ["Lundi gras", "the Monday before Shrove Tuesday"],
  [-47]: ["Mardi gras", "Shrove Tuesday (Mardi gras)"],
  [-46]: ["mercredi des Cendres", "Ash Wednesday"],
  [-7]: ["dimanche des Rameaux", "Palm Sunday"],
  [-3]: ["Jeudi saint", "Maundy Thursday"],
  [-2]: ["Vendredi saint", "Good Friday"],
  [0]: ["dimanche de Pâques", "Easter Sunday"],
  [1]: ["lundi de Pâques", "Easter Monday"],
  [39]: ["jeudi de l'Ascension", "Ascension Thursday"],
  [49]: ["dimanche de Pentecôte", "Whit Sunday (Pentecost)"],
  [50]: ["lundi de Pentecôte", "Whit Monday"],
  [60]: ["Fête-Dieu (jeudi)", "Corpus Christi (Thursday)"],
};

function weekdayName(weekday: number, lang: Lang): string {
  // 2026-02-01 is a Sunday.
  return new Intl.DateTimeFormat(LOCALE[lang], { weekday: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2026, 1, 1 + weekday)),
  );
}

function ordinal(n: number, lang: Lang): string {
  if (lang === "fr") return n === -1 ? "dernier" : n === 1 ? "1er" : `${n}e`;
  return n === -1 ? "last" : ["", "first", "second", "third", "fourth"][n];
}

function dayMonth(month: number, day: number, lang: Lang): string {
  const name = monthNames(lang, "long")[month - 1];
  return lang === "fr" ? `${day === 1 ? "1er" : day} ${name}` : `${day} ${name}`;
}

/** Plain-language rule, e.g. "Chaque année : Vendredi saint" / "Every year: second Sunday of September". */
export function describeRule(rule: Rule, lang: Lang): string {
  const s = STRINGS[lang];
  let core: string;
  switch (rule.type) {
    case "fixed":
      core = dayMonth(rule.month, rule.day, lang);
      break;
    case "easter_offset": {
      const named = EASTER_NAMES[rule.days];
      const n = Math.abs(rule.days);
      core = named
        ? named[lang === "fr" ? 0 : 1]
        : lang === "fr"
          ? `${n} jours ${rule.days < 0 ? "avant" : "après"} Pâques`
          : `${n} days ${rule.days < 0 ? "before" : "after"} Easter`;
      break;
    }
    case "nth_weekday": {
      const wd = weekdayName(rule.weekday, lang);
      const month = monthNames(lang, "long")[rule.month - 1];
      if (rule.from_day && rule.from_day > 1) {
        core =
          lang === "fr"
            ? `${wd} suivant le ${dayMonth(rule.month, rule.from_day - 1, lang)}`
            : `the ${wd} after ${dayMonth(rule.month, rule.from_day - 1, lang)}`;
      } else {
        core =
          lang === "fr"
            ? `${ordinal(rule.n, lang)} ${wd} ${/^[aeiouy]/i.test(month) ? "d'" : "de "}${month}`
            : `${ordinal(rule.n, lang)} ${wd} of ${month}`;
      }
      const off = rule.offset_days ?? 0;
      if (off) {
        const n = Math.abs(off);
        core =
          lang === "fr"
            ? `${n} jour${n > 1 ? "s" : ""} ${off < 0 ? "avant" : "après"} le ${core}`
            : `${n} day${n > 1 ? "s" : ""} ${off < 0 ? "before" : "after"} the ${core.replace(/^the /, "")}`;
      }
      break;
    }
    case "unknown":
      return s.undated;
  }
  const duration = rule.duration_days && rule.duration_days > 1 ? ` (${s.duration(rule.duration_days)})` : "";
  return `${s.ruleEvery}${lang === "fr" ? " : " : ": "}${core}${duration}`;
}

export function formatKm(km: number, lang: Lang): string {
  return new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: km < 10 ? 1 : 0 }).format(km);
}
