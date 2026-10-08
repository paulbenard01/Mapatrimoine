import { describe, expect, test } from "vitest";
import { defaultLang, parseState, resolveToday, serializeState } from "../src/state";
import { badgeText, describeRule } from "../src/i18n";

describe("URL state", () => {
  test("round-trips filters and selection", () => {
    const state = parseState("?lang=en&view=agenda&q=carnaval&theme=rituals,oral&month=4&zone=overseas&r=50&sort=distance&id=X", []);
    expect(state).toMatchObject({
      lang: "en",
      view: "agenda",
      q: "carnaval",
      themes: ["rituals", "oral"],
      month: 4,
      zone: "overseas",
      radiusKm: 50,
      sort: "distance",
      selected: "X",
    });
    expect(parseState(serializeState(state), [])).toEqual(state);
  });

  test("ignores invalid values", () => {
    const state = parseState("?theme=bogus&month=13&r=7&view=x&sort=date", ["en-US"]);
    expect(state).toMatchObject({ lang: "en", view: "inventory", themes: [], month: null, radiusKm: null, sort: "name" });
  });

  test("month and date sorting only exist in the agenda view", () => {
    expect(parseState("?month=4", [])).toMatchObject({ view: "inventory", month: null, sort: "name" });
    expect(parseState("?view=agenda", [])).toMatchObject({ sort: "date" });
  });

  test("never serialises a position", () => {
    const qs = serializeState(parseState("?r=25", []));
    expect(qs).not.toMatch(/lat|lon|pos/);
  });

  test("default language from the browser, French fallback", () => {
    expect(defaultLang(["fr-CA", "en"])).toBe("fr");
    expect(defaultLang(["de-DE", "en-GB"])).toBe("en");
    expect(defaultLang(["de-DE"])).toBe("fr");
  });

  test("today comes from the clock unless overridden", () => {
    expect(resolveToday("", new Date(2026, 9, 8, 23, 30))).toBe("2026-10-08");
    expect(resolveToday("?today=2027-03-20", new Date())).toBe("2027-03-20");
  });
});

describe("i18n formatting", () => {
  test("badge text", () => {
    const occ = { start: "2027-04-03", end: "2027-04-03" };
    expect(badgeText(occ, 12, false, "en")).toBe("In 12 days · Sat 3 Apr 2027");
    expect(badgeText(occ, 0, true, "en")).toBe("Today · Sat 3 Apr 2027");
    expect(badgeText({ start: "2026-12-04", end: "2027-02-02" }, 0, true, "fr")).toBe(
      "En cours, jusqu'au mar. 2 févr. 2027",
    );
  });

  test("rule descriptions", () => {
    expect(describeRule({ type: "easter_offset", days: -2 }, "en")).toBe("Every year: Good Friday");
    expect(describeRule({ type: "easter_offset", days: -2 }, "fr")).toBe("Chaque année : Vendredi saint");
    expect(describeRule({ type: "nth_weekday", month: 9, weekday: 0, n: 2 }, "en")).toBe(
      "Every year: second Sunday of September",
    );
    expect(describeRule({ type: "nth_weekday", month: 10, weekday: 0, n: -1 }, "fr")).toBe(
      "Chaque année : dernier dimanche d'octobre",
    );
    expect(
      describeRule({ type: "nth_weekday", month: 7, weekday: 0, n: 1, from_day: 6, duration_days: 3 }, "fr"),
    ).toBe("Chaque année : dimanche suivant le 5 juillet (3 jours)");
    expect(describeRule({ type: "fixed", month: 6, day: 24 }, "en")).toBe("Every year: 24 June");
  });
});
