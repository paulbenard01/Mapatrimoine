"""Merge index + manifest + curated YAML + geocode cache into web/public/data/elements.json."""

import json
import re
import unicodedata
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator, FormatChecker

from pci import DATA, ROOT, SCHEMA
from pci.fiches import MANIFEST_PATH, TEXT_DIR
from pci.geocode import load_cache, lookup
from pci.index import INDEX_PATH
from pci.places import (
    IMAGES_PATH,
    PLACES_PATH,
    check_images,
    check_places,
    load_yaml,
    location_sources,
    picture,
)
from pci.summaries import SUMMARIES_PATH, check_summaries, summary_record

CURATED_DIR = DATA / "curated"
OUTPUT_PATH = ROOT / "web" / "public" / "data" / "elements.json"
INVENTORY_PATH = ROOT / "web" / "public" / "data" / "inventory.json"
MAX_QUOTE_WORDS = 25
# Fields a curated file may set. title_fr/theme/year/source come from the index and manifest.
CURATED_FIELDS = {
    "id",
    "kind",
    "domain",
    "summary",
    "places",
    "recurrence",
    "timing",
    "review_status",
    "title_fr",
    "theme",
    "fiche_read",
}


class BuildError(Exception):
    pass


def word_count(text: str) -> int:
    return len(re.findall(r"\w+(?:[’'-]\w+)*", text))


def _fold(text: str) -> str:
    """Compare quotes with extracted text: ignore case, accents, quotes, hyphenation, spaces."""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    text = re.sub(r"[«»\"“”’'`]", "", text)
    text = re.sub(r"-\s*\n\s*", "", text)
    return re.sub(r"[\s-]+", "", text)


def quote_in_text(quote: str, text: str) -> bool:
    return _fold(quote) in _fold(text)


