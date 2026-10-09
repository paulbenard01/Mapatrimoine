import "@fontsource-variable/atkinson-hyperlegible-next";
import "@fontsource-variable/bricolage-grotesque";
import "./style.css";
import { STRINGS, THEME_LABELS, badgeText, describeRule, formatDay, formatKm, monthNames } from "./i18n";
import { AREAS, createMap, type Bounds, type MapEntry, type MapView } from "./map";
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
import { h, svg, type Child } from "./dom";
import { renderLesson } from "./lesson";
import { renderSheet } from "./sheet";
import { upcomingPeriods } from "./recurrence";
import {
  THEMES,
  type Announced,
  type Element,
  type InventoryEntry,
  type Location,
  type MediationSheet,
  type Picture,
  type Resources,
  type Story,
  type Theme,
} from "./types";

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
let openMenu: string | null = null; // which toolbar drop-down is open
let cameFromMap = false; // phones: the detail was opened from the map page
let sheetReturnKey: string | null = null; // where focus goes when the sheet closes
let entries: Entry[] = [];
let sheets: Record<string, MediationSheet> = {};
let announced: Announced | null = null;
let resources: Resources = { media: {}, lessons: [], stories: [] };
let otherSheetsOpen = false;
let lastStoryKey = ""; // story + step last shown, to fly the map only on change
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

const icon = (path: string, cls = "icon") =>
  svg(`<path d="${path}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`, cls, "0 0 24 24");

const ICONS = {
  explore: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5",
  near: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 7.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  agenda: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  resources: "M4 5a2 2 0 0 1 2-2h5v16H6a2 2 0 0 0-2 2zM20 5a2 2 0 0 0-2-2h-5v16h5a2 2 0 0 1 2 2z",
  unesco: "M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18",
  audio: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  video: "M3 6h12v12H3zM15 10l6-3v10l-6-3",
  story: "M4 19c3-6 6-9 8-9s3 3 6 3 2-4 2-6M4 19h4M17 4h3v3",
};

/** Which page the bottom navigation highlights (phones); derived from the shareable state. */
type Tab = "explore" | "search" | "near" | "agenda" | "resources";
function currentTab(): Tab {
  if (state.view === "resources") return "resources";
  if (state.view === "agenda") return "agenda";
  if (state.pane === "map") return "explore";
  return state.sort === "distance" ? "near" : "search";
}

function goTab(tab: Tab) {
  openMenu = null;
  cameFromMap = false;
  const leave = { selected: null, sheet: false };
  if (tab === "explore") setState({ ...leave, view: "inventory", pane: "map" });
  else if (tab === "search")
    setState({ ...leave, view: "inventory", pane: "list", sort: state.sort === "distance" ? "name" : state.sort });
  else if (tab === "near") setState({ ...leave, view: "inventory", pane: "list", sort: "distance" });
  else if (tab === "agenda") setState({ ...leave, view: "agenda", pane: "list" });
  else setState({ ...leave, view: "resources" });
  if (tab === "explore") showMap();
  if (tab === "search") document.getElementById("search")?.focus();
  window.scrollTo({ top: 0 });
}

/** The map is zero-sized while hidden: resize it, then frame the selected area again. */
function showMap() {
  requestAnimationFrame(() => {
    mapView?.resize();
    if (!state.selected) mapView?.fit(AREAS[state.zone === "overseas" ? (presentAreas()[0] ?? "guadeloupe") : "metro"]);
  });
}

/** A toolbar drop-down. Only one is open at a time; Escape or a click outside closes it. */
function menu(key: string, label: string, active: string | number | null, body: () => Child | Child[]): HTMLElement {
  const open = openMenu === key;
  return h(
    "div",
    { class: "menu" },
    h(
      "button",
      {
        type: "button",
        class: `menu-button${active ? " active" : ""}`,
        "data-key": `menu-${key}`,
        "aria-expanded": String(open),
        "aria-controls": `menu-${key}-body`,
        onclick: () => {
          openMenu = open ? null : key;
          render();
        },
      },
      label,
      active ? h("span", { class: "chip-count" }, String(active)) : null,
      h("span", { class: "caret", "aria-hidden": "true" }, "▾"),
    ),
    open ? h("div", { class: "menu-body", id: `menu-${key}-body`, role: "group", "aria-label": label }, body()) : null,
  );
}

function themeChips(items: Item[]): HTMLElement {
  const s = STRINGS[state.lang];
  const counts = themeCounts(items, state, position);
  const toggle = (t: Theme) =>
    setState({ themes: state.themes.includes(t) ? state.themes.filter((x) => x !== t) : [...state.themes, t] });
  return h(
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
          h("span", { class: "chip-count" }, String(counts.get(t) ?? 0)),
        ],
        () => toggle(t),
      ),
    ),
  );
}

function zoneChips(): Child[] {
  const s = STRINGS[state.lang];
  return [
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
    h("p", { class: "hint" }, s.mappedOnlyHint),
  ];
}

