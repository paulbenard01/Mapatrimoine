"""Short summaries for the elements not curated yet (milestone M7): data/summaries.yaml.

Curated files (data/curated) hold the full record: summary, places, timing and evidence.
Writing them for 540 elements takes time, so every other element can first get a short
own-words summary and its kind, read from the fiche text PCI Lab publishes or from the
official fiche. The site shows it with its source; no date is ever derived from it.
"""

import json

from jsonschema import Draft202012Validator

from pci import DATA, SCHEMA
from pci.pcilab import fiche_url
from pci.places import PCILAB_PUBLISHER

SUMMARIES_PATH = DATA / "summaries.yaml"
FICHE_PUBLISHER = "Fiche d'inventaire (ministère de la Culture)"


def check_summaries(
    entries: dict, published: set[str], curated: set[str], places: dict
) -> list[str]:
    schema = json.loads((SCHEMA / "summary.schema.json").read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)
    problems = []
    for ident, entry in entries.items():
        if ident not in published:
            problems.append(f"{ident}: not a published inventory element")
            continue
        if ident in curated:
            problems.append(f"{ident}: curated elements keep their summary in data/curated")
        problems += [
            f"{ident}: {'/'.join(map(str, e.absolute_path)) or '(root)'}: {e.message}"
            for e in validator.iter_errors(entry)
        ]
        if entry.get("read") == "pcilab" and not places.get(ident, {}).get("pcilab"):
            problems.append(f"{ident}: read: pcilab needs a pcilab id in data/places.yaml")
    return problems


def summary_record(entry: dict, places_entry: dict | None, fiche: str | None) -> dict:
    """What the site shows: kind, summary and where the text was read."""
    if entry["read"] == "pcilab":
        source = {"publisher": PCILAB_PUBLISHER, "url": fiche_url(places_entry["pcilab"])}
    else:
        source = {"publisher": FICHE_PUBLISHER, "url": fiche}
    return {
        "summary": entry["summary"],
        "summary_source": source,
        "review_status": entry["review_status"],
    }
