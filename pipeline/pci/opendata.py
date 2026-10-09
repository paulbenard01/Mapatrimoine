"""Open data export: the site's structured data as CSV and JSON for reuse.

Written next to the site (web/public/data/open/) from the files `pci build` just produced.
It republishes only what the site already shows: official names, IDs, themes, years,
places, our own summaries, UNESCO inscriptions, dating rules and links. No fiche text,
no pictures (their credits and licences differ) and no personal data.
"""

import csv
import io
import json
from pathlib import Path

from pci import ROOT

OPEN_DIR = ROOT / "web" / "public" / "data" / "open"
CSV_NAME = "pci-inventaire.csv"
JSON_NAME = "pci-inventaire.json"
LICENCE = "Licence Ouverte / Open Licence 2.0 (Etalab)"
FIELDS = [
    "id",
    "title_fr",
    "themes",
    "year_included",
    "kind",
    "documented",
    "unesco_list",
    "unesco_year",
    "unesco_url",
    "places",
    "lat",
    "lon",
    "summary_fr",
    "summary_en",
    "recurrence",
    "fiche_url",
    "worksheet",
]


def records(inventory: list[dict], elements: list[dict], sheets: set[str]) -> list[dict]:
    curated = {e["id"]: e for e in elements}
    rows = []
    for entry in sorted(inventory, key=lambda e: e["id"]):
        element = curated.get(entry["id"])
        locations = element["locations"] if element else entry["locations"]
        summary = element["summary"] if element else entry.get("summary") or {}
        unesco = entry.get("unesco") or {}
        rows.append(
            {
                "id": entry["id"],
                "title_fr": entry["title_fr"],
                "themes": entry["themes"],
                "year_included": entry["year_included"],
                "kind": element["kind"] if element else entry.get("kind"),
                "documented": bool(element),
                "unesco_list": unesco.get("list"),
                "unesco_year": unesco.get("year"),
                "unesco_url": unesco.get("url"),
                "places": [
                    {k: loc[k] for k in ("label", "lat", "lon", "precision") if k in loc}
                    for loc in locations
                ],
                "summary_fr": summary.get("fr"),
                "summary_en": summary.get("en"),
                "recurrence": element.get("recurrence") if element else None,
                "fiche_url": entry.get("fiche_url"),
                "worksheet": entry["id"] in sheets,
            }
        )
    return rows


def to_csv(rows: list[dict]) -> str:
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=FIELDS, lineterminator="\n")
    writer.writeheader()
    for row in rows:
        first = row["places"][0] if row["places"] else {}
        writer.writerow(
            {
                **row,
                "themes": "|".join(row["themes"]),
                "places": "|".join(p["label"] for p in row["places"]),
                "lat": first.get("lat", ""),
                "lon": first.get("lon", ""),
                "recurrence": json.dumps(row["recurrence"], ensure_ascii=False)
                if row["recurrence"]
                else "",
                "documented": "yes" if row["documented"] else "no",
                "worksheet": "yes" if row["worksheet"] else "no",
            }
        )
    return out.getvalue()


def build_opendata(data_dir: Path, out_dir: Path = OPEN_DIR) -> int:
    inventory = json.loads((data_dir / "inventory.json").read_text(encoding="utf-8"))["elements"]
    elements = json.loads((data_dir / "elements.json").read_text(encoding="utf-8"))["elements"]
    sheets = set(json.loads((data_dir / "mediation.json").read_text(encoding="utf-8"))["sheets"])
    rows = records(inventory, elements, sheets)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / CSV_NAME).write_text(to_csv(rows), encoding="utf-8")
    payload = {
        "title": "Carte du PCI / PCI Map: Inventaire national du patrimoine culturel immatériel",
        "source": "Ministère de la Culture, Inventaire national du PCI; places from PCI Lab "
        "and the fiches; summaries written for PCI Map (drafts)",
        "licence": LICENCE,
        "fields": FIELDS,
        "count": len(rows),
        "elements": rows,
    }
    (out_dir / JSON_NAME).write_text(
        json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    return len(rows)
