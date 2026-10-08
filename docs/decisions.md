# Decision log

Format: decision. Why. Alternative rejected.

## M0 scaffold

- **Code licence MIT replaces the initial CC0 `LICENSE`** (Paul to confirm). The brief asks for MIT code; data is covered separately by `DATA_NOTICE.md`. Rejected: keeping CC0, which the brief did not ask for.
- **Single repo, `pyproject.toml` at root, package in `pipeline/pci`, site in `web/`.** One `pip install -e .` and one `npm ci` set everything up. Rejected: separate repos or a monorepo tool (gold-plating).
- **Pinned versions released at least ~2 weeks before 2026-10-08** (vite 8.3.0, vitest 5.0.1, maplibre-gl 6.10.0, typescript 6.0.3). Fresh releases are riskier; TypeScript 7 (native port) avoided for the same reason. Rejected: `latest`.
- **`playwright@1.56.1` as dev dependency** because the pre-installed Chromium (`chromium-1194`) matches that release, so no `playwright install`. Rejected: latest Playwright (would need a browser download).
- **`web/.npmrc` sets `legacy-peer-deps=true`.** npm 10.9.4 crashes (`Cannot read properties of null (reading 'edgesOut')`) resolving vitest's optional peers; with the flag `npm ci` works. Rejected: downgrading vitest (same crash on 4.1.11).
- **Vite `base: "./"`** so the build works at any GitHub Pages path (repo name casing). Rejected: hard-coding `/Mapatrimoine/`.
- **Scrubber test scans committed files under `data/`, `web/public/data/` and test fixtures** (via `git ls-files`), matching emails and French/international phone patterns, with negative tests for IDs, coordinates and dates. Rejected: scanning the working tree (would flag the ignored raw text).

## M1 index

- **IDs are normalised, the published form is kept.** The page has `010_67717_..._00116` (Bayonne) and `202 3 _67717_..._005 20` (Rod lo gèp); we strip spaces and repair a 3-digit year to `2010`, storing `id_as_published`. Rejected: dropping them (they are real, published elements).
- **543 elements, 7 themes** on 2026-10-08 (the brief expected ~540). Six IDs appear under two themes; `theme` is the first heading, `themes` keeps both. Rejected: duplicating records.
- **Unpublished flag comes from the official "Liste exhaustive" PDF (July 2024)**, read with `pdftotext -bbox` (pypdf fallback) by attaching each "Fiche dépubliée" marker to the nearest ID above it in the same column. It finds 00004, 00085 and 00442; none of them is listed on the page any more, so the flag is a safeguard. Elements added or unpublished after July 2024 are not covered by the PDF; M2 also checks each fiche's text for the marker. Rejected: bracket heuristics on the flattened text (columns interleave).
- **The list PDF link is matched on the word "Liste"** (word boundary). A plain substring matched "éventail*listes*".
- **One element has no fiche link** (`2008_..._00019`, dentelle du Puy): `fiche_url: null`, never guessed.
- **User-Agent** names the project and its GitHub URL, no personal email.

## M3 recurrence engine

- **Calendar dates are UTC midnights exchanged as `YYYY-MM-DD` strings.** String comparison then orders dates, and no local time zone or DST shift can move a day. Rejected: a date library (one more dependency for ~100 lines of logic).
- **`nextOccurrence` returns the occurrence in progress if `today` falls inside it** (including one that started the previous year, for example the Provençal Christmas season, 4 December to 2 February), otherwise the next start. Rejected: "next start only", which would hide an ongoing festival.
- **"Movable feast" means Easter-relative (`easter_offset`).** `nth_weekday` dates also change every year, but they are not movable feasts in the liturgical sense; the UI shows them as normal dated events. A fixed 29 February only occurs in leap years.
- **`duration_days` counts the first day** (1 = single day), as in the schema.
