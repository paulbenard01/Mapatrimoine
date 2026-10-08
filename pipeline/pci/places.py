"""Places and images for every inventory element (data/places.yaml, data/images.yaml).

Curated elements carry their own places; places.yaml covers the rest of the inventory so
that every element can be put on the map. Each entry lists one or more places (any form
accepted by pci.geocode) and where they come from:
  pcilab: <id>      the element's page on PCI Lab, whose "Localisation" field was read
  sources: [...]    pages read online ({publisher, url}), e.g. the official fiche
images.yaml gives one picture per element: a Wikimedia Commons file (preferred), the
fiche image shown on PCI Lab, or, when neither exists, a photo taken from the fiche PDF and
served by the site from web/public/img/fiches/ (credited to the fiche, metadata stripped).
"""

import re

import yaml

from pci import DATA, ROOT
from pci.geocode import GeocodeError, place_key
from pci.pcilab import fiche_url

PLACES_PATH = DATA / "places.yaml"
IMAGES_PATH = DATA / "images.yaml"
FICHE_IMAGES = ROOT / "web" / "public" / "img" / "fiches"
FICHE_SRC = re.compile(r"img/fiches/[0-9A-Z_]+\.jpg")
PLACE_FIELDS = {"places", "pcilab", "sources", "note"}
IMAGE_FIELDS = {"source", "src", "page", "credit", "licence", "licence_url", "alt"}
PCILAB_PUBLISHER = "PCI Lab (ministère de la Culture, CIRDOC)"


class PlacesError(Exception):
    pass


def load_yaml(path) -> dict:
    if not path.exists():
        return {}
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def check_places(entries: dict, known_ids: set[str]) -> list[str]:
    problems = []
    for ident, entry in entries.items():
        if ident not in known_ids:
            problems.append(f"{ident}: not a published inventory element")
            continue
        unknown = set(entry) - PLACE_FIELDS
        if unknown:
            problems.append(f"{ident}: unknown fields {sorted(unknown)}")
        if not entry.get("places"):
            problems.append(f"{ident}: no places")
        for place in entry.get("places") or []:
            try:
                place_key(place)
            except GeocodeError as exc:
                problems.append(f"{ident}: {exc}")
        if not entry.get("pcilab") and not entry.get("sources"):
            problems.append(f"{ident}: needs pcilab or sources")
        for source in entry.get("sources") or []:
            if not str(source.get("url", "")).startswith("https://") or not source.get("publisher"):
                problems.append(f"{ident}: each source needs a publisher and an https url")
    return problems


def location_sources(entry: dict) -> list[dict]:
    """Where an element's places come from, as shown on the site."""
    if entry.get("sources"):
        return [{"kind": "web", **s} for s in entry["sources"]]
    return [{"kind": "pcilab", "url": fiche_url(entry["pcilab"]), "publisher": PCILAB_PUBLISHER}]


def check_images(images: dict, known_ids: set[str]) -> list[str]:
    problems = []
    for ident, image in images.items():
        if ident not in known_ids:
            problems.append(f"{ident}: not a published inventory element")
            continue
        unknown = set(image) - IMAGE_FIELDS
        if unknown:
            problems.append(f"{ident}: unknown image fields {sorted(unknown)}")
        source = image.get("source")
        if source not in ("commons", "pcilab", "fiche"):
            problems.append(f"{ident}: image source must be commons, pcilab or fiche")
        src = str(image.get("src", ""))
        if source == "fiche":
            if src != f"img/fiches/{ident}.jpg" or not FICHE_SRC.fullmatch(src):
                problems.append(f"{ident}: fiche image src must be img/fiches/{ident}.jpg")
            elif not (FICHE_IMAGES / f"{ident}.jpg").exists():
                problems.append(f"{ident}: {src} is missing from web/public")
        elif not src.startswith("https://"):
            problems.append(f"{ident}: image src must be an https url")
        if not str(image.get("page", "")).startswith("https://"):
            problems.append(f"{ident}: image page must be an https url")
        if not image.get("credit"):
            problems.append(f"{ident}: image needs a credit")
        if image.get("source") == "commons" and not image.get("licence"):
            problems.append(f"{ident}: Commons image needs its licence")
    return problems


def picture(image: dict, title: str) -> dict:
    return {
        "src": image["src"],
        "page": image["page"],
        "source": image["source"],
        "credit": image["credit"],
        "licence": image.get("licence"),
        "licence_url": image.get("licence_url"),
        "alt": image.get("alt") or title,
    }
