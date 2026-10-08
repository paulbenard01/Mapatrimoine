import "./style.css";
import { STRINGS, THEME_LABELS, badgeText, describeRule, formatDay, formatKm, monthNames } from "./i18n";
import { AREAS, createMap, type MapEntry, type MapView } from "./map";
import {
  SORTS,
  annotate,
  applyFilters,
  mergeEntries,
  monthCounts,
  monthOf,
  placesOf,
  sortItems,
  themeCounts,
  type Entry,
  type Item,
  type Position,
  type Sort,
} from "./model";
import { RADII, parseState, resolveToday, serializeState, type State } from "./state";
import { THEME_COLORS } from "./theme-colors";
import { THEMES, type Element, type InventoryEntry, type Location, type Picture, type Theme } from "./types";

// ---------- tiny DOM helper ----------
type Attrs = Record<string, string | number | boolean | null | undefined | ((e: Event) => void)>;
type Child = Node | string | null | undefined | false;

function h(tag: string, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

const SVG_NS = "http://www.w3.org/2000/svg";
function svg(markup: string, cls: string): SVGElement {
  const el = document.createElementNS(SVG_NS, "svg");
  el.setAttribute("viewBox", "0 0 20 20");
  el.setAttribute("class", cls);
  el.setAttribute("aria-hidden", "true");
  el.setAttribute("focusable", "false");
  el.innerHTML = markup;
  return el;
}

type Shape = "event" | "practice" | "undocumented";

/** Circle = event, diamond = practice, ring = not documented on this site yet. */
function shapeIcon(shape: Shape, theme: Theme): SVGElement {
  const fill = THEME_COLORS[theme];
  const markup =
    shape === "event"
      ? `<circle cx="10" cy="10" r="7" fill="${fill}" stroke="#1b1b1f" stroke-width="2"/>`
      : shape === "practice"
        ? `<path d="M10 2.5 17.5 10 10 17.5 2.5 10Z" fill="${fill}" stroke="#1b1b1f" stroke-width="2"/>`
        : `<circle cx="10" cy="10" r="5" fill="none" stroke="${fill}" stroke-width="3"/>`;
  return svg(markup, "kind-icon");
}

const shapeOf = (element: Element | null): Shape => element?.kind ?? "undocumented";

const movableIcon = () =>
  svg(
    '<path d="M10 3a7 7 0 1 0 7 7h-2.2A4.8 4.8 0 1 1 10 5.2V8l4-3.6L10 1z" fill="currentColor"/>',
    "movable-icon",
  );

// ---------- state ----------
const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
let state: State = parseState(location.search, languages);
const today = resolveToday(location.search, new Date());
const todayOverride = new URLSearchParams(location.search).get("today");
let position: Position | null = null; // memory only; never stored or sent
let geoStatus: "idle" | "locating" | "denied" = "idle";
let moreOpen = false;
let entries: Entry[] = [];
let mapView: MapView | null = null;
let mapFailed = false;

const app = document.querySelector<HTMLDivElement>("#app")!;

function setState(patch: Partial<State>, opts: { fly?: boolean } = {}) {
  const prevZone = state.zone;
  state = { ...state, ...patch };
  if (!SORTS[state.view].includes(state.sort)) state.sort = SORTS[state.view][0];
  if (state.view !== "agenda") state.month = null;
  history.replaceState(null, "", serializeState(state, todayOverride ? { today: todayOverride } : {}));
  render();
  if (patch.zone && patch.zone !== prevZone && mapView) {
    mapView.fit(AREAS[patch.zone === "overseas" ? (presentAreas()[0] ?? "guadeloupe") : "metro"]);
  }
  if ("selected" in patch) mapView?.select(state.selected, opts.fly ?? false);
}

const OVERSEAS: Record<string, { prefix: string; name: string }> = {
  guadeloupe: { prefix: "971", name: "Guadeloupe" },
  martinique: { prefix: "972", name: "Martinique" },
  guyane: { prefix: "973", name: "Guyane" },
  reunion: { prefix: "974", name: "La Réunion" },
  mayotte: { prefix: "976", name: "Mayotte" },
};

/** Overseas territories that have at least one mapped element. */
function presentAreas(): string[] {
  return Object.keys(OVERSEAS).filter((a) =>
    entries.some((e) =>
      placesOf(e).some((l) => l.insee?.startsWith(OVERSEAS[a].prefix) || l.label === OVERSEAS[a].name),
    ),
  );
}

function mapEntry(item: Item): MapEntry {
  const { entry, element } = item;
  return {
    id: entry.id,
    title: entry.title_fr,
    icon: `${element?.kind ?? "located"}-${entry.themes[0]}`,
    theme: entry.themes[0],
    locations: placesOf(entry),
  };
}

// ---------- geolocation ----------
function locate() {
  if (!("geolocation" in navigator)) {
    geoStatus = "denied";
    render();
    return;
  }
  geoStatus = "locating";
  render();
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      position = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      geoStatus = "idle";
      setState({ sort: "distance", radiusKm: state.radiusKm ?? 100 });
    },
    () => {
      geoStatus = "denied";
      render();
    },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
  );
}

