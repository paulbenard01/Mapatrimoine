// Printable bilingual mediation sheet (M6): French and English side by side.
// Standard sheets fit one A4 page; extended sheets (elements inscribed by UNESCO) add
// context, UNESCO and activity sections and may run to a second page.
import { h, type Child } from "./dom";
import { STRINGS, THEME_LABELS, describeRule, formatDay } from "./i18n";
import type { Item } from "./model";
import type { Lang } from "./state";
import type { MediationSheet, Picture } from "./types";

const both = (pick: (lang: Lang) => string) => `${pick("fr")} · ${pick("en")}`;

function columns(fr: Child | Child[], en: Child | Child[]): HTMLElement {
  return h("div", { class: "sheet-cols" }, h("div", { lang: "fr" }, fr), h("div", { lang: "en" }, en));
}

function picture(p: Picture | null, base: string): HTMLElement | null {
  if (!p) return null;
  const src = p.source === "fiche" ? `${base}${p.src}` : p.src;
  const credit = p.source === "commons" ? `${p.credit}${p.licence ? `, ${p.licence}` : ""}, Wikimedia Commons` : p.credit;
  return h(
    "figure",
    { class: "sheet-picture" },
    h("img", {
      src,
      alt: p.alt,
      referrerpolicy: "no-referrer",
      onerror: (e: Event) => (e.target as HTMLElement).closest("figure")?.remove(),
    }),
    h("figcaption", {}, credit),
  );
}

function when(item: Item): HTMLElement | null {
  const element = item.element;
  if (!element || element.kind !== "event" || !element.recurrence) return null;
  const rule = (lang: Lang) => describeRule(element.recurrence!, lang);
  const line = (lang: Lang) => [
    h("p", {}, rule(lang)),
    item.next ? h("p", {}, `${STRINGS[lang].sheetNext} ${formatDay(item.next.start, lang)}`) : null,
  ];
  return h("div", { class: "sheet-when" }, h("h2", {}, both((l) => STRINGS[l].when)), columns(line("fr"), line("en")));
}

const paragraphs = (text: string) => text.split(/\n\s*\n/).map((t) => h("p", {}, t));

export function renderSheet(
  item: Item,
  sheet: MediationSheet,
  ui: Lang,
  base: string,
  onBack: () => void,
): HTMLElement {
  const { entry, element } = item;
  const { fr, en } = STRINGS;
  const s = STRINGS[ui];
  const extended = Boolean(sheet.context);
  const kind = element?.kind ?? entry.kind ?? null;
  const kindLabel = (l: Lang) => (kind === "event" ? STRINGS[l].event : kind === "practice" ? STRINGS[l].practice : "");
  const theme = entry.themes[0];
  const summary = element?.summary ?? entry.summary;
  const places = element?.locations ?? entry.locations;
  const meta = [
    kind ? both(kindLabel) : null,
    `${THEME_LABELS.fr[theme]} · ${THEME_LABELS.en[theme]}`,
    `${both((l) => STRINGS[l].yearIncluded)} ${entry.year_included}`,
  ].filter(Boolean);
  const ficheUrl = element?.source.fiche_url ?? entry.fiche_url;
  return h(
    "article",
    { class: `sheet${extended ? " extended" : ""}`, "aria-labelledby": "sheet-title" },
    h(
      "div",
      { class: "sheet-tools" },
      h("button", { type: "button", "data-key": "sheet-back", onclick: onBack }, `← ${s.sheetBack}`),
      h("button", { type: "button", "data-key": "sheet-print", onclick: () => window.print() }, s.print),
    ),
    h(
      "header",
      { class: "sheet-head" },
      h("p", { class: "sheet-kicker" }, `${both((l) => STRINGS[l].sheetKicker)} — ${both((l) => STRINGS[l].appTitle)}`),
      h("h1", { id: "sheet-title", lang: "fr", tabindex: "-1" }, entry.title_fr),
      h("p", { class: "sheet-meta" }, meta.join(" — ")),
      entry.unesco
        ? h(
            "p",
            { class: "sheet-unesco-line" },
            h("span", { class: "unesco-tag" }, "UNESCO"),
            ` ${both((l) => STRINGS[l].unescoLine(STRINGS[l].unescoLists[entry.unesco!.list], entry.unesco!.year))}`,
          )
        : null,
    ),
    picture(entry.image, base),
    places.length
      ? h(
          "div",
          { class: "sheet-where" },
          h("h2", {}, both((l) => STRINGS[l].where)),
          h("p", {}, [...new Set(places.map((l) => l.label))].join(" · ")),
        )
      : null,
    when(item),
    summary ? [h("h2", {}, both((l) => STRINGS[l].sheetOverview)), columns(h("p", {}, summary.fr), h("p", {}, summary.en))] : null,
    sheet.context
      ? [h("h2", {}, both((l) => STRINGS[l].sheetContext)), columns(paragraphs(sheet.context.fr), paragraphs(sheet.context.en))]
      : null,
    sheet.unesco
      ? h(
          "section",
          { class: "sheet-unesco" },
          h("h2", {}, both((l) => STRINGS[l].sheetUnesco)),
          columns(paragraphs(sheet.unesco.fr), paragraphs(sheet.unesco.en)),
        )
      : null,
    h("h2", {}, both((l) => STRINGS[l].sheetQuestions)),
    columns(
      h("ol", {}, sheet.questions.fr.map((q) => h("li", {}, q))),
      h("ol", {}, sheet.questions.en.map((q) => h("li", {}, q))),
    ),
    h("h2", {}, both((l) => STRINGS[l].sheetVocabulary)),
    h(
      "table",
      { class: "sheet-vocab" },
      h("thead", {}, h("tr", {}, h("th", { scope: "col", lang: "fr" }, fr.sheetTerm), h("th", { scope: "col", lang: "en" }, en.sheetTerm))),
      h(
        "tbody",
        {},
        sheet.vocabulary.map((t) =>
          h(
            "tr",
            {},
            h("td", { lang: "fr" }, h("strong", {}, t.fr), " : ", t.def_fr),
            h("td", { lang: "en" }, h("strong", {}, t.en), ": ", t.def_en),
          ),
        ),
      ),
    ),
    sheet.activity
      ? h(
          "section",
          { class: "sheet-activity" },
          h("h2", {}, both((l) => STRINGS[l].sheetActivity)),
          h(
            "p",
            { class: "sheet-levels" },
            both((l) => sheet.activity!.levels.map((v) => STRINGS[l].levels[v]).join(", ")),
          ),
          columns(
            [h("h3", {}, sheet.activity.title_fr), h("p", {}, sheet.activity.fr)],
            [h("h3", {}, sheet.activity.title_en), h("p", {}, sheet.activity.en)],
          ),
        )
      : null,
    h(
      "footer",
      { class: "sheet-foot" },
      ficheUrl ? h("p", {}, `${both((l) => STRINGS[l].sheetSource)} : `, h("a", { href: ficheUrl }, ficheUrl)) : null,
      entry.unesco ? h("p", {}, "UNESCO : ", h("a", { href: entry.unesco.url }, entry.unesco.url)) : null,
      columns(h("p", {}, fr.sheetMadeBy), h("p", {}, en.sheetMadeBy)),
      kind === "event" && element ? columns(h("p", {}, fr.disclaimer), h("p", {}, en.disclaimer)) : null,
    ),
  );
}
