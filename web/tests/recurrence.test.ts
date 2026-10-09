import { describe, expect, test } from "vitest";
import {
  upcomingPeriods,
  daysBetween,
  easterSunday,
  formatDate,
  isMovableFeast,
  isOngoing,
  nextOccurrence,
  nthWeekday,
  occurrencesInYear,
  parseDate,
  type Rule,
} from "../src/recurrence";

const goodFriday: Rule = { type: "easter_offset", days: -2 };

describe("easterSunday", () => {
  test.each([
    [2024, "2024-03-31"],
    [2025, "2025-04-20"],
    [2026, "2026-04-05"],
    [2027, "2027-03-28"],
    [2019, "2019-04-21"],
    [2038, "2038-04-25"], // latest possible date
    [2285, "2285-03-22"], // earliest possible date
  ])("%i -> %s", (year, iso) => {
    expect(formatDate(easterSunday(year))).toBe(iso);
  });
});

describe("easter_offset", () => {
  test("Good Friday 2026 and 2025", () => {
    expect(occurrencesInYear(goodFriday, 2026)).toEqual([{ start: "2026-04-03", end: "2026-04-03" }]);
    expect(occurrencesInYear(goodFriday, 2025)).toEqual([{ start: "2025-04-18", end: "2025-04-18" }]);
  });

  test("next Good Friday after 2026-10-08 is in 2027", () => {
    expect(nextOccurrence(goodFriday, "2026-10-08")).toEqual({ start: "2027-03-26", end: "2027-03-26" });
  });

  test("Mardi gras is Easter - 47 days", () => {
    expect(occurrencesInYear({ type: "easter_offset", days: -47 }, 2027)[0].start).toBe("2027-02-09");
  });

  test("Good Friday is a movable feast; fixed dates are not", () => {
    expect(isMovableFeast(goodFriday)).toBe(true);
    expect(isMovableFeast({ type: "fixed", month: 6, day: 24 })).toBe(false);
  });
});

describe("nth_weekday", () => {
  test("first Sunday of September 2026", () => {
    expect(formatDate(nthWeekday(2026, 9, 0, 1)!)).toBe("2026-09-06");
  });

  test("last Sunday of October 2026 and 2027", () => {
    expect(formatDate(nthWeekday(2026, 10, 0, -1)!)).toBe("2026-10-25");
    expect(formatDate(nthWeekday(2027, 10, 0, -1)!)).toBe("2027-10-31");
  });

  test("last weekday when the month ends on that weekday", () => {
    // 2026-01-31 is a Saturday.
    expect(formatDate(nthWeekday(2026, 1, 6, -1)!)).toBe("2026-01-31");
  });

  test("a fifth weekday that does not exist is null", () => {
    expect(nthWeekday(2026, 2, 1, 5)).toBeNull();
  });

  test("from_day: the Sunday after 5 July (fêtes de Gayant)", () => {
    const gayant: Rule = { type: "nth_weekday", month: 7, weekday: 0, n: 1, from_day: 6, duration_days: 3 };
    // 5 July 2026 is a Sunday: the next Sunday is the 12th, not the 5th.
    expect(occurrencesInYear(gayant, 2026)).toEqual([{ start: "2026-07-12", end: "2026-07-14" }]);
    expect(occurrencesInYear(gayant, 2027)[0].start).toBe("2027-07-11");
    expect(occurrencesInYear(gayant, 2029)[0].start).toBe("2029-07-08");
  });

  test("offset_days: the Wednesday before the first Sunday of August, 5 days", () => {
    const rule: Rule = { type: "nth_weekday", month: 8, weekday: 0, n: 1, offset_days: -4, duration_days: 5 };
    // First Sunday of August 2027 is the 1st; the festival starts on Wednesday 28 July.
    expect(occurrencesInYear(rule, 2027)).toEqual([{ start: "2027-07-28", end: "2027-08-01" }]);
  });

  test("rule with duration", () => {
    const rule: Rule = { type: "nth_weekday", month: 10, weekday: 6, n: -1, duration_days: 2 };
    expect(nextOccurrence(rule, "2026-10-08")).toEqual({ start: "2026-10-31", end: "2026-11-01" });
  });
});