function forgetPosition() {
  position = null;
  setState({ radiusKm: null, sort: SORTS[state.view][0] });
}

// ---------- rendering ----------
function pressed(key: string, on: boolean, label: Child | Child[], onClick: () => void) {
  return h("button", { type: "button", "data-key": key, "aria-pressed": String(on), onclick: onClick }, label);
}

function themeChips(items: Item[], withCounts: boolean): HTMLElement {
  const s = STRINGS[state.lang];
  const counts = themeCounts(items, state, position);
  const toggle = (t: Theme) =>
    setState({ themes: state.themes.includes(t) ? state.themes.filter((x) => x !== t) : [...state.themes, t] });
  return h(
    "fieldset",
    { class: "group" },
    h("legend", {}, s.themes),
    h(
      "div",
      { class: "chips" },
      pressed("theme-all", state.themes.length === 0, s.allThemes, () => setState({ themes: [] })),
      THEMES.filter((t) => entries.some((e) => e.themes.includes(t))).map((t) =>
        pressed(
          `theme-${t}`,
          state.themes.includes(t),
          [
            h("span", { class: "swatch", style: `background:${THEME_COLORS[t]}` }),
            THEME_LABELS[state.lang][t],
            withCounts ? h("span", { class: "chip-count" }, String(counts.get(t) ?? 0)) : null,
          ],
          () => toggle(t),
        ),
      ),
    ),
  );
}

function monthStrip(items: Item[]): HTMLElement {
  const s = STRINGS[state.lang];
  const counts = monthCounts(items, state, position);
  const max = Math.max(1, ...counts);
  const months = monthNames(state.lang, "short");
  const longMonths = monthNames(state.lang, "long");
  const currentMonth = monthOf(today);
  return h(
    "fieldset",
    { class: "group months" },
    h("legend", {}, s.months),
    h("p", { class: "hint", id: "month-hint" }, s.monthStripLabel),
    h(
      "div",
      { class: "month-strip", "aria-describedby": "month-hint" },
      counts.map((n, i) =>
        h(
          "button",
          {
            type: "button",
            "data-key": `month-${i + 1}`,
            "aria-pressed": String(state.month === i + 1),
            "aria-label": s.monthAria(longMonths[i], n),
            class: i + 1 === currentMonth ? "current" : null,
            onclick: () => setState({ month: state.month === i + 1 ? null : i + 1 }),
          },
          h("span", { class: "bar", style: `height:${Math.round((n / max) * 100)}%` }),
          h("span", { class: "m-count" }, String(n)),
          h("span", { class: "name" }, months[i].replace(".", "")),
        ),
      ),
    ),
    h(
      "div",
      { class: "chips" },
      pressed("this-month", state.month === currentMonth, s.thisMonth, () =>
        setState({ month: state.month === currentMonth ? null : currentMonth }),
      ),
      pressed("all-months", state.month === null, s.allMonths, () => setState({ month: null })),
    ),
  );
}

