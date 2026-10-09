"""Announced dates from DATAtourisme (milestone M5): data/announced.yaml -> announced.json.

DATAtourisme, the national open database of tourist information (Licence Ouverte 2.0),
publishes a daily CSV of every event that tourist offices list ("fêtes et manifestations",
FMA) on data.gouv.fr. No account or key is needed. The site's scheduled deploy downloads
it at build time (never the browser) and keeps, for each documented event, the listed
events whose title contains one of the element's search terms near one of its places.

Only the event title, its periods, its commune, a link and the publishing tourist office
are kept: never the contacts, addresses or descriptions (which can name people).
"""

import csv
import json
import logging
import math
import re
import unicodedata
from collections.abc import Iterable, Iterator
from datetime import date
from pathlib import Path

from pci import DATA, ROOT
from pci.places import load_yaml

ANNOUNCED_RULES = DATA / "announced.yaml"
ANNOUNCED_JSON = ROOT / "web" / "public" / "data" / "announced.json"
FMA_CSV = DATA / "raw" / "datatourisme" / "fma.csv"
DATASET_API = "https://www.data.gouv.fr/api/1/datasets/5b598be088ee387c0c353714/"
DATASET_PAGE = "https://www.data.gouv.fr/datasets/5b598be088ee387c0c353714/"
FMA_TITLE = "datatourisme-fma.csv"
DEFAULT_RADIUS_KM = 20
MAX_PER_ELEMENT = 6
URL = re.compile(r"https?://[^\s#|<>]+")

log = logging.getLogger(__name__)


class AnnouncedError(Exception):
    pass


def fold(text: str) -> str:
    """Lower case, no accents, typographic apostrophes and dashes made plain."""
    text = unicodedata.normalize("NFKD", text.replace("’", "'").replace("œ", "oe"))
    return "".join(c for c in text if not unicodedata.combining(c)).lower()


def km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 6371 * 2 * math.asin(math.sqrt(h))


def parse_periods(value: str) -> list[tuple[str, str]]:
    """ "2026-08-20<->2026-08-21|2026-09-03<->2026-09-03" -> [(start, end), ...] (ISO dates)."""
    periods = []
    for part in value.split("|"):
        m = re.fullmatch(r"\s*(\d{4}-\d{2}-\d{2})<->(\d{4}-\d{2}-\d{2})\s*", part)
        if m and m.group(1) <= m.group(2):
            periods.append((m.group(1), m.group(2)))
    return sorted(set(periods))


def first_url(contacts: str) -> str | None:
    """The first web address in the contacts field (names, emails and phones are dropped)."""
    for url in URL.findall(contacts):
        if url.startswith("https://") or url.startswith("http://"):
            return url
    return None


def read_fma(path: Path = FMA_CSV) -> Iterator[dict]:
    csv.field_size_limit(1 << 30)
    with path.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            try:
                point = (float(row["Latitude"]), float(row["Longitude"]))
            except (TypeError, ValueError):
                continue
            periods = parse_periods(row.get("Periodes_regroupees") or "")
            # Exhibitions about a tradition are not the tradition itself.
            if not periods or "#Exhibition" in (row.get("Categories_de_POI") or ""):
                continue
            yield {
                "title": " ".join((row.get("Nom_du_POI") or "").split()),
                "point": point,
                "commune": (row.get("Code_postal_et_commune") or "").partition("#")[2].strip(),
                "periods": periods,
                "url": first_url(row.get("Contacts_du_POI") or ""),
                "publisher": (row.get("SIT_diffuseur") or "").strip(),
                "uri": (row.get("URI_ID_du_POI") or "").strip(),
            }


def check_rules(rules: dict, events: set[str]) -> list[str]:
    problems = []
    for ident, rule in rules.items():
        if ident not in events:
            problems.append(f"{ident}: not a documented event")
            continue
        terms = rule.get("terms") or []
        if not terms or not all(isinstance(t, str) and len(t) >= 4 for t in terms):
            problems.append(f"{ident}: terms must be a list of strings of 4+ characters")
        if set(rule) - {"terms", "radius_km"}:
            problems.append(f"{ident}: unknown fields {sorted(set(rule) - {'terms', 'radius_km'})}")
        radius = rule.get("radius_km", DEFAULT_RADIUS_KM)
        if not isinstance(radius, int | float) or not 1 <= radius <= 100:
            problems.append(f"{ident}: radius_km must be between 1 and 100")
    return problems


def match(rules: dict, elements: list[dict], rows: Iterable[dict], since: str) -> dict:
    """{element id: [announced events]}, periods ending on or after `since` (ISO date)."""
    targets = []
    for element in elements:
        rule = rules.get(element["id"])
        if not rule:
            continue
        points = [(loc["lat"], loc["lon"]) for loc in element["locations"]]
        terms = [fold(t) for t in rule["terms"]]
        targets.append((element["id"], terms, points, rule.get("radius_km", DEFAULT_RADIUS_KM)))
    found: dict[str, dict[tuple, dict]] = {}
    for row in rows:
        periods = [p for p in row["periods"] if p[1] >= since]
        if not periods:
            continue
        title = fold(row["title"])
        for ident, terms, points, radius in targets:
            if not any(t in title for t in terms):
                continue
            if not any(km(row["point"], p) <= radius for p in points):
                continue
            key = (title, periods[0][0], row["commune"])
            found.setdefault(ident, {}).setdefault(
                key,
                {
                    "title": row["title"],
                    "commune": row["commune"],
                    "periods": [{"start": s, "end": e} for s, e in periods],
                    "url": row["url"],
                    "publisher": row["publisher"],
                },
            )
    return {
        ident: sorted(events.values(), key=lambda e: (e["periods"][0]["start"], e["title"]))[
            :MAX_PER_ELEMENT
        ]
        for ident, events in sorted(found.items())
    }


def build_announced(
    elements: list[dict],
    since: date,
    csv_path: Path = FMA_CSV,
    output: Path = ANNOUNCED_JSON,
    rules_path: Path = ANNOUNCED_RULES,
) -> int:
    """Write announced.json; returns the number of elements with announced dates."""
    rules = load_yaml(rules_path)
    problems = check_rules(rules, {e["id"] for e in elements if e["kind"] == "event"})
    if problems:
        raise AnnouncedError("\n".join(problems))
    announced = match(rules, elements, read_fma(csv_path), since.isoformat())
    payload = {
        "source": "DATAtourisme",
        "source_url": DATASET_PAGE,
        "licence": "Licence Ouverte / Open Licence 2.0",
        "generated_on": since.isoformat(),
        "elements": announced,
    }
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return len(announced)


def fma_url(dataset: dict) -> str:
    for resource in dataset.get("resources", []):
        if resource.get("title") == FMA_TITLE:
            return resource["url"]
    raise AnnouncedError(f"{FMA_TITLE} not found in the DATAtourisme dataset")


def fetch_fma(client=None, path: Path = FMA_CSV) -> Path:
    """Download today's FMA export (~60 MB). Its URL changes daily: ask data.gouv.fr."""
    from pci.http import PoliteClient

    client = client or PoliteClient()
    dataset = json.loads(client.get(DATASET_API, refresh=True).decode("utf-8"))
    url = fma_url(dataset)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(client.get(url))  # the URL changes daily, so the cache stays fresh
    log.info("DATAtourisme FMA export -> %s", path)
    return path
