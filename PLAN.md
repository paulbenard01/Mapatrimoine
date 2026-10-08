# PLAN

Milestones for PCI Map. Tick a box only when its "done when" criterion is met and CI is green.

## This session

- [x] **M0 scaffold**: layout, README (EN/FR stub), CLAUDE.md, PLAN.md, docs/decisions.md, DATA_NOTICE.md, MIT LICENSE, .gitignore, CI (ruff, pytest, vitest, build). Done when CI passes on an empty skeleton.
- [x] **M1 index**: `pci fetch-index` scrapes the inventory page into `data/index.json` (id, title, theme, year, fiche URL, unpublished flag). Done when ~540 elements across 7 themes are listed, with unit tests on a trimmed HTML fixture.
- [ ] **M2 fiches and curation**: download pilot fiches, extract text, parse I.1/I.2/I.4, geocode I.4 (cached), ~30 pilot events (≥2 overseas) + 3-5 practices curated as `data/curated/<id>.yaml`. Done when all curated files validate, the geocode cache is committed and the scrubber test passes.
- [ ] **M3 recurrence engine (TS)**: `nextOccurrence`, `occurrencesInYear`, Gregorian Easter; tests for Easter 2024-2027, Good Friday 2025/2026, nth/last weekday, year boundary, today = event day.
- [ ] **M4 site**: map (clustered, shape+colour markers), list/agenda synced, detail panel, next-occurrence badges, month strip, near me, URL state, FR/EN i18n, accessibility, overseas switch, GitHub Pages workflow. Done when `npm run build` passes, Playwright screenshots (desktop and 390 px) are in `docs/screenshots/` and reviewed, keyboard-only use of list and filters works, README documents everything.

## Later sessions (do not build now)

- [ ] **M5 live events layer**: DATAtourisme and/or OpenAgenda, fetched at build time by a scheduled GitHub Action using repository secrets, never from the browser. Check access terms first.
- [ ] **M6 mediation sheet**: printable bilingual sheet per element (3 discussion questions, 5 vocabulary terms), drafts for Paul to review.
- [ ] **M7 scale-up**: from the pilot to all published elements, with a review workflow (`review_status`, `lang_review`).
- [ ] **M8 portfolio write-up**.