function moreFilters(items: Item[]): HTMLElement {
  const s = STRINGS[state.lang];
  const sortLabels: Record<Sort, string> = {
    name: s.sortName,
    year: s.sortYear,
    date: s.sortDate,
    distance: s.sortDistance,
  };
  const active =
    (state.zone !== "all" ? 1 : 0) +
    (state.radiusKm !== null && position ? 1 : 0) +
    (state.view === "agenda" ? state.themes.length : 0);
  return h(
    "div",
    { class: "more" },
    h(
      "button",
      {
        type: "button",
        class: "more-toggle",
        "data-key": "more-toggle",
        "aria-expanded": String(moreOpen),
        "aria-controls": "more-body",
        onclick: () => {
          moreOpen = !moreOpen;
          render();
        },
      },
      `${moreOpen ? "▾" : "▸"} ${s.moreFilters}${active ? ` (${active})` : ""}`,
    ),
    h(
      "div",
      { id: "more-body", class: "more-body", hidden: !moreOpen },
      state.view === "agenda" ? themeChips(items, false) : null,
      h(
        "fieldset",
        { class: "group" },
        h("legend", {}, s.zone),
        h(
          "div",
          { class: "chips" },
          pressed("zone-all", state.zone === "all", s.zoneAll, () => setState({ zone: "all" })),
          pressed("zone-metro", state.zone === "metro", s.zoneMetro, () => setState({ zone: "metro" })),
          pressed("zone-overseas", state.zone === "overseas", s.zoneOverseas, () => setState({ zone: "overseas" })),
        ),
        state.zone === "overseas" && !mapFailed
          ? h(
              "div",
              { class: "chips territories", role: "group", "aria-label": s.territory },
              presentAreas().map((a) =>
                h("button", { type: "button", "data-key": `area-${a}`, onclick: () => mapView?.fit(AREAS[a]) }, OVERSEAS[a].name),
              ),
            )
          : null,
      ),
      h(
        "fieldset",
        { class: "group" },
        h("legend", {}, s.nearMe),
        h(
          "div",
          { class: "chips" },
          position
            ? h("button", { type: "button", "data-key": "forget", onclick: forgetPosition }, s.forgetLocation)
            : h(
                "button",
                { type: "button", "data-key": "locate", onclick: locate, disabled: geoStatus === "locating" },
                geoStatus === "locating" ? s.locating : s.nearMe,
              ),
          position
            ? h(
                "label",
                { class: "inline" },
                `${s.radius} `,
                h(
                  "select",
                  {
                    "data-key": "radius",
                    onchange: (e: Event) => {
                      const v = (e.target as HTMLSelectElement).value;
                      setState({ radiusKm: v ? Number(v) : null });
                    },
                  },
                  h("option", { value: "", selected: state.radiusKm === null }, s.anyDistance),
                  RADII.map((r) => h("option", { value: r, selected: state.radiusKm === r }, `${r} km`)),
                ),
              )
            : null,
        ),
        h("p", { class: "hint" }, geoStatus === "denied" ? s.locationDenied : s.nearMeHint),
        state.view === "inventory" ? h("p", { class: "hint" }, s.mappedOnlyHint) : null,
      ),
      h(
        "div",
        { class: "group sort" },
        h(
          "label",
          { class: "inline" },
          `${s.sort} `,
          h(
            "select",
            {
              "data-key": "sort",
              onchange: (e: Event) => setState({ sort: (e.target as HTMLSelectElement).value as Sort }),
            },
            SORTS[state.view].map((v) =>
              h("option", { value: v, selected: state.sort === v, disabled: v === "distance" && !position }, sortLabels[v]),
            ),
          ),
        ),
        h(
          "button",
          {
            type: "button",
            class: "link",
            "data-key": "reset",
            onclick: () =>
              setState({ q: "", themes: [], month: null, zone: "all", radiusKm: null, sort: SORTS[state.view][0] }),
          },
          s.resetFilters,
        ),
      ),
    ),
  );
}

