// In-depth research file (UNESCO element or thematic dossier), printable. The files are
// written in French, so their inner labels always come from the French strings; only the
// tools (back, print, language) follow the interface language.
import { h } from "./dom";
import { STRINGS } from "./i18n";
import type { Lang } from "./state";
import type { Dossier, DossierElement, DossierIndex, DossierSection, DossierTheme, InterlocutorKind } from "./types";

const fr = STRINGS.fr;

/** "20 octobre 2026" / "20 October 2026" (no weekday; ISO dates read as UTC). */
export function longDate(iso: string, lang: Lang): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** HTML produced and escaped by the pipeline (pci.markdown), with a few whitelisted tags. */
function rich(tag: string, html: string, attrs: Record<string, string> = {}): HTMLElement {
  const el = h(tag, attrs);
  el.innerHTML = html;
  return el;
}

// Fixed numbering of the protocol (recherche/PROTOCOLE.md): body sections around the
// generated ones (1, 2, 11 and 14).
const NUMBERS: Record<string, number> = {
  "Description approfondie": 3,
  "Histoire et contexte": 4,
  "Parcours d'inscription": 5,
  "Sauvegarde et viabilité": 6,
  "Enjeux et débats actuels": 7,
  "Chiffres clés": 8,
  "Qui est qui": 9,
  "Lien avec le rapport périodique": 10,
  Comparaisons: 12,
  Ressources: 13,
};

interface Part {
  id: string;
  title: string;
  body: HTMLElement | HTMLElement[];
  open: boolean;
}

function part(p: Part): HTMLElement {
  return h(
    "details",
    { class: "dossier-part", id: p.id, open: p.open },
    h("summary", {}, h("h2", {}, p.title)),
    h("div", { class: "part-body" }, p.body),
  );
}

function field(label: string, value: Node | Node[] | string | null): HTMLElement[] {
  return [h("dt", {}, label), h("dd", {}, value ?? fr.dossierNone)];
}

function list(items: string[], cls = ""): HTMLElement | string {
  return items.length ? h("ul", { class: cls }, items.map((i) => rich("li", i))) : fr.dossierNone;
}

