# CLAUDE.md

PCI Map: an interactive bilingual (FR/EN) map of France's national Inventaire du patrimoine culturel immatériel (PCI) and its yearly events. Independent portfolio project by Paul Benard; public documents only.

## Hard rules

1. Never commit raw fiche PDFs, full extracted fiche text or personal data (names of private individuals, emails, phones). `data/raw/` and `data/text/` are git-ignored. Commit only structured facts, own-words summaries, quotes of at most 25 words and links to the official fiche.
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
data/curated/<id>.yaml    hand-curated pilot elements (committed)
data/geocode-cache.json   geocoding cache (committed)
data/pilot.txt            pilot element IDs; data/fiches-manifest.json fetch/text status (committed)
data/raw/, data/text/     downloaded PDFs and extracted text (ignored)
web/                      Vite + TypeScript + MapLibre site; web/public/data/elements.json is built by `pci build`
docs/decisions.md         decision log (decision, why, alternative rejected)
docs/screenshots/         Playwright screenshots
```

## Commands

```sh
# pipeline
python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'
.venv/bin/pci fetch-index      # inventory page + official list PDF -> data/index.json
.venv/bin/pci fetch-fiches     # pilot fiches -> data/raw/ (cached)
.venv/bin/pci extract-text     # -> data/text/
.venv/bin/pci geocode          # curated places -> data/geocode-cache.json (network)
.venv/bin/pci build            # validate data/curated (offline) -> web/public/data/elements.json
.venv/bin/pytest -q && .venv/bin/ruff check . && .venv/bin/ruff format --check .

# web (in web/)
npm ci           # .npmrc sets legacy-peer-deps (npm 10 arborist bug with vitest peers)
npm run dev
npm test         # vitest
npm run build    # tsc + vite build
npm run screenshots   # needs `npm run preview` running; writes docs/screenshots/
```

## Curation workflow

1. Add the ID to `data/pilot.txt`; run `pci fetch-fiches` then `pci extract-text`.
2. Read `data/text/<id>.txt` (pages split by form feeds) and `<id>.facts.json`.
3. Write `data/curated/<id>.yaml`: `kind`, `domain`, `summary` (fr/en, own words, `lang_review: draft`), `places` (`{commune, department}`, `{department}` or `{region}`), `recurrence` (null for practices), `timing` (quote ≤ 25 words, 1-based page), `review_status: unreviewed`. Use `>-` block scalars for prose (French " : " breaks plain YAML).
4. `pci geocode && pci build`: the build validates the schema and checks each quote on its page.

## Conventions

- Code, comments, commits and docs in English; README bilingual (EN then FR); UI strings only in `web/src/i18n/*.ts`.
- Pinned dependency versions; minimal dependencies; small tested functions.
- Element titles stay in French; EN summaries are drafts (`lang_review: draft`) until Paul reviews them.
- Record non-trivial decisions in `docs/decisions.md`.
