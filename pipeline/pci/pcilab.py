"""PCI Lab (pci-lab.fr), the Ministère de la Culture / CIRDOC online edition of the inventory.

Its map page embeds one point per published fiche, and each fiche page carries the
fiche's "Localisation (région, département, municipalité)" field as text. We keep only
that field, the title, the page URL and the banner image URL: no description text and
no names of people (the "Personne(s) rencontrée(s)" field sits just before it).
"""

import html
import json
import logging
import re

from pci import DATA
from pci.http import FetchError, PoliteClient

BASE = "https://www.pci-lab.fr"
MAP_URL = f"{BASE}/cartographie"
# Local only: PCI Lab titles can name private individuals (craftspeople's workshops).
PCILAB_JSON = DATA / "raw" / "pcilab.json"

log = logging.getLogger(__name__)


def _text(fragment: str) -> str:
    fragment = re.sub(r"<(script|style)\b.*?</\1>", " ", fragment, flags=re.S)
    text = html.unescape(re.sub(r"<[^>]+>", "\n", fragment)).replace("\xa0", " ")
    lines = (re.sub(r"\s+", " ", line).strip() for line in text.split("\n"))
    return "\n".join(line for line in lines if line)


def parse_map(page: str) -> list[dict]:
    """The map page's embedded GeoJSON -> [{fid, title, lat, lon, image}]."""
    start = page.index('"data":{"type":"FeatureCollection"') + len('"data":')
    data, _ = json.JSONDecoder().raw_decode(page[start:])
    points = []
    for feature in data["features"]:
        desc = feature["properties"]["description"]
        fid = re.search(r"/fiche/(\d+)", desc)
        title = re.search(r'title="([^"]*)"', desc)
        if not fid or not title:
            continue
        lon, lat = feature["geometry"]["coordinates"][:2]
        img = re.search(r'<img src="([^"#?]+)', desc)
        points.append(
            {
                "fid": int(fid.group(1)),
                "title": html.unescape(title.group(1)).replace("\xa0", " ").strip(),
                "lat": round(lat, 5),
                "lon": round(lon, 5),
                "image": _absolute(img.group(1)) if img else None,
            }
        )
    return points


def _absolute(src: str) -> str:
    return src if src.startswith("http") else BASE + src


# Field labels vary across fiche generations; the value runs until the next field label.
LOCALISATION = re.compile(
    r"(?:Localisation(?: physique)?(?: de l[’']élément)?(?: \(région, département, [^)\n]*\)?)?"
    r"|Localisation générale|Municipalité, vallée, pays, communauté de communes, lieu-dit…)"
    r"[ :]*\n(?P<value>.{1,900}?)\n"
    r"(?=Indexation|Description|Dates et lieu|Historique|Personne|Adresse"
    r"|Données techniques|Lieu d['’]exercice|Ville|Code postal|$)",
    re.S,
)


def parse_fiche(page: str) -> dict:
    """A fiche page -> {localisation, banner}. Missing fields are None.

    The localisation is free text (a place list or prose); it is used locally to write
    data/places.yaml by hand and is not committed."""
    loc = LOCALISATION.search(_text(page))
    value = re.sub(r"\s+", " ", loc.group("value")).strip(" :.") if loc else None
    # The element's own banner is the first fiche image on the page (related fiches follow).
    banner = re.search(r'<img src="(/images/fiches/[^"#?]+)', page)
    return {"localisation": value or None, "banner": _absolute(banner.group(1)) if banner else None}


def fiche_url(fid: int) -> str:
    return f"{BASE}/fiche-d-inventaire/fiche/{fid}"


def fetch_pcilab(client: PoliteClient | None = None) -> list[dict]:
    client = client or PoliteClient(min_interval=1.5)
    points = parse_map(client.get(MAP_URL).decode("utf-8"))
    records = []
    for point in sorted(points, key=lambda p: p["fid"]):
        record = {**point, "url": fiche_url(point["fid"]), "localisation": None, "banner": None}
        try:
            record.update(parse_fiche(client.get(record["url"]).decode("utf-8")))
        except FetchError as exc:
            log.warning("PCI Lab fiche %s not fetched: %s", point["fid"], exc)
        records.append(record)
    return records
