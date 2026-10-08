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
    if fiche.get("status") != "ok":
        raise BuildError(f"fiche not fetched (status: {fiche.get('status')})")
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
        "source": {"fiche_url": entry["fiche_url"], "fetched_at": fiche["fetched_at"]},
        "review_status": curated["review_status"],
    }


def check(element: dict, validator: Draft202012Validator, text_dir: Path = TEXT_DIR) -> list[str]:
    """Schema errors plus the rules JSON Schema cannot express."""
    problems = [
        f"{'/'.join(map(str, e.absolute_path)) or '(root)'}: {e.message}"
        for e in validator.iter_errors(element)
    ]
    timing = element.get("timing")
    if timing:
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


def inventory(index: dict[str, dict]) -> list[dict]:
    """Every published element of the national inventory (structured facts only)."""
    return [
        {
            "id": e["id"],
            "title_fr": e["title"],
            "themes": e["themes"],
            "year_included": e["year_included"],
            "fiche_url": e["fiche_url"],
        }
        for e in index.values()
        if not e["unpublished"]
    ]


def build_inventory(output: Path = INVENTORY_PATH) -> int:
    index = {e["id"]: e for e in json.loads(INDEX_PATH.read_text(encoding="utf-8"))["elements"]}
    entries = inventory(index)
    payload = {"source": "data/index.json", "count": len(entries), "elements": entries}
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    return len(entries)


def all_places() -> list[dict]:
    return [place for curated in load_curated() for place in curated["places"]]