function renderControls(items: Item[]): HTMLElement {
  const s = STRINGS[state.lang];
  const documented = entries.filter((e) => e.element).length;
  const located = entries.filter((e) => placesOf(e).length).length;
  const events = entries.filter((e) => e.element?.kind === "event").length;
  return h(
    "section",
    { class: "controls", "aria-label": s.filters },
    h(
      "div",
      { class: "views", role: "group", "aria-label": s.viewLabel },
      pressed(
        "view-inventory",
        state.view === "inventory",
        [s.viewInventory, h("span", { class: "chip-count" }, String(entries.length))],
        () => setState({ view: "inventory" }),
      ),
      pressed(
        "view-agenda",
        state.view === "agenda",
        [s.viewAgenda, h("span", { class: "chip-count" }, String(events))],
        () => setState({ view: "agenda" }),
      ),
    ),
    h("p", { class: "intro" }, state.view === "inventory" ? s.coverage(entries.length, located, documented) : s.agendaIntro(events)),
    state.view === "inventory"
      ? [
          h(
            "div",
            { class: "search" },
            h("label", { for: "search" }, s.search),
            h("input", {
              id: "search",
              type: "search",
              "data-key": "search",
              value: state.q,
              placeholder: s.searchPlaceholder,
              autocomplete: "off",
              oninput: (e: Event) => setState({ q: (e.target as HTMLInputElement).value }),
            }),
          ),
          themeChips(items, true),
        ]
      : monthStrip(items),
    moreFilters(items),
  );
}

function legend(): HTMLElement {
  const s = STRINGS[state.lang];
  return h(
    "p",
    { class: "legend" },
    h("span", { class: "sr-only" }, `${s.legend} : `),
    h("span", {}, shapeIcon("event", "rituals"), s.event),
    h("span", {}, shapeIcon("practice", "rituals"), s.practice),
    state.view === "inventory" ? h("span", {}, shapeIcon("undocumented", "rituals"), s.notDocumentedShort) : null,
    state.view === "agenda" ? h("span", {}, movableIcon(), s.movableShort) : null,
  );
}

function badge(item: Item): HTMLElement | null {
  const s = STRINGS[state.lang];
  const { element, next } = item;
  if (!element) return null;
  if (element.kind === "practice") return h("span", { class: "badge practice" }, s.practiceNoDate);
  if (!next) return h("span", { class: "badge undated" }, s.undated);
  return h(
    "span",
    { class: `badge${item.ongoing ? " ongoing" : ""}` },
    item.movable ? [movableIcon(), h("span", { class: "sr-only" }, `${s.movableFeast}. `)] : null,
    badgeText(next, item.daysUntil ?? 0, item.ongoing, state.lang),
  );
}

function renderList(items: Item[]): HTMLElement {
  const s = STRINGS[state.lang];
  if (!items.length) return h("p", { class: "empty" }, s.noResults);
  return h(
    "ol",
    { class: "results" },
    items.map((item) => {
      const { entry, element } = item;
      const theme = entry.themes[0];
      const meta = [
        THEME_LABELS[state.lang][theme],
        placesOf(entry).length ? placeNames(placesOf(entry)) : String(entry.year_included),
        item.distanceKm !== null ? s.distanceAway(formatKm(item.distanceKm, state.lang)) : "",
      ].filter(Boolean);
      return h(
        "li",
        {},
        h(
          "button",
          {
            type: "button",
            class: `result${element ? "" : " plain"}${state.selected === entry.id ? " selected" : ""}`,
            "data-key": `item-${entry.id}`,
            "aria-current": state.selected === entry.id ? "true" : null,
            onclick: () => setState({ selected: entry.id }, { fly: true }),
          },
          shapeIcon(shapeOf(element), theme),
          h(
            "span",
            { class: "result-body" },
            h("span", { class: "result-title", lang: "fr" }, entry.title_fr),
            h("span", { class: "result-meta" }, meta.join(" · ")),
            // Next dates belong to the agenda; the inventory view stays a catalogue.
            state.view === "agenda" ? badge(item) : null,
          ),
        ),
      );
    }),
  );
}

function backButton(): HTMLElement {
  const s = STRINGS[state.lang];
  return h(
    "button",
    {
      type: "button",
      class: "back",
      "data-key": "back",
      onclick: () => {
        const id = state.selected;
        setState({ selected: null });
        document.querySelector<HTMLElement>(`[data-key="item-${id}"]`)?.focus();
      },
    },
    `← ${s.back}`,
  );
}

