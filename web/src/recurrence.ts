// Yearly recurrence rules -> concrete dates. The only place in the project that computes dates.
// Dates are calendar days handled as UTC midnights, exchanged as "YYYY-MM-DD" strings.

/** Optional multi-year cycle: the event happens only every N years (e.g. biennial). */
interface Cycle {
  every_years?: number;
  reference_year?: number; // a year in which it takes place
}

export type Rule =
  | ({ type: "fixed"; month: number; day: number; duration_days?: number } & Cycle)
  | ({ type: "easter_offset"; days: number; duration_days?: number } & Cycle)
  | ({
      type: "nth_weekday";
      month: number;
      weekday: number; // 0 = Sunday ... 6 = Saturday
      n: number; // 1-4, or -1 for the last one
      from_day?: number; // count from this day of the month (n >= 1 only)
      offset_days?: number; // shift from the found weekday (-4 = the Wednesday before a Sunday)
      duration_days?: number;
    } & Cycle)
  | { type: "dates"; occurrences: Occurrence[] } // editions announced by organisers
  | { type: "unknown"; duration_days?: number };

export interface Occurrence {
  start: string; // first day, YYYY-MM-DD
  end: string; // last day (inclusive), YYYY-MM-DD
}

const DAY_MS = 86_400_000;

export function parseDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`invalid date: ${iso}`);
  const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (formatDate(date) !== iso) throw new Error(`invalid date: ${iso}`);
  return date;
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Days from `from` to `to` (both YYYY-MM-DD); negative if `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / DAY_MS);
}

/** Gregorian Easter Sunday (anonymous Gregorian algorithm, Meeus/Jones/Butcher). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month, day);
}

/** The n-th `weekday` (0 = Sunday) of a month, counting from `fromDay` (default the 1st);
 *  n = -1 is the last one of the month. Null if it doesn't exist in that month. */
export function nthWeekday(
  year: number,
  month: number,
  weekday: number,
  n: number,
  fromDay = 1,
): Date | null {
  if (n === -1) {
    const last = utc(year, month + 1, 0);
    return addDays(last, -((last.getUTCDay() - weekday + 7) % 7));
  }
  const first = utc(year, month, fromDay);
  const date = addDays(first, ((weekday - first.getUTCDay() + 7) % 7) + 7 * (n - 1));
  return date.getUTCMonth() === month - 1 ? date : null;
}

function inCycle(rule: Cycle, year: number): boolean {
  if (!rule.every_years || rule.reference_year === undefined) return true;
  return (((year - rule.reference_year) % rule.every_years) + rule.every_years) % rule.every_years === 0;
}

function startInYear(rule: Exclude<Rule, { type: "dates" }>, year: number): Date | null {
  if (rule.type !== "unknown" && !inCycle(rule, year)) return null;
  switch (rule.type) {
    case "fixed": {
      const date = utc(year, rule.month, rule.day);
      // 29 February only exists in leap years.
      return date.getUTCMonth() === rule.month - 1 ? date : null;
    }
    case "easter_offset":
      return addDays(easterSunday(year), rule.days);
    case "nth_weekday": {
      const date = nthWeekday(year, rule.month, rule.weekday, rule.n, rule.from_day ?? 1);
      return date && addDays(date, rule.offset_days ?? 0);
    }
    case "unknown":
      return null;
  }
}

/** Occurrences whose first day falls in `year` (zero or one for the supported rules). */
export function occurrencesInYear(rule: Rule, year: number): Occurrence[] {
  if (rule.type === "dates") {
    return rule.occurrences
      .filter((o) => Number(o.start.slice(0, 4)) === year)
      .sort((a, b) => a.start.localeCompare(b.start));
  }
  const start = startInYear(rule, year);
  if (!start) return [];
  const end = addDays(start, Math.max(1, rule.duration_days ?? 1) - 1);
  return [{ start: formatDate(start), end: formatDate(end) }];
}

/** The occurrence in progress on `today`, or else the next one to start. Null when the rule
 *  has no computable date. An occurrence that started last year and is still running counts. */
export function nextOccurrence(rule: Rule, today: string): Occurrence | null {
  const year = parseDate(today).getUTCFullYear();
  for (let y = year - 1; y <= year + 12; y++) {
    for (const occ of occurrencesInYear(rule, y)) {
      if (occ.end >= today) return occ;
    }
  }
  return null;
}

export function isOngoing(occ: Occurrence, today: string): boolean {
  return occ.start <= today && today <= occ.end;
}

/** Movable feasts follow Easter (Mardi gras, Good Friday, Pentecost...). */
export function isMovableFeast(rule: Rule): boolean {
  return rule.type === "easter_offset";
}

/** Announced periods (from DATAtourisme) that have not ended yet, earliest first. */
export function upcomingPeriods<P extends { start: string; end: string }>(periods: P[], today: string): P[] {
  return periods.filter((p) => p.end >= today).sort((a, b) => a.start.localeCompare(b.start));
}
