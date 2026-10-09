"""UNESCO inscriptions (data/unesco.yaml): which inventory elements are (part of) an element
France has inscribed on a UNESCO intangible cultural heritage list.

`inscriptions` holds each inscription as UNESCO publishes it (names, list, year, page);
`elements` maps inventory IDs to an inscription. One inscription can cover several fiches
(e.g. the processional giants of Cassel, Douai, Pézenas and Tarascon). `uncertain` and
`unmatched` record the cases left unflagged, for review.
"""

from pci import DATA

UNESCO_PATH = DATA / "unesco.yaml"
LISTS = {"RL", "USL", "GSP"}
URL_PREFIX = "https://ich.unesco.org/"
FIELDS = {"name_en", "name_fr", "list", "year", "url", "multinational"}


def check_unesco(data: dict, published: set[str]) -> list[str]:
    problems = []
    inscriptions = data.get("inscriptions") or {}
    for key, ins in inscriptions.items():
        if set(ins) - FIELDS or not {"name_en", "list", "year", "url"} <= set(ins):
            problems.append(f"unesco {key}: fields must be {sorted(FIELDS)}")
            continue
        if ins["list"] not in LISTS:
            problems.append(f"unesco {key}: list must be one of {sorted(LISTS)}")
        if not isinstance(ins["year"], int) or not 2008 <= ins["year"] <= 2100:
            problems.append(f"unesco {key}: year must be an inscription year")
        if not str(ins["url"]).startswith(URL_PREFIX):
            problems.append(f"unesco {key}: url must be a UNESCO page ({URL_PREFIX}...)")
    for ident, entry in (data.get("elements") or {}).items():
        if ident not in published:
            problems.append(f"unesco {ident}: not a published inventory element")
        elif (entry or {}).get("unesco") not in inscriptions:
            problems.append(f"unesco {ident}: unknown inscription {(entry or {}).get('unesco')!r}")
    return problems


def unesco_records(data: dict) -> dict[str, dict]:
    """{inventory id: what the site shows about its inscription}."""
    inscriptions = data.get("inscriptions") or {}
    return {
        ident: {
            "name_en": inscriptions[entry["unesco"]]["name_en"],
            "name_fr": inscriptions[entry["unesco"]].get("name_fr"),
            "list": inscriptions[entry["unesco"]]["list"],
            "year": inscriptions[entry["unesco"]]["year"],
            "url": inscriptions[entry["unesco"]]["url"],
        }
        for ident, entry in (data.get("elements") or {}).items()
    }