function themeLine(entry: InventoryEntry, element: Element | null): HTMLElement {
  const s = STRINGS[state.lang];
  const [first, ...others] = entry.themes;
  const kind = element ? (element.kind === "event" ? s.event : s.practice) : null;
  return h(
    "p",
    { class: "detail-kind" },
    shapeIcon(shapeOf(element), first),
    [kind, THEME_LABELS[state.lang][first]].filter(Boolean).join(" · "),
    others.length ? ` (${s.alsoIn} ${others.map((t) => THEME_LABELS[state.lang][t]).join(", ")})` : "",
  );
}

/** "Tende, Briançon and 3 more" style list for result rows. */
function placeNames(places: Location[]): string {
  const names = [...new Set(places.map((l) => l.label))];
  return names.length > 3 ? `${names.slice(0, 3).join(", ")} ${STRINGS[state.lang].andMore(names.length - 3)}` : names.join(", ");
}

function figure(picture: Picture | null): HTMLElement | null {
  if (!picture) return null;
  const s = STRINGS[state.lang];
  return h(
    "figure",
    { class: "picture" },
    h("img", {
      src: picture.src,
      alt: picture.alt,
      loading: "lazy",
      decoding: "async",
      referrerpolicy: "no-referrer",
      // A broken image link must not leave an empty frame.
      onerror: (e: Event) => (e.target as HTMLElement).closest("figure")?.remove(),
    }),
    picture.source === "commons"
      ? h(
          "figcaption",
          {},
          s.photoBy,
          h("a", { href: picture.page, target: "_blank", rel: "noopener" }, picture.credit),
          picture.licence
            ? [
                " (",
                picture.licence_url
                  ? h("a", { href: picture.licence_url, target: "_blank", rel: "noopener" }, picture.licence)
                  : picture.licence,
                ")",
              ]
            : null,
          ", Wikimedia Commons",
        )
      : h(
          "figcaption",
          {},
          `${s.ficheImageVia} `,
          h("a", { href: picture.page, target: "_blank", rel: "noopener" }, "PCI Lab"),
        ),
  );
}

function placesFact(places: Location[]): Child[] {
  const s = STRINGS[state.lang];
  if (!places.length) return [h("dt", {}, s.where), h("dd", {}, s.noPlace)];
  return [
    h("dt", {}, s.where),
    h(
      "dd",
      {},
      places.map((l) => h("span", { class: "place" }, `${l.label} (${s.precision[l.precision]})`)),
    ),
  ];
}

