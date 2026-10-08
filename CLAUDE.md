# CLAUDE.md

PCI Map: an interactive bilingual (FR/EN) map of France's national Inventaire du patrimoine culturel immatériel (PCI) and its yearly events. Independent portfolio project by Paul Benard; public documents only.

## Hard rules

1. Never commit raw fiche PDFs, full extracted fiche text or personal data (names of private individuals, emails, phones). `data/raw/` and `data/text/` are git-ignored. Commit only structured facts, own-words summaries, quotes of at most 25 words, links to the official fiche and, for elements with no Commons or PCI Lab picture, one photo per element taken from its fiche (Paul's decision, 2026-10-08; see `data/images.yaml`).
2. Exclude every element whose fiche is marked unpublished ("Fiche dépubliée à la demande de ...").
3. `pipeline/tests/test_scrub.py` fails CI if committed data contains an email or phone pattern. Never weaken it to make it pass.
4. Fetch politely: at most 1 request/second, descriptive User-Agent, cache every download (`pci.http`).
5. Use fiche hrefs exactly as scraped from the inventory page (normalised to https + culture.gouv.fr). Never guess slugs. Fetch failures are logged, never fatal.
6. Recurrence dates are computed in TypeScript only (`web/src/recurrence.ts`). The pipeline emits rules, it never computes dates.
7. Never hard-code "today": inject a clock (`today` parameter / `?today=YYYY-MM-DD` URL override for screenshots).
8. No analytics, cookies, trackers or API keys in the browser. Location never leaves the browser.
9. Don't call external LLM APIs; curation is done by hand/scripts into `data/curated/<id>.yaml`.

## Layout

```
pyproject.toml            Python pipeline (package `pci` in pipeline/pci, tests in pipeline/tests)
schema/                   JSON Schema for curated elements (element.schema.json)
data/index.json           scraped inventory index (committed)
data/curated/<id>.yaml    hand-curated elements with summary and timing (committed)
data/places.yaml          places (and their sources) for every other element (committed, hand-written)
data/images.yaml          one picture per element: Commons file or PCI Lab fiche image (committed)
data/geocode-cache.json   geocoding cache (committed)
data/pilot.txt            pilot element IDs; data/fiches-manifest.json fetch/text status (committed)
data/raw/, data/text/     downloaded PDFs, extracted text, PCI Lab crawl, gazetteer cache (ignored)
web/                      Vite + TypeScript + MapLibre site; web/public/data/{elements,inventory}.json are built by `pci build`
  src/recurrence.ts       the only date logic; src/model.ts filters/sorts; src/state.ts URL state
  src/i18n/{fr,en}.ts     every UI string; src/main.ts rendering; src/map.ts MapLibre
docs/decisions.md         decision log (decision, why, alternative rejected)
docs/screenshots/         Playwright screenshots
```

## Commands

```sh
# pipeline
python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'
.venv/bin/pci fetch-index      # inventory page + official list PDF -> data/index.json
.venv/bin/pci fetch-pcilab     # PCI Lab points + "Localisation" fields -> data/raw/pcilab.json (local only)
.venv/bin/pci fetch-fiches     # pilot fiches -> data/raw/ (cached)
.venv/bin/pci extract-text     # -> data/text/
.venv/bin/pci geocode          # curated + places.yaml places -> data/geocode-cache.json (network, cached)
.venv/bin/pci build            # validate data/curated (offline) -> web/public/data/elements.json
.venv/bin/pytest -q && .venv/bin/ruff check . && .venv/bin/ruff format --check .

# web (in web/)
npm ci           # .npmrc sets legacy-peer-deps (npm 10 arborist bug with vitest peers)
npm run dev
npm test         # vitest
npm run build    # tsc + vite build
npm run screenshots   # needs `npm run preview` running; writes docs/screenshots/ + keyboard smoke test
```

## Curation workflow

1. Add the ID to `data/pilot.txt`; run `pci fetch-fiches` then `pci extract-text`.
2. Read `data/text/<id>.txt` (pages split by form feeds) and `<id>.facts.json`.
3. Write `data/curated/<id>.yaml`: `kind`, `domain`, `summary` (fr/en, own words, `lang_review: draft`), `places` (`{commune, department}`, `{department}` or `{region}`), `recurrence` (null for practices), `timing` (quote ≤ 25 words, 1-based page), `review_status: unreviewed`. Use `>-` block scalars for prose (French " : " breaks plain YAML).
4. Check the timing online (organiser, town hall, tourism board first; aggregators only as a fallback) and add `timing.web_sources` (`url`, `publisher`, `says` in own words, `checked_at`). Never copy organisers' phone numbers or emails. Use `recurrence: {type: dates, occurrences: [...]}` for announced editions when no stable rule exists, and `every_years`/`reference_year` for non-annual festivals. Rules inferred from several editions are `confidence: medium` and say so in `notes`.
5. `pci geocode && pci build`: the build validates the schema and checks each fiche quote on its page.

## Places and images for the rest of the inventory

- Every published element must be on the map: curated elements carry `places`; all others need an entry in `data/places.yaml` (`places`, plus `pcilab: <fiche id>` when the places come from PCI Lab's "Localisation" field, or `sources: [{publisher, url}]` when read elsewhere, e.g. the official fiche). A test fails if an element has neither.
- Use several places when the source names several; `approximate: true` with a `label` for a pays pinned on its main town; `{area: ...}` for historical regions (`pci.geocode.AREAS`); `{label, lat, lon, precision}` only outside the COG (New Caledonia, French Polynesia) or for "France entière" pins. Take place names only, never the people listed next to them.
- `data/images.yaml`: prefer a Wikimedia Commons file that clearly shows the element (credit = author or attribution from the file page, plus licence); otherwise the fiche image shown on PCI Lab (`source: pcilab`), linked, not copied; only when neither exists, one photo extracted from the fiche PDF (`source: fiche`, `web/public/img/fiches/<id>.jpg`, at most 960 px, metadata stripped, credited to the fiche). Prefer photos of objects, gestures or events over close portraits; never a photo where a child is identifiable.

## Conventions

- Code, comments, commits and docs in English; README bilingual (EN then FR); UI strings only in `web/src/i18n/*.ts`.
- Pinned dependency versions; minimal dependencies; small tested functions.
- Element titles stay in French; EN summaries are drafts (`lang_review: draft`) until Paul reviews them.
- Record non-trivial decisions in `docs/decisions.md`.
- Product priority (Paul): the whole inventory comes first; yearly events are a secondary "agenda" view.