def load_curated(directory: Path = CURATED_DIR) -> list[dict]:
    items = []
    for path in sorted(directory.glob("*.yaml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        if data.get("id") != path.stem:
            raise BuildError(f"{path.name}: id must match the file name")
        unknown = set(data) - CURATED_FIELDS
        if unknown:
            raise BuildError(f"{path.name}: unknown fields {sorted(unknown)}")
        items.append(data)
    return items


def compose(curated: dict, index: dict, manifest: dict, cache: dict) -> dict:
    ident = curated["id"]
    entry = index.get(ident)
    if entry is None:
        raise BuildError("not in data/index.json")
    if entry["unpublished"]:
        raise BuildError("fiche unpublished at the bearers' request; must be excluded")
    fiche = manifest.get(ident, {})
    if fiche.get("unpublished_marker"):
        raise BuildError("fiche text carries an unpublished marker; must be excluded")
    # fiche_read: false = curated from online sources because the PDF could not be downloaded;
    # the site says so, and every such entry needs web sources for its timing.
    fiche_read = curated.get("fiche_read", True)
    if fiche_read and fiche.get("status") != "ok":
        raise BuildError(f"fiche not fetched (status: {fiche.get('status')})")
    if not fiche_read and not (curated.get("timing") or {}).get("web_sources"):
        raise BuildError("fiche_read: false requires timing.web_sources")
    return {
        "id": ident,
        "title_fr": curated.get("title_fr") or entry["title"],
        "theme": curated.get("theme") or entry["theme"],
        "domain": curated["domain"],
        "year_included": entry["year_included"],
        "kind": curated["kind"],
        "summary": curated["summary"],
        "locations": [lookup(place, cache) for place in curated["places"]],
        "recurrence": curated.get("recurrence"),
        "timing": curated.get("timing"),
        "source": {
            "fiche_url": entry["fiche_url"],
            "fetched_at": fiche.get("fetched_at") if fiche_read else None,
            "fiche_read": fiche_read,
        },
        "review_status": curated["review_status"],
    }


def check(element: dict, validator: Draft202012Validator, text_dir: Path = TEXT_DIR) -> list[str]:
    """Schema errors plus the rules JSON Schema cannot express."""
    problems = [
        f"{'/'.join(map(str, e.absolute_path)) or '(root)'}: {e.message}"
        for e in validator.iter_errors(element)
    ]
    timing = element.get("timing")
    if timing and timing.get("evidence_quote"):
        quote = timing["evidence_quote"]
        if word_count(quote) > MAX_QUOTE_WORDS:
            problems.append(f"evidence_quote has {word_count(quote)} words (max 25)")
        text_file = text_dir / f"{element['id']}.txt"
        if text_file.exists():  # local check only: extracted text is never committed
            pages = text_file.read_text(encoding="utf-8").split("\f")
            page = timing["evidence_page"]
            if page > len(pages) or not quote_in_text(quote, pages[page - 1]):
                where = [n for n, p in enumerate(pages, 1) if quote_in_text(quote, p)]
                problems.append(f"evidence_quote not found on page {page} (found on {where})")
    return problems


def build(output: Path = OUTPUT_PATH) -> list[dict]:
    index = {e["id"]: e for e in json.loads(INDEX_PATH.read_text(encoding="utf-8"))["elements"]}
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    cache = load_cache()
    schema = json.loads((SCHEMA / "element.schema.json").read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    elements, errors = [], []
    for curated in load_curated():
        try:
            element = compose(curated, index, manifest, cache)
        except Exception as exc:  # noqa: BLE001 - report every file, then fail once
            errors.append(f"{curated.get('id')}: {exc}")
            continue
        errors += [f"{element['id']}: {p}" for p in check(element, validator)]
        elements.append(element)
    if errors:
        raise BuildError("\n".join(errors))
    output.parent.mkdir(parents=True, exist_ok=True)
    payload = {"generated_from": "data/curated", "count": len(elements), "elements": elements}
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return elements


def inventory(
    index: dict[str, dict], places: dict, images: dict, cache: dict, summaries: dict | None = None
) -> list[dict]:
    """Every published element of the national inventory (structured facts only), with
    its places on the map (documented elements carry theirs in elements.json) and image."""
    entries = []
    for e in index.values():
        if e["unpublished"]:
            continue
        located = places.get(e["id"])
        image = images.get(e["id"])
        short = (summaries or {}).get(e["id"])
        entries.append(
            {
                "id": e["id"],
                "title_fr": e["title"],
                "themes": e["themes"],
                "year_included": e["year_included"],
                "fiche_url": e["fiche_url"],
                "locations": [lookup(p, cache) for p in located["places"]] if located else [],
                "location_sources": location_sources(located) if located else [],
                "image": picture(image, e["title"]) if image else None,
                "kind": short["kind"] if short else None,
                **(summary_record(short, located, e["fiche_url"]) if short else {}),
            }
        )
    return entries


def build_inventory(output: Path = INVENTORY_PATH) -> int:
    index = {e["id"]: e for e in json.loads(INDEX_PATH.read_text(encoding="utf-8"))["elements"]}
    published = {i for i, e in index.items() if not e["unpublished"]}
    places, images = load_yaml(PLACES_PATH), load_yaml(IMAGES_PATH)
    summaries = load_yaml(SUMMARIES_PATH)
    curated = {c["id"] for c in load_curated()}
    problems = check_places(places, published) + check_images(images, published)
    problems += check_summaries(summaries, published, curated, places)
    problems += [
        f"{i}: curated elements keep their places in data/curated" for i in places if i in curated
    ]
    if problems:
        raise BuildError("\n".join(problems))
    try:
        entries = inventory(index, places, images, load_cache(), summaries)
    except Exception as exc:  # noqa: BLE001 - a place missing from the geocode cache
        raise BuildError(str(exc)) from exc
    payload = {"source": "data/index.json", "count": len(entries), "elements": entries}
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    return len(entries)


def all_places() -> list[dict]:
    curated = [place for c in load_curated() for place in c["places"]]
    located = [place for entry in load_yaml(PLACES_PATH).values() for place in entry["places"]]
    return curated + located