function renderDetail(item: Item): HTMLElement {
  const s = STRINGS[state.lang];
  const { entry, element, next } = item;
  const ficheLink = entry.fiche_url
    ? h("p", {}, h("a", { href: entry.fiche_url, target: "_blank", rel: "noopener", class: "fiche" }, s.officialFiche))
    : h("p", { class: "note" }, s.noFiche);

  if (!element) {
    const sources = entry.location_sources;
    return h(
      "article",
      { class: "detail", "aria-labelledby": "detail-title" },
      backButton(),
      h("h2", { id: "detail-title", lang: "fr", tabindex: "-1" }, entry.title_fr),
      themeLine(entry, null),
      figure(entry.image),
      h(
        "dl",
        { class: "facts" },
        placesFact(entry.locations),
        h("dt", {}, s.yearIncluded),
        h("dd", {}, String(entry.year_included)),
      ),
      sources.length
        ? h(
            "p",
            { class: "note" },
            s.placesFrom,
            " ",
            sources.flatMap((src, i) => [
              i ? ", " : "",
              h("a", { href: src.url, target: "_blank", rel: "noopener" }, src.publisher),
            ]),
            sources[0].kind === "pcilab" ? ` ${s.placesFromPcilab}` : ".",
          )
        : null,
      h("p", { class: "note" }, s.notDocumented),
      ficheLink,
    );
  }

  const t = element.timing;
  const summary = state.lang === "fr" ? element.summary.fr : element.summary.en;
  const draft = state.lang === "en" && element.summary.lang_review === "draft";
  const pageUrl = t?.evidence_page ? `${element.source.fiche_url}#page=${t.evidence_page}` : element.source.fiche_url;

  return h(
    "article",
    { class: "detail", "aria-labelledby": "detail-title" },
    backButton(),
    h("h2", { id: "detail-title", lang: "fr", tabindex: "-1" }, entry.title_fr),
    themeLine(entry, element),
    figure(entry.image),
    h("p", { class: "summary", lang: state.lang }, summary),
    draft ? h("p", { class: "note" }, s.summaryDraft) : null,
    element.source.fiche_read ? null : h("p", { class: "flag" }, s.ficheNotRead),
    h(
      "dl",
      { class: "facts" },
      placesFact(element.locations),
      h("dt", {}, s.yearIncluded),
      h("dd", {}, String(element.year_included)),
      h("dt", {}, s.domain),
      h("dd", { lang: "fr" }, element.domain),
    ),
    element.kind === "event"
      ? h(
          "section",
          { class: "when", "aria-labelledby": "when-title" },
          h("h3", { id: "when-title" }, s.when),
          h("p", {}, badge(item)),
          element.recurrence ? h("p", {}, describeRule(element.recurrence, state.lang)) : null,
          next && item.movable ? h("p", { class: "note" }, movableIcon(), ` ${s.movableFeast}`) : null,
          t
            ? h(
                "div",
                { class: "evidence" },
                h("h4", {}, s.evidence),
                t.evidence_quote && t.evidence_page
                  ? h(
                      "figure",
                      {},
                      h("blockquote", { lang: "fr", cite: pageUrl }, `« ${t.evidence_quote} »`),
                      h(
                        "figcaption",
                        {},
                        h("a", { href: pageUrl, target: "_blank", rel: "noopener" }, s.page(t.evidence_page)),
                      ),
                    )
                  : null,
                t.web_sources?.length
                  ? h(
                      "div",
                      { class: "web-sources" },
                      h("p", { class: "web-title" }, s.webSources),
                      h(
                        "ul",
                        {},
                        t.web_sources.map((w) =>
                          h(
                            "li",
                            {},
                            h("a", { href: w.url, target: "_blank", rel: "noopener" }, w.publisher),
                            " : ",
                            h("span", { lang: "en" }, w.says),
                            ` (${s.checkedOn(formatDay(w.checked_at, state.lang))})`,
                          ),
                        ),
                      ),
                    )
                  : null,
                t.notes ? h("p", { class: "notes", lang: "en" }, t.notes) : null,
                h("p", {}, s.confidenceLine(s.confidenceLevels[t.confidence])),
                element.review_status === "unreviewed" ? h("p", { class: "flag" }, s.unreviewed) : null,
                h("p", { class: "disclaimer" }, s.disclaimer),
              )
            : null,
        )
      : h("p", { class: "badge practice" }, s.practiceNoDate),
    ficheLink,
  );
}

// A selection restored from the URL must not steal focus on page load.
let lastSelected: string | null = state.selected;