/** Locate / forget, radius and the privacy note. Used in the toolbar menu and the "near me" page. */
function nearControls(): Child[] {
  const s = STRINGS[state.lang];
  return [
    h(
      "div",
      { class: "row chips" },
      position
        ? h("button", { type: "button", "data-key": "forget", onclick: forgetPosition }, s.forgetLocation)
        : h(
            "button",
            { type: "button", "data-key": "locate", onclick: locate, disabled: geoStatus === "locating" },
            icon(ICONS.near, "inline-icon"),
            geoStatus === "locating" ? s.locating : s.locateMe,
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
  ];
}

function sortSelect(): HTMLElement {
  const s = STRINGS[state.lang];
  const labels: Record<Sort, string> = { name: s.sortName, year: s.sortYear, date: s.sortDate, distance: s.sortDistance };
  return h(
    "label",
    {},
    s.sort,
    h(
      "select",
      { "data-key": "sort", onchange: (e: Event) => setState({ sort: (e.target as HTMLSelectElement).value as Sort }) },
      SORTS[state.view].map((v) =>
        h("option", { value: v, selected: state.sort === v, disabled: v === "distance" && !position }, labels[v]),
      ),
    ),
  );
}

function activeFilters(): number {
  return (
    state.themes.length +
    (state.zone !== "all" ? 1 : 0) +
    (state.unesco ? 1 : 0) +
    (state.radiusKm !== null && position ? 1 : 0) +
    (state.q.trim() ? 1 : 0) +
    (state.month !== null ? 1 : 0)
  );
}

function renderToolbar(items: Item[]): HTMLElement {
  const s = STRINGS[state.lang];
  const events = entries.filter((e) => e.element?.kind === "event").length;
  const worksheets = Object.keys(sheets).length;
  const tab = (key: "inventory" | "agenda" | "resources", label: string, n: number, path: string) =>
    h(
      "button",
      {
        type: "button",
        "data-key": `view-${key}`,
        "aria-current": state.view === key ? "page" : null,
        onclick: () => {
          openMenu = null;
          const wasResources = state.view === "resources";
          setState({ view: key, selected: null, sheet: false, ...(key === "inventory" && state.pane === "map" ? {} : {}) });
          if (wasResources && key !== "resources") showMap();
        },
      },
      icon(path, "inline-icon"),
      label,
      h("span", { class: "chip-count" }, String(n)),
    );
  const unescoCount = entries.filter((e) => e.unesco).length;
  return h(
    "nav",
    { class: "toolbar", "aria-label": s.filters },
    h(
      "div",
      { class: "tabs" },
      tab("inventory", s.viewInventory, entries.length, ICONS.explore),
      tab("agenda", s.viewAgenda, events, ICONS.agenda),
      tab("resources", s.viewResources, worksheets, ICONS.resources),
    ),
    h(
      "div",
      { class: "filters" },
      menu("themes", s.themes, state.themes.length || null, () => themeChips(items)),
      state.view !== "resources"
        ? menu("zone", s.zone, state.zone !== "all" ? (state.zone === "metro" ? s.zoneMetroShort : s.zoneOverseas) : null, zoneChips)
        : null,
      state.view !== "resources" ? menu("near", s.nearMe, position ? "✓" : null, nearControls) : null,
      unescoCount
        ? h(
            "button",
            {
              type: "button",
              class: "unesco-toggle",
              "data-key": "unesco",
              "aria-pressed": String(state.unesco),
              title: s.unescoFilterHint,
              onclick: () => setState({ unesco: !state.unesco }),
            },
            icon(ICONS.unesco, "inline-icon"),
            s.unescoFilter,
            h("span", { class: "chip-count" }, String(unescoCount)),
          )
        : null,
      state.view !== "resources" ? sortSelect() : null,
      activeFilters()
        ? h(
            "button",
            {
              type: "button",
              class: "link",
              "data-key": "reset",
              onclick: () => {
                openMenu = null;
                setState({ q: "", themes: [], month: null, zone: "all", radiusKm: null, unesco: false, sort: SORTS[state.view][0] });
              },
            },
            s.resetFilters,
          )
        : null,
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
    "div",
    { class: "months", role: "group", "aria-label": s.months },
    h("p", { class: "sr-only", id: "month-hint" }, s.monthStripLabel),
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
      { class: "month-tools" },
      pressed("this-month", state.month === currentMonth, s.thisMonth, () =>
        setState({ month: state.month === currentMonth ? null : currentMonth }),
      ),
      pressed("all-months", state.month === null, s.allMonths, () => setState({ month: null })),
    ),
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

function unescoTag(entry: InventoryEntry): HTMLElement | null {
  if (!entry.unesco) return null;
  const s = STRINGS[state.lang];
  return h("span", { class: "unesco-tag", title: s.unescoLine(s.unescoLists[entry.unesco.list], entry.unesco.year) }, "UNESCO");
}

function unescoBox(entry: InventoryEntry): HTMLElement | null {
  const u = entry.unesco;
  if (!u) return null;
  const s = STRINGS[state.lang];
  const name = state.lang === "fr" ? (u.name_fr ?? u.name_en) : u.name_en;
  return h(
    "div",
    { class: "unesco-box" },
    icon(ICONS.unesco, "unesco-icon"),
    h(
      "p",
      { style: "margin:0" },
      h("strong", {}, s.unescoLine(s.unescoLists[u.list], u.year)),
      " · ",
      h("a", { href: u.url, target: "_blank", rel: "noopener", lang: state.lang === "fr" && u.name_fr ? "fr" : "en" }, name),
    ),
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
            h("span", { class: "result-title", lang: "fr" }, entry.title_fr, unescoTag(entry) ? [" ", unescoTag(entry)] : null),
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
        if (cameFromMap) {
          // Phones: the detail was opened from a marker, so go back to the map.
          cameFromMap = false;
          setState({ selected: null, pane: "map" });
          showMap();
          return;
        }
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
      // Fiche photos are served by the site itself, next to index.html.
      src: picture.source === "fiche" ? `${import.meta.env.BASE_URL}${picture.src}` : picture.src,
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
      : picture.source === "pcilab"
        ? h(
            "figcaption",
            {},
            `${s.ficheImageVia} `,
            h("a", { href: picture.page, target: "_blank", rel: "noopener" }, "PCI Lab"),
          )
        : h(
            "figcaption",
            {},
            h("a", { href: picture.page, target: "_blank", rel: "noopener" }, s.ficheImage),
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

/** Dates listed by tourist offices (DATAtourisme), matched at build time (M5). */
function announcedSection(id: string): HTMLElement | null {
  const s = STRINGS[state.lang];
  const events = (announced?.elements[id] ?? [])
    .map((e) => ({ ...e, periods: upcomingPeriods(e.periods, today) }))
    .filter((e) => e.periods.length)
    .sort((a, b) => a.periods[0].start.localeCompare(b.periods[0].start));
  if (!announced || !events.length) return null;
  const span = (p: { start: string; end: string }) =>
    p.start === p.end ? formatDay(p.start, state.lang) : `${formatDay(p.start, state.lang)} – ${formatDay(p.end, state.lang)}`;
  return h(
    "div",
    { class: "announced" },
    h("h4", {}, s.announced),
    h(
      "ul",
      {},
      events.map((e) =>
        h(
          "li",
          {},
          h("strong", {}, span(e.periods[0])),
          e.periods.length > 1 ? ` (${s.moreDates(e.periods.length - 1)})` : "",
          " · ",
          h("span", { lang: "fr" }, e.title),
          e.commune ? `, ${e.commune}` : "",
          e.url ? [" · ", h("a", { href: e.url, target: "_blank", rel: "noopener" }, s.details)] : null,
        ),
      ),
    ),
    h(
      "p",
      { class: "note" },
      `${s.announcedCredit} `,
      h("a", { href: announced.source_url, target: "_blank", rel: "noopener" }, formatDay(announced.generated_on, state.lang)),
      `. ${s.announcedCheck}`,
    ),
  );
}

function openSheetButton(id: string): HTMLElement | null {
  if (!sheets[id]) return null;
  const s = STRINGS[state.lang];
  return h(
    "p",
    {},
    h(
      "button",
      {
        type: "button",
        class: "open-sheet",
        "data-key": "open-sheet",
        onclick: () => {
          sheetReturnKey = "open-sheet";
          setState({ sheet: true });
        },
      },
      s.openSheet,
    ),
  );
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
      unescoBox(entry),
      figure(entry.image),
      entry.summary ? h("p", { class: "summary", lang: state.lang }, entry.summary[state.lang]) : null,
      entry.summary && entry.summary_source
        ? h(
            "p",
            { class: "note" },
            `${s.summaryFrom} `,
            h("a", { href: entry.summary_source.url, target: "_blank", rel: "noopener" }, entry.summary_source.publisher),
            ". ",
            entry.review_status === "reviewed" ? "" : s.summaryUnreviewed,
            state.lang === "en" && entry.summary.lang_review === "draft" ? ` ${s.summaryDraft}.` : "",
          )
        : null,
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
      h("p", { class: "note" }, entry.summary ? s.shortOnly : s.notDocumented),
      mediaSection(entry.id),
      openSheetButton(entry.id),
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
    unescoBox(entry),
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
          announcedSection(entry.id),
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
    mediaSection(entry.id),
    openSheetButton(entry.id),
    ficheLink,
  );
}

// A selection restored from the URL must not steal focus on page load.
let lastSelected: string | null = state.selected;
let lastSheet = false;
let lastLesson: string | null = null;

/** Sheet mode replaces the page with the printable sheet; the map stays alive underneath. */
function renderSheetMode(item: Item | undefined): boolean {
  const sheet = state.sheet && item ? sheets[item.entry.id] : undefined;
  if (state.sheet && !sheet && entries.length) state.sheet = false;
  document.body.classList.toggle("sheet-mode", Boolean(sheet));
  let root = document.getElementById("sheet-root");
  if (!sheet) {
    root?.remove();
    return false;
  }
  if (!root) {
    root = h("div", { id: "sheet-root" });
    app.append(root);
  }
  root.replaceChildren(
    renderSheet(item!, sheet, state.lang, import.meta.env.BASE_URL, () => {
      // Back to where the sheet was opened: the resources page or the element's detail.
      if (state.view === "resources") setState({ sheet: false, selected: null });
      else {
        setState({ sheet: false });
        requestAnimationFrame(() => mapView?.resize());
      }
    }),
  );
  return true;
}

// ---------- media links (public archives) ----------
function mediaSection(id: string): HTMLElement | null {
  const links = resources.media[id];
  if (!links?.length) return null;
  const s = STRINGS[state.lang];
  return h(
    "section",
    { class: "media", "aria-labelledby": "media-title" },
    h("h3", { id: "media-title" }, s.mediaTitle),
    h(
      "ul",
      {},
      links.map((m) =>
        h(
          "li",
          {},
          icon(m.kind === "audio" ? ICONS.audio : ICONS.video, "media-icon"),
          h(
            "span",
            {},
            h("a", { href: m.url, target: "_blank", rel: "noopener" }, m.title),
            h("span", { class: "media-meta" }, ` · ${m.publisher}${m.year ? `, ${m.year}` : ""} · ${m.kind === "audio" ? s.audio : s.video}`),
            m.note ? h("span", { class: "media-note" }, m.note[state.lang]) : null,
          ),
        ),
      ),
    ),
    h("p", { class: "note" }, s.mediaNote),
  );
}

// ---------- stories: guided tours across elements ----------
const findStory = (id: string | null) => (id ? resources.stories.find((st) => st.id === id) : undefined);

function startStory(id: string) {
  openMenu = null;
  setState({ story: id, step: 0, view: "inventory", selected: null, sheet: false, pane: "list" });
  showMap();
  window.scrollTo({ top: 0 });
}

function leaveStory() {
  setState({ story: null, step: 0 });
  showMap();
}

/** Bounds of every place in a story, to frame the whole tour on its introduction. */
function storyBounds(items: Item[]): Bounds | null {
  const locs = items.flatMap((i) => placesOf(i.entry));
  if (!locs.length) return null;
  const lons = locs.map((l) => l.lon);
  const lats = locs.map((l) => l.lat);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}

function renderStory(story: Story, all: Item[]): HTMLElement {
  const s = STRINGS[state.lang];
  const lang = state.lang;
  const last = story.steps.length + 1;
  const step = Math.min(state.step, last);
  const byId = new Map(all.map((i) => [i.entry.id, i]));
  const go = (n: number) => setState({ step: Math.max(0, Math.min(last, n)) });
  let body: Child[];
  if (step === 0) {
    body = [
      h("p", { class: "story-tagline" }, story.tagline[lang]),
      ...story.intro[lang].split(/\n\s*\n/).map((p) => h("p", {}, p)),
      h("p", { class: "note" }, s.storySteps(story.steps.length)),
    ];
  } else if (step === last) {
    const others = resources.stories.filter((o) => o.id !== story.id);
    body = [
      h("h3", { class: "story-heading" }, s.storyEnd),
      ...story.outro[lang].split(/\n\s*\n/).map((p) => h("p", {}, p)),
      others.length
        ? h(
            "div",
            { class: "story-others" },
            h("p", { class: "note" }, s.storyOthers),
            h(
              "div",
              { class: "chips" },
              others.map((o) =>
                h("button", { type: "button", "data-key": `story-${o.id}`, onclick: () => startStory(o.id) }, o.title[lang]),
              ),
            ),
          )
        : null,
    ];
  } else {
    const st = story.steps[step - 1];
    const item = byId.get(st.element);
    const entry = item?.entry;
    body = [
      h("h3", { class: "story-heading" }, st.heading[lang]),
      entry
        ? h(
            "div",
            { class: "story-element" },
            entry.image ? figure(entry.image) : null,
            h(
              "p",
              { class: "story-element-title" },
              shapeIcon(shapeOf(item!.element), entry.themes[0]),
              h("span", { lang: "fr" }, entry.title_fr),
              unescoTag(entry),
            ),
            h("p", { class: "result-meta" }, placeNames(placesOf(entry))),
          )
        : null,
      ...st.text[lang].split(/\n\s*\n/).map((p) => h("p", {}, p)),
      st.look_for ? h("p", { class: "story-look" }, h("strong", {}, `${s.storyLookFor} `), st.look_for[lang]) : null,
      entry
        ? h(
            "p",
            {},
            h(
              "button",
              {
                type: "button",
                class: "link",
                "data-key": "story-open-element",
                onclick: () => {
                  setState({ story: null, step: 0, selected: entry.id }, { fly: true });
                },
              },
              s.storyOpenElement,
            ),
          )
        : null,
    ];
  }
  return h(
    "section",
    { class: "story", "aria-labelledby": "story-title" },
    h(
      "div",
      { class: "story-top" },
      h("button", { type: "button", class: "back", "data-key": "story-leave", onclick: leaveStory }, `← ${s.storyLeave}`),
      h("p", { class: "story-kicker" }, story.kind === "place" ? s.storyPlace : s.storyTheme),
      h("h2", { id: "story-title", tabindex: "-1" }, story.title[lang]),
      h(
        "ol",
        { class: "story-progress", "aria-label": s.storyProgress },
        Array.from({ length: last + 1 }, (_, i) =>
          h(
            "li",
            {},
            h(
              "button",
              {
                type: "button",
                "data-key": `story-step-${i}`,
                "aria-current": i === step ? "step" : null,
                "aria-label": i === 0 ? s.storyIntro : i === last ? s.storyEnd : `${i}. ${story.steps[i - 1].heading[lang]}`,
                onclick: () => go(i),
              },
              i === 0 ? "★" : i === last ? "✓" : String(i),
            ),
          ),
        ),
      ),
    ),
    h("div", { class: "story-body", "aria-live": "polite" }, body),
    h(
      "div",
      { class: "story-nav" },
      h("button", { type: "button", "data-key": "story-prev", disabled: step === 0, onclick: () => go(step - 1) }, `← ${s.storyPrev}`),
      step < last
        ? h("button", { type: "button", class: "primary", "data-key": "story-next", onclick: () => go(step + 1) }, step === 0 ? s.storyStart : `${s.storyNext} →`)
        : h("button", { type: "button", class: "primary", "data-key": "story-done", onclick: leaveStory }, s.storyDone),
    ),
  );
}

function storyChips(): HTMLElement | null {
  if (!resources.stories.length || state.view !== "inventory") return null;
  const s = STRINGS[state.lang];
  return h(
    "div",
    { class: "story-strip" },
    h("p", { class: "story-strip-title" }, icon(ICONS.story, "inline-icon"), s.storiesShort),
    h(
      "div",
      { class: "story-strip-row" },
      resources.stories.map((st) =>
        h("button", { type: "button", "data-key": `story-${st.id}`, onclick: () => startStory(st.id) }, st.title[state.lang]),
      ),
    ),
  );
}

// ---------- lessons ----------
function renderLessonMode(): boolean {
  const lesson = state.lesson ? resources.lessons.find((l) => l.id === state.lesson) : undefined;
  if (state.lesson && !lesson && resources.lessons.length) state.lesson = null;
  document.body.classList.toggle("lesson-mode", Boolean(lesson));
  let root = document.getElementById("lesson-root");
  if (!lesson) {
    root?.remove();
    return false;
  }
  if (!root) {
    root = h("div", { id: "lesson-root" });
    app.append(root);
  }
  const titles = new Map(entries.map((e) => [e.id, e.title_fr]));
  root.replaceChildren(
    renderLesson(
      lesson,
      state.lang,
      titles,
      import.meta.env.BASE_URL,
      () => setState({ lesson: null }),
      () => setState({ lang: state.lang === "fr" ? "en" : "fr" }),
    ),
  );
  return true;
}

function lessonsSection(): HTMLElement | null {
  if (!resources.lessons.length) return null;
  const s = STRINGS[state.lang];
  const lang = state.lang;
  return h(
    "section",
    { class: "res-section", "aria-labelledby": "lessons-title" },
    h("header", {}, h("h3", { id: "lessons-title" }, s.lessonsTitle), h("p", { class: "count" }, s.lessonsCount(resources.lessons.length))),
    h("p", { class: "section-note" }, s.lessonsIntro),
    h(
      "ul",
      { class: "cards" },
      resources.lessons.map((l) =>
        h(
          "li",
          {},
          h(
            "article",
            { class: "card lesson-card" },
            h("span", { class: `level-tag level-${l.level}` }, s.levels[l.level]),
            h("h4", {}, l.title[lang]),
            h("p", { class: "card-meta" }, `${l.grade[lang]} · ${s.minutes(l.duration_min)}`),
            h("p", { class: "card-summary" }, l.summary[lang]),
            h(
              "div",
              { class: "card-actions" },
              h(
                "button",
                { type: "button", class: "primary", "data-key": `lesson-${l.id}`, onclick: () => setState({ lesson: l.id }) },
                s.openLesson,
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

function storiesSection(): HTMLElement | null {
  if (!resources.stories.length) return null;
  const s = STRINGS[state.lang];
  const lang = state.lang;
  const group = (kind: "theme" | "place", title: string) => {
    const items = resources.stories.filter((st) => st.kind === kind);
    if (!items.length) return null;
    return [
      h("h4", { class: "res-subtitle" }, title),
      h(
        "ul",
        { class: "cards" },
        items.map((st) =>
          h(
            "li",
            {},
            h(
              "article",
              { class: "card story-card" },
              h("span", { class: "card-theme" }, icon(ICONS.story, "inline-icon"), s.storySteps(st.steps.length)),
              h("h4", {}, st.title[lang]),
              h("p", { class: "card-summary" }, st.tagline[lang]),
              h(
                "div",
                { class: "card-actions" },
                h("button", { type: "button", class: "primary", "data-key": `story-${st.id}`, onclick: () => startStory(st.id) }, s.startStory),
              ),
            ),
          ),
        ),
      ),
    ];
  };
  return h(
    "section",
    { class: "res-section", "aria-labelledby": "stories-title" },
    h("header", {}, h("h3", { id: "stories-title" }, s.storiesTitle), h("p", { class: "count" }, s.storiesCount(resources.stories.length))),
    h("p", { class: "section-note" }, s.storiesIntro),
    group("theme", s.storiesThemes),
    group("place", s.storiesPlaces),
  );
}

function openDataSection(): HTMLElement {
  const s = STRINGS[state.lang];
  const base = import.meta.env.BASE_URL;
  return h(
    "section",
    { class: "res-section open-data", "aria-labelledby": "open-data-title" },
    h("header", {}, h("h3", { id: "open-data-title" }, s.openDataTitle)),
    h("p", { class: "section-note" }, s.openDataIntro(entries.length)),
    h(
      "div",
      { class: "card-actions" },
      h("a", { class: "button primary", href: `${base}data/open/pci-inventaire.csv`, download: "pci-inventaire.csv" }, s.downloadCsv),
      h("a", { class: "button", href: `${base}data/open/pci-inventaire.json`, download: "pci-inventaire.json" }, s.downloadJson),
    ),
    h("p", { class: "hint" }, s.openDataFields),
    h("p", { class: "hint" }, s.openDataLicence),
  );
}

// ---------- resources page ----------
function openWorksheet(id: string) {
  sheetReturnKey = `sheet-${id}`;
  setState({ selected: id, sheet: true });
}

function renderResources(all: Item[]): HTMLElement {
  const s = STRINGS[state.lang];
  // Same filters as the map (themes, search, territory, UNESCO), limited to elements with a sheet.
  const withSheet = sortItems(
    applyFilters(all, { ...state, view: "inventory", radiusKm: null }, null).filter((i) => sheets[i.entry.id]),
    "name",
  );
  return h(
    "section",
    { class: "resources", id: "resources", "aria-labelledby": "resources-title" },
    h(
      "div",
      { class: "resources-inner" },
      h("h2", { id: "resources-title" }, s.resourcesTitle),
      h("p", { class: "lead" }, s.resourcesIntro),
      h(
        "nav",
        { class: "res-jump", "aria-label": s.resourcesTitle },
        resources.lessons.length ? h("a", { href: "#lessons-title" }, s.lessonsTitle) : null,
        resources.stories.length ? h("a", { href: "#stories-title" }, s.storiesTitle) : null,
        h("a", { href: "#worksheets-title" }, s.worksheetsTitle),
        h("a", { href: "#open-data-title" }, s.openDataTitle),
      ),
      lessonsSection(),
      storiesSection(),
      h("h3", { class: "res-kicker", id: "worksheets-title" }, s.worksheetsTitle),
      h("p", { class: "count", role: "status", "aria-live": "polite" }, s.worksheetsCount(withSheet.length)),
      withSheet.length
        ? [
            sheetSection("unesco-sheets", s.unescoSheets, s.unescoSheetsIntro, withSheet.filter((i) => i.entry.unesco), true),
            sheetSection("other-sheets", s.otherSheets, s.worksheetsIntro, withSheet.filter((i) => !i.entry.unesco), false),
          ]
        : h("p", { class: "empty" }, s.noResults),
      openDataSection(),
    ),
  );
}

function sheetSection(id: string, title: string, intro: string, items: Item[], highlight: boolean): HTMLElement | null {
  const s = STRINGS[state.lang];
  if (!items.length) return null;
  return h(
    "section",
    { class: `res-section${highlight ? " highlight" : ""}`, "aria-labelledby": id },
    h("header", {}, h("h3", { id }, title), h("p", { class: "count" }, s.worksheetsCount(items.length))),
    h("p", { class: "section-note" }, intro),
    highlight || state.q.trim() || state.themes.length
      ? h("ul", { class: "cards" }, items.map(worksheetCard))
      : // The long list of other sheets stays folded until asked for (or filtered).
        h(
          "details",
          {
            class: "more-sheets",
            open: otherSheetsOpen,
            ontoggle: (e: Event) => (otherSheetsOpen = (e.target as HTMLDetailsElement).open),
          },
          h("summary", { "data-key": "more-sheets" }, s.showSheets(items.length)),
          h("ul", { class: "cards" }, items.map(worksheetCard)),
        ),
  );
}

function worksheetCard({ entry, element }: Item): HTMLElement {
  const s = STRINGS[state.lang];
  const theme = entry.themes[0];
  const kind = element?.kind ?? entry.kind;
  const places = placeNames(element?.locations ?? entry.locations);
  const sheet = sheets[entry.id];
  return h(
    "li",
    {},
    h(
      "article",
      { class: "card" },
      h(
        "span",
        { class: "card-theme" },
        h("span", { class: "swatch", style: `background:${THEME_COLORS[theme]}` }),
        THEME_LABELS[state.lang][theme],
        unescoTag(entry),
      ),
      h("h4", { lang: "fr" }, entry.title_fr),
      h("p", { class: "card-meta" }, [kind === "event" ? s.event : kind === "practice" ? s.practice : "", places].filter(Boolean).join(" · ")),
      sheet.activity
        ? h(
            "p",
            { class: "card-activity" },
            h("strong", {}, `${s.sheetActivity} : `),
            state.lang === "fr" ? sheet.activity.title_fr : sheet.activity.title_en,
            ` (${sheet.activity.levels.map((l) => s.levels[l]).join(", ")})`,
          )
        : null,
      h(
        "div",
        { class: "card-actions" },
        h(
          "button",
          { type: "button", class: "primary", "data-key": `sheet-${entry.id}`, onclick: () => openWorksheet(entry.id) },
          s.openWorksheet,
        ),
        h(
          "button",
          {
            type: "button",
            "data-key": `seemap-${entry.id}`,
            onclick: () => {
              setState({ view: "inventory", selected: entry.id, pane: "list" }, { fly: true });
              showMap();
            },
          },
          s.seeElement,
        ),
      ),
    ),
  );
}

// ---------- bottom navigation (phones) ----------
function renderBottomNav(): HTMLElement {
  const s = STRINGS[state.lang];
  const tab = currentTab();
  const item = (key: Tab, label: string, path: string) =>
    h(
      "button",
      {
        type: "button",
        "data-key": `nav-${key}`,
        "aria-current": tab === key ? "page" : null,
        onclick: () => goTab(key),
      },
      icon(path, "nav-icon"),
      label,
    );
  return h(
    "nav",
    { class: "bottom-nav", "aria-label": s.mainNav },
    item("explore", s.navExplore, ICONS.explore),
    item("search", s.navSearch, ICONS.search),
    item("near", s.navNear, ICONS.near),
    item("agenda", s.navAgenda, ICONS.agenda),
    item("resources", s.navResources, ICONS.resources),
  );
}

const brandMark = () =>
  svg(
    '<rect x="1" y="1" width="30" height="30" rx="9" fill="#ffffff" fill-opacity="0.08"/>' +
      '<circle cx="12.5" cy="13" r="6.5" fill="#f2b84b" stroke="#13294b" stroke-width="1.5"/>' +
      '<path d="M21 13.5 26.5 19 21 24.5 15.5 19Z" fill="#7cc4a8" stroke="#13294b" stroke-width="1.5"/>' +
      '<circle cx="11" cy="23" r="3.2" fill="none" stroke="#c6d2e6" stroke-width="2"/>',
    "brand-mark",
    "0 0 32 32",
  );

function renderHeader(): HTMLElement {
  const s = STRINGS[state.lang];
  const documented = entries.filter((e) => e.element).length;
  const located = entries.filter((e) => placesOf(e).length).length;
  return h(
    "header",
    { class: "top" },
    h("a", { class: "skip", href: "#results" }, s.skipToList),
    h(
      "div",
      { class: "brand" },
      brandMark(),
      h("div", {}, h("h1", {}, s.appTitle), h("p", {}, s.appSubtitle)),
    ),
    h(
      "div",
      { class: "search-wrap", role: "search" },
      icon(ICONS.search, "search-icon"),
      h("label", { for: "search", class: "sr-only" }, s.search),
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
        s.switchToShort,
      ),
      h(
        "details",
        { class: "about" },
        h("summary", { "data-key": "about" }, s.aboutShort),
        h(
          "div",
          { class: "about-panel" },
          h("p", {}, s.coverage(entries.length, located, documented)),
          h("p", {}, s.aboutText),
          h("p", {}, s.pilotNote),
          h("p", {}, s.disclaimer),
        ),
      ),
    ),
  );
}

function render() {
  const s = STRINGS[state.lang];
  document.documentElement.lang = state.lang;
  document.title = `${s.appTitle} · ${s.appSubtitle}`;

  const active = document.activeElement as HTMLElement | null;
  const focusKey = active?.dataset?.key;
  const caret = active instanceof HTMLInputElement ? [active.selectionStart, active.selectionEnd] : null;
  const listScroll = document.querySelector(".panel")?.scrollTop ?? 0;

  const all = annotate(entries, today, position);
  const story = findStory(state.story);
  if (state.story && !story && resources.stories.length) state.story = null;
  if (story && state.view !== "inventory") state.view = "inventory";
  const onResources = state.view === "resources";
  const storyItems = story
    ? story.steps.map((st) => all.find((i) => i.entry.id === st.element)).filter((i): i is Item => Boolean(i))
    : [];
  const visible = onResources ? [] : story ? storyItems : sortItems(applyFilters(all, state, position), state.sort);
  const selectedItem = state.selected ? all.find((i) => i.entry.id === state.selected) : undefined;
  if (state.selected && !selectedItem && entries.length) state.selected = null;
  const mapped = visible.filter((i) => placesOf(i.entry).length).map(mapEntry);
  if (!onResources) mapView?.setEntries(mapped);

  const tab = currentTab();
  app.className = `tab-${tab} view-${state.view}${story ? " story-mode" : ""}`;
  const events = entries.filter((e) => e.element?.kind === "event").length;

  const panelHead = h(
    "div",
    { class: "panel-head" },
    !story && !state.selected ? storyChips() : null,
    state.view === "agenda" ? [h("p", { class: "agenda-intro" }, s.agendaIntro(events)), monthStrip(all)] : null,
    tab === "near"
      ? h("section", { class: "near-box", "aria-label": s.nearMe }, h("h2", { class: "count" }, s.nearMe), nearControls())
      : null,
    state.sort === "distance" && !position && tab !== "near"
      ? h("p", { class: "hint" }, s.sortDistanceNeedsLocation)
      : null,
  );

  const results = h(
    "div",
    { class: "results-area", id: "results", tabindex: "-1" },
    story
      ? renderStory(story, all)
      : selectedItem && !onResources
        ? renderDetail(selectedItem)
        : [legend(), renderList(visible)],
  );

  const header = renderHeader();
  const toolbar = renderToolbar(all);
  const resourcesPage = onResources ? renderResources(all) : h("section", { class: "resources", hidden: true });
  const bottomNav = renderBottomNav();
  const shell = app.querySelector<HTMLElement>(".shell");
  if (!shell) {
    const mapBox = h("div", { class: "map", id: "map" });
    app.replaceChildren(
      header,
      toolbar,
      h(
        "main",
        { class: `shell pane-${state.pane}`, hidden: onResources },
        h(
          "div",
          { class: "panel" },
          panelHead,
          // One persistent live region, updated in place, so screen readers announce changes.
          h("p", { class: "count", role: "status", "aria-live": "polite" }),
          results,
        ),
        mapBox,
      ),
      resourcesPage,
      bottomNav,
    );
    mapView = createMap(
      mapBox,
      s.mapLabel,
      (id) => {
        cameFromMap = state.pane === "map";
        setState({ selected: id, pane: "list" });
      },
      () => {
        mapFailed = true;
        mapBox.replaceChildren(h("p", { class: "map-error" }, STRINGS[state.lang].mapUnavailable));
        render();
      },
    );
    mapView?.setEntries(mapped);
  } else {
    app.querySelector("header.top")!.replaceWith(header);
    app.querySelector(".toolbar")!.replaceWith(toolbar);
    app.querySelector(".resources")!.replaceWith(resourcesPage);
    app.querySelector(".bottom-nav")!.replaceWith(bottomNav);
    shell.className = `shell pane-${state.pane}`;
    shell.hidden = onResources;
    shell.querySelector(".panel-head")!.replaceWith(panelHead);
    shell.querySelector(".results-area")!.replaceWith(results);
    if (mapFailed) shell.querySelector(".map")!.replaceChildren(h("p", { class: "map-error" }, s.mapUnavailable));
  }
  const panel = app.querySelector<HTMLElement>(".panel")!;
  const count = panel.querySelector<HTMLElement>("p.count")!;
  const countText = s.resultsCount(visible.length, mapped.length);
  if (count.textContent !== countText) count.textContent = countText;

  if (story) {
    const key = `${story.id}:${state.step}`;
    if (key !== lastStoryKey) {
      lastStoryKey = key;
      const current = story.steps[state.step - 1]?.element ?? null;
      requestAnimationFrame(() => {
        if (current) mapView?.select(current, true);
        else {
          mapView?.select(null, false);
          const bounds = storyBounds(storyItems);
          if (bounds) mapView?.fit(bounds);
        }
      });
      document.getElementById("story-title")?.focus({ preventScroll: true });
      if (panel.scrollHeight > panel.clientHeight) panel.scrollTop = 0;
    }
  } else lastStoryKey = "";

  if (renderLessonMode()) {
    const lesson = resources.lessons.find((l) => l.id === state.lesson)!;
    document.title = `${lesson.title[state.lang]} · ${s.lessonKicker}`;
    if (!lastLesson) {
      window.scrollTo({ top: 0 });
      document.getElementById("lesson-title")?.focus({ preventScroll: true });
    } else if (focusKey) document.querySelector<HTMLElement>(`[data-key="${focusKey}"]`)?.focus();
    lastLesson = state.lesson;
    return;
  }
  if (lastLesson) {
    const key = `lesson-${lastLesson}`;
    lastLesson = null;
    document.querySelector<HTMLElement>(`[data-key="${key}"]`)?.focus();
    return;
  }

  const sheetMode = renderSheetMode(selectedItem);
  if (sheetMode) {
    document.title = `${selectedItem!.entry.title_fr} · ${s.sheetKicker}`;
    if (!lastSheet) {
      window.scrollTo({ top: 0 });
      document.getElementById("sheet-title")?.focus({ preventScroll: true });
    } else if (focusKey) document.querySelector<HTMLElement>(`[data-key="${focusKey}"]`)?.focus();
    lastSheet = true;
    lastSelected = state.selected;
    return;
  }
  if (lastSheet) {
    lastSheet = false;
    lastSelected = state.selected;
    document.querySelector<HTMLElement>(`[data-key="${sheetReturnKey ?? "open-sheet"}"]`)?.focus();
    sheetReturnKey = null;
    return;
  }

  // Keep keyboard focus, caret and scroll where they were.
  if (state.selected !== lastSelected && state.selected && !onResources) {
    // Bring the detail into view inside the scrolling panel (desktop) or the page (mobile).
    if (panel.scrollHeight > panel.clientHeight) panel.scrollTop = results.offsetTop - panel.offsetTop;
    else window.scrollTo({ top: results.getBoundingClientRect().top + window.scrollY - 70 });
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

// Toolbar menus close on Escape or a click elsewhere. composedPath() still lists the menu
// when the clicked chip was replaced by the re-render it triggered.
function closeMenusOnOutsideInput() {
  document.addEventListener("click", (e) => {
    if (!openMenu) return;
    const inMenu = e.composedPath().some((n) => n instanceof Element && n.classList.contains("menu"));
    if (!inMenu) {
      openMenu = null;
      render();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !openMenu) return;
    const key = openMenu;
    openMenu = null;
    render();
    document.querySelector<HTMLElement>(`[data-key="menu-${key}"]`)?.focus();
  });
}

async function init() {
  closeMenusOnOutsideInput();
  const base = import.meta.env.BASE_URL;
  const [inventory, curated, mediation, extra, listed] = await Promise.all([
    fetch(`${base}data/inventory.json`).then((r) => r.json() as Promise<{ elements: InventoryEntry[] }>),
    fetch(`${base}data/elements.json`).then((r) => r.json() as Promise<{ elements: Element[] }>),
    // Optional: the site works without mediation sheets.
    fetch(`${base}data/mediation.json`)
      .then((r) => (r.ok ? (r.json() as Promise<{ sheets: Record<string, MediationSheet> }>) : { sheets: {} }))
      .catch(() => ({ sheets: {} })),
    fetch(`${base}data/resources.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Resources>) : null))
      .catch(() => null),
    fetch(`${base}data/announced.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Announced>) : null))
      .catch(() => null),
  ]);
  entries = mergeEntries(inventory.elements, curated.elements);
  sheets = mediation.sheets;
  announced = listed;
  if (extra) resources = extra;
  render();
  if (state.zone === "overseas") mapView?.fit(AREAS[presentAreas()[0] ?? "guadeloupe"]);
  if (state.selected) mapView?.select(state.selected, true);
}

init().catch((err) => {
  console.error(err);
  app.textContent = "Data could not be loaded / Les données n'ont pas pu être chargées.";
});
