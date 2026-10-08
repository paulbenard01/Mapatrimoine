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
