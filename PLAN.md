# PLAN

Milestones for PCI Map. Tick a box only when its "done when" criterion is met and CI is green.

## This session

- [x] **M0 scaffold**: layout, README (EN/FR stub), CLAUDE.md, PLAN.md, docs/decisions.md, DATA_NOTICE.md, MIT LICENSE, .gitignore, CI (ruff, pytest, vitest, build). Done when CI passes on an empty skeleton.
- [x] **M1 index**: `pci fetch-index` scrapes the inventory page into `data/index.json` (id, title, theme, year, fiche URL, unpublished flag). Done when ~540 elements across 7 themes are listed, with unit tests on a trimmed HTML fixture.
- [x] **M2 fiches and curation**: download pilot fiches, extract text, parse I.1/I.2/I.4, geocode I.4 (cached), ~30 pilot events (≥2 overseas) + 3-5 practices curated as `data/curated/<id>.yaml`. Done when all curated files validate, the geocode cache is committed and the scrubber test passes.
- [x] **M3 recurrence engine (TS)**: `nextOccurrence`, `occurrencesInYear`, Gregorian Easter; tests for Easter 2024-2027, Good Friday 2025/2026, nth/last weekday, year boundary, today = event day.
- [x] **M4 site**: inventory-first list (all 543 elements) + agenda view, map (clustered, shape+colour markers), list synced, detail panel, next-occurrence badges, month strip, near me, URL state, FR/EN i18n, accessibility, overseas switch, GitHub Pages workflow. Done when `npm run build` passes, Playwright screenshots (desktop and 390 px) are in `docs/screenshots/` and reviewed, keyboard-only use of list and filters works, README documents everything.

- [x] **Batch 3, whole inventory on the map** (Paul's request): every published element placed (several pins when it spans several places) from PCI Lab's "Localisation" field or the fiche read online, with sources; donut-chart clusters by theme; one picture per element where possible (Wikimedia Commons first, else the fiche image shown on PCI Lab). Done when a test proves every published element is curated or in `data/places.yaml`, and the build validates places and images.

## Later milestones

- [x] **M5 live events layer**: DATAtourisme's daily events export (open data on data.gouv.fr, Licence Ouverte 2.0, no key or secret needed), fetched at build time by the scheduled Pages workflow, never from the browser; matched to documented events by search terms and distance (`data/announced.yaml`). OpenAgenda not used (API key per account, per-agenda reads).
- [x] **M6 mediation sheet**: printable bilingual sheet per element (3 discussion questions, 5 vocabulary terms), drafts for Paul to review.
  - [x] schema, `pci build` validation, `mediation.json`, sheet view (`?id=…&sheet=1`), one-page A4 print, tests
  - [x] sheets for all 76 documented elements (each checked to print on one A4 page)
- [ ] **M7 scale-up**: summaries and timing for all published elements (places and pictures are done), with a review workflow (`review_status`, `lang_review`); Paul to spot-check `data/places.yaml` and the picture choices.
  - [x] review report (`pci review` → `docs/review.md`, kept current by a test)
  - [x] short summary tier (`data/summaries.yaml`) for the elements not curated yet, shown and searchable on the site
  - [ ] timing and evidence for the events among them (promote to `data/curated`)
  - [ ] Paul's review of drafts
- [ ] **M8 portfolio write-up**.