describe("fixed", () => {
  const saintJean: Rule = { type: "fixed", month: 6, day: 24 };

  test("next occurrence later this year, then next year", () => {
    expect(nextOccurrence(saintJean, "2026-03-01")?.start).toBe("2026-06-24");
    expect(nextOccurrence(saintJean, "2026-10-08")?.start).toBe("2027-06-24");
  });

  test("today equal to the event day returns today, and it is ongoing", () => {
    const occ = nextOccurrence(saintJean, "2026-06-24")!;
    expect(occ.start).toBe("2026-06-24");
    expect(isOngoing(occ, "2026-06-24")).toBe(true);
    expect(nextOccurrence(saintJean, "2026-06-25")?.start).toBe("2027-06-24");
  });

  test("29 February only in leap years", () => {
    const leap: Rule = { type: "fixed", month: 2, day: 29 };
    expect(occurrencesInYear(leap, 2027)).toEqual([]);
    expect(nextOccurrence(leap, "2026-10-08")?.start).toBe("2028-02-29");
  });
});

describe("year boundary", () => {
  // Calendale period in Provence: 4 December to 2 February.
  const calendale: Rule = { type: "fixed", month: 12, day: 4, duration_days: 61 };

  test("an occurrence crossing New Year ends in the next year", () => {
    expect(occurrencesInYear(calendale, 2026)).toEqual([{ start: "2026-12-04", end: "2027-02-02" }]);
  });

  test("in January, the occurrence that started last December is still current", () => {
    const occ = nextOccurrence(calendale, "2027-01-15")!;
    expect(occ.start).toBe("2026-12-04");
    expect(isOngoing(occ, "2027-01-15")).toBe(true);
  });

  test("after it ends, the next one starts in December", () => {
    expect(nextOccurrence(calendale, "2027-02-03")?.start).toBe("2027-12-04");
  });

  test("New Year's Eve to New Year", () => {
    const rule: Rule = { type: "fixed", month: 12, day: 31, duration_days: 2 };
    expect(nextOccurrence(rule, "2027-01-01")).toEqual({ start: "2026-12-31", end: "2027-01-01" });
  });
});

describe("announced dates and multi-year cycles", () => {
  test("announced editions: the next one, none once they are all past", () => {
    const menton: Rule = { type: "dates", occurrences: [{ start: "2027-02-13", end: "2027-02-28" }] };
    expect(nextOccurrence(menton, "2026-10-08")).toEqual({ start: "2027-02-13", end: "2027-02-28" });
    expect(isOngoing(nextOccurrence(menton, "2027-02-20")!, "2027-02-20")).toBe(true);
    expect(nextOccurrence(menton, "2027-03-01")).toBeNull();
  });

  test("a date announced several years ahead is found", () => {
    const pardon: Rule = { type: "dates", occurrences: [{ start: "2029-06-24", end: "2029-06-24" }] };
    expect(nextOccurrence(pardon, "2026-10-08")?.start).toBe("2029-06-24");
  });

  test("biennial: only in years matching the reference year", () => {
    const ringueta: Rule = { type: "easter_offset", days: 48, duration_days: 2, every_years: 2, reference_year: 2026 };
    expect(occurrencesInYear(ringueta, 2027)).toEqual([]);
    expect(nextOccurrence(ringueta, "2026-10-08")).toEqual({ start: "2028-06-03", end: "2028-06-04" });
    expect(occurrencesInYear(ringueta, 2024)[0].start).toBe("2024-05-18");
  });
});

describe("unknown and helpers", () => {
  test("unknown rule has no date", () => {
    expect(occurrencesInYear({ type: "unknown" }, 2026)).toEqual([]);
    expect(nextOccurrence({ type: "unknown" }, "2026-10-08")).toBeNull();
  });

  test("daysBetween", () => {
    expect(daysBetween("2026-10-08", "2027-03-26")).toBe(169);
    expect(daysBetween("2026-10-08", "2026-10-08")).toBe(0);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2); // across DST change
  });

  test("parseDate rejects impossible dates", () => {
    expect(() => parseDate("2026-02-30")).toThrow();
    expect(() => parseDate("08/10/2026")).toThrow();
  });
});

describe("announced periods", () => {
  test("keeps periods that have not ended, earliest first", () => {
    const periods = [
      { start: "2027-01-10", end: "2027-01-10" },
      { start: "2026-10-01", end: "2026-10-31" }, // ongoing on today
      { start: "2026-09-01", end: "2026-09-02" }, // over
    ];
    expect(upcomingPeriods(periods, "2026-10-09").map((p) => p.start)).toEqual(["2026-10-01", "2027-01-10"]);
    expect(upcomingPeriods(periods, "2027-01-10")).toHaveLength(1);
    expect(upcomingPeriods(periods, "2027-01-11")).toEqual([]);
  });
});