function render() {
  const s = STRINGS[state.lang];
  document.documentElement.lang = state.lang;
  document.title = `${s.appTitle} · ${s.appSubtitle}`;

  const active = document.activeElement as HTMLElement | null;
  const focusKey = active?.dataset?.key;
  const caret = active instanceof HTMLInputElement ? [active.selectionStart, active.selectionEnd] : null;
  const listScroll = document.querySelector(".panel")?.scrollTop ?? 0;

  const all = annotate(entries, today, position);
  const visible = sortItems(applyFilters(all, state, position), state.sort);
  const selectedItem = state.selected ? all.find((i) => i.entry.id === state.selected) : undefined;
  if (state.selected && !selectedItem && entries.length) state.selected = null;
  const mapped = visible.filter((i) => placesOf(i.entry).length).map(mapEntry);

  mapView?.setEntries(mapped);

  const header = h(
    "header",
    { class: "top" },
    h("a", { class: "skip", href: "#results" }, s.skipToList),
    h("div", { class: "brand" }, h("h1", {}, s.appTitle), h("p", {}, s.appSubtitle)),
    h(
      "div",
      { class: "top-actions" },
      h(
        "button",
        {
          type: "button",
          "data-key": "lang",
          lang: s.switchToLang,
          "aria-label": `${s.language} : ${s.switchTo}`,
          onclick: () => setState({ lang: state.lang === "fr" ? "en" : "fr" }),
        },
        s.switchTo,
      ),
      h(
        "details",
        { class: "about" },
        h("summary", { "data-key": "about" }, s.about),
        h("div", { class: "about-panel" }, h("p", {}, s.aboutText), h("p", {}, s.pilotNote), h("p", {}, s.disclaimer)),
      ),
    ),
  );

  const paneSwitch = h(
    "div",
    { class: "pane-switch", role: "group", "aria-label": `${s.showList} / ${s.showMap}` },
    pressed("pane-list", state.pane === "list", s.showList, () => setState({ pane: "list" })),
    pressed("pane-map", state.pane === "map", s.showMap, () => {
      setState({ pane: "map" });
      // The map was hidden (zero size) on narrow screens: resize, then frame the area again.
      requestAnimationFrame(() => {
        mapView?.resize();
        mapView?.fit(AREAS[state.zone === "overseas" ? (presentAreas()[0] ?? "guadeloupe") : "metro"]);
      });
    }),
  );

  const results = h(
    "div",
    { class: "results-area", id: "results", tabindex: "-1" },
    state.sort === "distance" && !position ? h("p", { class: "hint" }, s.sortDistanceNeedsLocation) : null,
    selectedItem ? renderDetail(selectedItem) : [legend(), renderList(visible)],
  );

  const controls = renderControls(all);
  const shell = app.querySelector(".shell");
  if (!shell) {
    const mapBox = h("div", { class: "map", id: "map" });
    app.replaceChildren(
      header,
      h(
        "main",
        { class: `shell pane-${state.pane}` },
        h(
          "div",
          { class: "panel" },
          paneSwitch,
          controls,
          // One persistent live region, updated in place, so screen readers announce changes.
          h("p", { class: "count", role: "status", "aria-live": "polite" }),
          results,
        ),
        mapBox,
      ),
    );
    mapView = createMap(mapBox, s.mapLabel, (id) => setState({ selected: id, pane: "list" }), () => {
      mapFailed = true;
      mapBox.replaceChildren(h("p", { class: "map-error" }, STRINGS[state.lang].mapUnavailable));
      render();
    });
    mapView?.setEntries(mapped);
  } else {
    app.querySelector("header.top")!.replaceWith(header);
    shell.className = `shell pane-${state.pane}`;
    shell.querySelector(".controls")!.replaceWith(controls);
    shell.querySelector(".pane-switch")!.replaceWith(paneSwitch);
    shell.querySelector(".results-area")!.replaceWith(results);
    if (mapFailed) shell.querySelector(".map")!.replaceChildren(h("p", { class: "map-error" }, s.mapUnavailable));
  }
  const panel = app.querySelector<HTMLElement>(".panel")!;
  const count = panel.querySelector<HTMLElement>("p.count")!;
  const countText = s.resultsCount(visible.length, mapped.length);
  if (count.textContent !== countText) count.textContent = countText;

  // Keep keyboard focus, caret and scroll where they were.
  if (state.selected !== lastSelected && state.selected) {
    // Bring the detail into view inside the scrolling panel (desktop) or the page (mobile).
    if (panel.scrollHeight > panel.clientHeight) panel.scrollTop = results.offsetTop - panel.offsetTop;
    else window.scrollTo({ top: results.getBoundingClientRect().top + window.scrollY });
    document.getElementById("detail-title")?.focus({ preventScroll: true });
  } else {
    panel.scrollTop = listScroll;
    if (focusKey) {
      const target = document.querySelector<HTMLElement>(`[data-key="${focusKey}"]`);
      target?.focus({ preventScroll: true });
      if (caret && target instanceof HTMLInputElement) target.setSelectionRange(caret[0], caret[1]);
    }
  }
  lastSelected = state.selected;
}

async function init() {
  const base = import.meta.env.BASE_URL;
  const [inventory, curated] = await Promise.all([
    fetch(`${base}data/inventory.json`).then((r) => r.json() as Promise<{ elements: InventoryEntry[] }>),
    fetch(`${base}data/elements.json`).then((r) => r.json() as Promise<{ elements: Element[] }>),
  ]);
  entries = mergeEntries(inventory.elements, curated.elements);
  render();
  if (state.zone === "overseas") mapView?.fit(AREAS[presentAreas()[0] ?? "guadeloupe"]);
  if (state.selected) mapView?.select(state.selected, true);
}

init().catch((err) => {
  console.error(err);
  app.textContent = "Data could not be loaded / Les données n'ont pas pu être chargées.";
});
