# PCI Map / Carte du PCI

## English

An interactive, bilingual (FR/EN) map and catalogue of France's national **Inventaire du patrimoine culturel immatériel** (PCI), the official inventory of intangible cultural heritage kept by the Ministère de la Culture.

- **Inventory** (default view): all 543 published elements, searchable and filterable by theme, each linking to its official fiche. A pilot set of 35 elements is documented on the site: own-words summary (FR/EN), location on the map, and timing.
- **Yearly events** (secondary view): the 30 documented events, with a "next occurrence" badge (including movable feasts such as Good Friday, computed from Easter), a 12-month strip and a "this month" filter. Every date shows its evidence from the fiche (short quote, page, confidence) and the disclaimer: *typical timing from the official inventory; confirm exact dates with the organisers.*
- Map with clustering; events are circles and practices are diamonds, coloured by theme (colour-blind-safe palette). "Near me" works on the device only; metropolitan France / overseas switch; shareable URLs; keyboard accessible.
- Privacy: no cookies, analytics or trackers. Map tiles come from [OpenFreeMap](https://openfreemap.org), which sees visitors' IP addresses.

Independent portfolio and cultural-mediation project by Paul Benard (Master's in cultural heritage management, Paris 1 Panthéon-Sorbonne). Not affiliated with the Ministère de la Culture. Data notice: [`DATA_NOTICE.md`](DATA_NOTICE.md). Code: MIT. Roadmap: [`PLAN.md`](PLAN.md). Decisions: [`docs/decisions.md`](docs/decisions.md).

### Run it

Requirements: Python 3.11+, Node 22, and `pdftotext` (poppler) for text extraction (pypdf is the fallback).

```sh
# data pipeline
python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'
.venv/bin/pci fetch-index     # inventory page + official list PDF -> data/index.json
.venv/bin/pci fetch-fiches    # pilot fiches (data/pilot.txt) -> data/raw/ (git-ignored, cached, 1 request / 5 s)
.venv/bin/pci extract-text    # -> data/text/ (git-ignored)
.venv/bin/pci geocode         # curated places -> data/geocode-cache.json (geo.api.gouv.fr)
.venv/bin/pci build           # validate data/curated/*.yaml -> web/public/data/{elements,inventory}.json
.venv/bin/pytest -q && .venv/bin/ruff check . && .venv/bin/ruff format --check .

# website
cd web
npm ci
npm run dev                   # http://localhost:5173 (add ?today=2026-10-08 to pin the clock)
npm test                      # vitest
npm run build                 # type-check + production build in web/dist
npm run preview &             # serve the build on :4173, then:
npm run screenshots           # Playwright screenshots in docs/screenshots + keyboard-only smoke test
```

The committed data (`data/index.json`, `data/curated/`, `data/geocode-cache.json`, `web/public/data/`) is enough to build the site offline; the fetch commands are only needed to refresh or extend it. See [`CLAUDE.md`](CLAUDE.md) for the curation workflow.

### Deploy

`.github/workflows/pages.yml` builds `web/` and publishes it to GitHub Pages on every push to `main`. One-time setup: repository **Settings → Pages → Source: GitHub Actions**.

## Français

Une carte et un catalogue interactifs et bilingues (FR/EN) de l'**Inventaire national du patrimoine culturel immatériel** (PCI) tenu par le ministère de la Culture.

- **Inventaire** (vue par défaut) : les 543 éléments publiés, avec recherche et filtre par domaine, chacun renvoyant à sa fiche officielle. Une sélection pilote de 35 éléments est documentée sur le site : résumé rédigé par nos soins (FR/EN), localisation sur la carte et calendrier.
- **Agenda annuel** (vue secondaire) : les 30 événements documentés, avec la prochaine occurrence (y compris les fêtes mobiles comme le Vendredi saint, calculées depuis Pâques), une frise des 12 mois et un filtre « ce mois-ci ». Chaque date affiche sa source dans la fiche (citation courte, page, fiabilité) et l'avertissement : *dates indicatives tirées de l'Inventaire national ; vérifiez les dates exactes auprès des organisateurs.*
- Carte avec regroupement des points ; événements en cercles, pratiques en losanges, couleur par domaine (palette adaptée au daltonisme). « Autour de moi » est calculé uniquement sur l'appareil ; bascule France métropolitaine / outre-mer ; adresses partageables ; utilisable au clavier.
- Confidentialité : ni cookie, ni mesure d'audience, ni traceur. Les fonds de carte viennent d'[OpenFreeMap](https://openfreemap.org), qui voit l'adresse IP des visiteurs.

Projet indépendant de portfolio et de médiation culturelle de Paul Benard (master de gestion du patrimoine culturel, Paris 1 Panthéon-Sorbonne), sans lien avec le ministère de la Culture. Données : voir [`DATA_NOTICE.md`](DATA_NOTICE.md). Code : licence MIT. Les commandes ci-dessus (section anglaise) installent, testent et construisent le projet ; le déploiement GitHub Pages s'active dans **Settings → Pages → Source : GitHub Actions**.