function identity(d: DossierElement, base: string): HTMLElement {
  const f = fr.dossierFields;
  const listLine = d.status === "nominated"
    ? fr.dossierNominated(d.year)
    : `${fr.unescoLists[d.list]}, ${d.year}`;
  return h(
    "dl",
    { class: "identity" },
    field(f.titleFr, d.title_fr),
    field(f.titleEn, h("span", { lang: "en" }, d.title_en)),
    field(f.list, listLine),
    field(f.decision, rich("span", d.identity.decision)),
    field(f.file, rich("span", d.identity.unesco_file)),
    field(f.states, d.identity.states.map((s, i) => [i ? ", " : "", rich("span", s)]).flat().filter(Boolean) as Node[]),
    field(f.extensions, list(d.identity.extensions) as HTMLElement),
    field(f.domains, d.identity.domains.map((x) => fr.dossierDomains[x]).join(" ; ")),
    field(f.territories, rich("span", d.identity.territories)),
    field(f.communities, rich("span", d.identity.communities)),
    field(f.bodies, list(d.identity.bodies) as HTMLElement),
    field(
      f.inventory,
      d.inventory.length
        ? h(
            "ul",
            {},
            d.inventory.map((i) =>
              h(
                "li",
                {},
                i.fiche_url ? h("a", { href: i.fiche_url, target: "_blank", rel: "noopener" }, i.title) : i.title,
                i.year_included ? ` (${fr.dossierIncluded(i.year_included)})` : "",
                " · ",
                h("a", { href: `${base}?id=${i.id}&lang=fr` }, fr.dossierOnMap),
              ),
            ),
          )
        : null,
    ),
    d.unesco_url ? field(f.page, h("a", { href: d.unesco_url, target: "_blank", rel: "noopener" }, d.unesco_url.replace(/^https:\/\//, ""))) : [],
  );
}

function conversation(d: DossierElement): HTMLElement[] {
  const c = d.conversation;
  const kinds: InterlocutorKind[] = ["association", "local_authority", "researcher", "institution"];
  return [
    h("h3", {}, fr.dossierVocabulary),
    h("dl", { class: "vocab" }, c.vocabulary.map((v) => [rich("dt", v.term), rich("dd", v.note)]).flat()),
    h("h3", {}, fr.dossierMistakes),
    list(c.mistakes) as HTMLElement,
    c.sensitive.length ? [h("h3", {}, fr.dossierSensitive), list(c.sensitive) as HTMLElement] : [],
    h("h3", {}, fr.dossierQuestions),
    h(
      "div",
      { class: "question-groups" },
      kinds.map((k) => h("section", {}, h("h4", {}, fr.dossierInterlocutors[k]), h("ol", {}, c.questions[k].map((q) => rich("li", q))))),
    ),
  ].flat() as HTMLElement[];
}

function sourcesPart(d: Dossier): HTMLElement[] {
  return [
    h("p", { class: "reliability" }, fr.dossierReliability(longDate(d.last_checked, "fr"), d.to_verify)),
    h(
      "ol",
      { class: "sources" },
      d.sources.map((src) =>
        h(
          "li",
          { id: `src-${src.id}` },
          h("span", { class: "src-id" }, src.id),
          h("span", { class: `src-kind kind-${src.kind}` }, fr.dossierSourceKinds[src.kind]),
          " ",
          h("a", { href: src.url, target: "_blank", rel: "noopener" }, src.title),
          `, ${src.publisher}, ${fr.dossierConsulted(longDate(src.consulted, "fr"))}.`,
        ),
      ),
    ),
  ];
}

function bodyPart(s: DossierSection, n: number | null): Part {
  return { id: `sec-${s.id}`, title: n ? `${n}. ${s.title}` : s.title, body: rich("div", s.html), open: false };
}

function elementParts(d: DossierElement, base: string): Part[] {
  const byNumber = d.sections.map((s) => ({ s, n: NUMBERS[s.title] ?? 99 }));
  const before = byNumber.filter((x) => x.n < 11).map((x) => bodyPart(x.s, x.n));
  const after = byNumber.filter((x) => x.n > 11).map((x) => bodyPart(x.s, x.n));
  return [
    { id: "sec-identite", title: `1. ${fr.dossierIdentity}`, body: identity(d, base), open: true },
    {
      id: "sec-30-secondes",
      title: `2. ${fr.dossierInBrief}`,
      body: [rich("p", d.summary_30s, { class: "in-brief" }), h("h3", {}, fr.dossierKeyFacts), list(d.key_facts, "key-facts") as HTMLElement],
      open: true,
    },
    ...before,
    { id: "sec-conversation", title: `11. ${fr.dossierConversation}`, body: conversation(d), open: true },
    ...after,
    { id: "sec-sources", title: `14. ${fr.dossierSources}`, body: sourcesPart(d), open: true },
  ];
}

function themeParts(d: DossierTheme, index: DossierIndex, base: string): Part[] {
  const titles = new Map(index.elements.map((e) => [e.key, e.title_fr]));
  const related = d.elements.filter((k) => titles.has(k));
  return [
    ...d.sections.map((s) => ({ ...bodyPart(s, null), open: true })),
    ...(related.length
      ? [{
          id: "sec-fiches",
          title: fr.dossierRelated,
          body: h("ul", {}, related.map((k) => h("li", {}, h("a", { href: `${base}?dossier=${k}&lang=fr` }, titles.get(k)!)))),
          open: true,
        }]
      : []),
    { id: "sec-sources", title: fr.dossierSources, body: sourcesPart(d), open: true },
  ];
}

/** Open the <details> holding `target`, then scroll to it without touching the URL. */
function reveal(target: HTMLElement | null) {
  if (!target) return;
  const holder = target.closest("details");
  if (holder) holder.open = true;
  target.scrollIntoView({ block: "start", behavior: "smooth" });
  target.classList.add("flash");
  setTimeout(() => target.classList.remove("flash"), 1600);
}

export function renderDossier(
  d: Dossier,
  index: DossierIndex,
  lang: Lang,
  base: string,
  onBack: () => void,
  onLang: () => void,
): HTMLElement {
  const s = STRINGS[lang];
  const parts = d.kind === "element" ? elementParts(d, base) : themeParts(d, index, base);
  const title = d.kind === "element" ? d.title_fr : d.title;
  const kicker =
    d.kind === "element"
      ? `${s.dossierKicker} · ${d.status === "nominated" ? fr.dossierNominated(d.year) : `UNESCO ${d.year}`}`
      : s.dossierThemeKicker(d.number);
  const article = h(
    "article",
    { class: "dossier", "aria-labelledby": "dossier-title" },
    h(
      "div",
      { class: "sheet-tools" },
      h("button", { type: "button", "data-key": "dossier-back", onclick: onBack }, `← ${s.sheetBack}`),
      h("button", { type: "button", "data-key": "dossier-lang", lang: s.switchToLang, onclick: onLang }, s.switchTo),
      h(
        "button",
        {
          type: "button",
          "data-key": "dossier-print",
          onclick: () => {
            article.querySelectorAll("details").forEach((x) => (x.open = true));
            window.print();
          },
        },
        s.print,
      ),
    ),
    h(
      "header",
      { class: "dossier-head" },
      h("p", { class: "sheet-kicker" }, kicker),
      h("h1", { id: "dossier-title", tabindex: "-1", lang: "fr" }, title),
      s.dossierFrenchOnly ? h("p", { class: "lang-note" }, s.dossierFrenchOnly) : null,
      h("p", { class: "dossier-meta" }, s.dossierChecked(longDate(d.last_checked, lang), d.to_verify, d.source_count, d.words)),
    ),
    h(
      "div",
      { class: "dossier-layout" },
      h(
        "nav",
        { class: "dossier-toc", "aria-label": s.dossierToc },
        h("p", { class: "toc-title" }, s.dossierToc),
        h("ul", { lang: "fr" }, parts.map((p) => h("li", {}, h("a", { href: `#${p.id}` }, p.title)))),
      ),
      h("div", { class: "dossier-main", lang: "fr" }, parts.map(part)),
    ),
  );
  // Source markers and the contents jump inside the page; the URL keeps the app state.
  article.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement).closest("a");
    const href = a?.getAttribute("href");
    if (!a || !href?.startsWith("#")) return;
    e.preventDefault();
    reveal(article.querySelector<HTMLElement>(`[id="${CSS.escape(href.slice(1))}"]`));
  });
  return article;
}
