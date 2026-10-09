// Printable bilingual mediation sheet (M6): French and English side by side on one A4 page.
import { h, type Child } from "./dom";
import { STRINGS, THEME_LABELS, describeRule, formatDay } from "./i18n";
import type { Item } from "./model";
import type { Lang } from "./state";
import type { Element, MediationSheet, Picture } from "./types";

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

function when(element: Element, item: Item): HTMLElement | null {
  if (element.kind !== "event" || !element.recurrence) return null;
  const rule = (lang: Lang) => describeRule(element.recurrence!, lang);
  const line = (lang: Lang) => [
    h("p", {}, rule(lang)),
    item.next ? h("p", {}, `${STRINGS[lang].sheetNext} ${formatDay(item.next.start, lang)}`) : null,
  ];
  return h("div", { class: "sheet-when" }, h("h2", {}, both((l) => STRINGS[l].when)), columns(line("fr"), line("en")));
}

export function renderSheet(
  item: Item,
  sheet: MediationSheet,
  ui: Lang,
  base: string,
  onBack: () => void,
): HTMLElement {
  const element = item.element!;
  const { fr, en } = STRINGS;
  const s = STRINGS[ui];
  const draft = sheet.review_status !== "reviewed" || sheet.lang_review !== "reviewed";
  const kind = (l: Lang) => (element.kind === "event" ? STRINGS[l].event : STRINGS[l].practice);
  return h(
    "article",
    { class: "sheet", "aria-labelledby": "sheet-title" },
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
      h("h1", { id: "sheet-title", lang: "fr", tabindex: "-1" }, element.title_fr),
      h(
        "p",
        { class: "sheet-meta" },
        `${both(kind)} — ${THEME_LABELS.fr[element.theme]} · ${THEME_LABELS.en[element.theme]} — ${both((l) => STRINGS[l].yearIncluded)} ${element.year_included}`,
      ),
    ),
    draft ? h("p", { class: "sheet-draft" }, both((l) => STRINGS[l].sheetDraft)) : null,
    picture(item.entry.image, base),
    h(
      "div",
      { class: "sheet-where" },
      h("h2", {}, both((l) => STRINGS[l].where)),
      h("p", {}, element.locations.map((l) => l.label).join(" · ")),
    ),
    when(element, item),
    h("h2", {}, both((l) => STRINGS[l].sheetOverview)),
    columns(h("p", {}, element.summary.fr), h("p", {}, element.summary.en)),
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
    h(
      "footer",
      { class: "sheet-foot" },
      h("p", {}, `${both((l) => STRINGS[l].sheetSource)} : `, h("a", { href: element.source.fiche_url }, element.source.fiche_url)),
      columns(h("p", {}, fr.sheetMadeBy), h("p", {}, en.sheetMadeBy)),
      element.kind === "event" ? columns(h("p", {}, fr.disclaimer), h("p", {}, en.disclaimer)) : null,
    ),
  );
}
