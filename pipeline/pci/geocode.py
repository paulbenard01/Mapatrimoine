"""Geocode curated places with geo.api.gouv.fr into the committed data/geocode-cache.json.

A place is one of:
  {commune: "Perpignan", department: "66"}  -> commune centre      (precision: commune)
  {insee: "66136"}                          -> commune centre      (precision: commune)
  {department: "66"}                        -> mean of commune centres (precision: department)
  {region: "76"}                            -> mean of commune centres (precision: region)
The API has no département/region centre, so the mean of commune centres stands in for it."""

import json
import logging
import unicodedata
from urllib.parse import quote

from pci import DATA
from pci.http import FetchError, PoliteClient

API = "https://geo.api.gouv.fr"
CACHE_PATH = DATA / "geocode-cache.json"
# Overseas départements and collectivities (INSEE codes start with 97/98).
OVERSEAS_PREFIXES = ("97", "98")

log = logging.getLogger(__name__)


class GeocodeError(Exception):
    pass


def place_key(place: dict) -> str:
    if place.get("insee"):
        return f"insee:{place['insee']}"
    if place.get("commune"):
        return f"commune:{place['department']}:{_fold(place['commune'])}"
    if place.get("department"):
        return f"department:{place['department']}"
    if place.get("region"):
        return f"region:{place['region']}"
    raise GeocodeError(f"place needs insee, commune+department, department or region: {place}")


def _fold(name: str) -> str:
    """Case/accent/hyphen-insensitive key for commune names."""
    text = unicodedata.normalize("NFKD", name)
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    return " ".join(text.replace("-", " ").replace("’", "'").split())


def load_cache() -> dict[str, dict]:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    return {}


def save_cache(cache: dict[str, dict]) -> None:
    CACHE_PATH.write_text(
        json.dumps(dict(sorted(cache.items())), ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
    )


def mean_centre(communes: list[dict]) -> tuple[float, float]:
    points = [c["centre"]["coordinates"] for c in communes if c.get("centre")]
    if not points:
        raise GeocodeError("no commune centres")
    lon = sum(p[0] for p in points) / len(points)
    lat = sum(p[1] for p in points) / len(points)
    return round(lat, 4), round(lon, 4)


def _get_json(client: PoliteClient, path: str):
    return json.loads(client.get(API + path).decode("utf-8"))


def resolve(place: dict, client: PoliteClient) -> dict:
    """Query the API for one place. Returns {label, lat, lon, precision, insee?, overseas}."""
    fields = "nom,code,centre,codeDepartement,codeRegion"
    if place.get("insee") or place.get("commune"):
        if place.get("insee"):
            communes = [_get_json(client, f"/communes/{place['insee']}?fields={fields}")]
        else:
            found = _get_json(
                client,
                f"/communes?nom={quote(place['commune'])}"
                f"&codeDepartement={place['department']}&fields={fields}&limit=5",
            )
            wanted = _fold(place["commune"])
            communes = [c for c in found if _fold(c["nom"]) == wanted] or found[:1]
        if not communes:
            raise GeocodeError(f"commune not found: {place}")
        c = communes[0]
        lon, lat = c["centre"]["coordinates"]
        return {
            "label": c["nom"],
            "lat": round(lat, 4),
            "lon": round(lon, 4),
            "precision": "commune",
            "insee": c["code"],
            "overseas": c["code"].startswith(OVERSEAS_PREFIXES),
        }
    if place.get("department"):
        code = place["department"]
        dep = _get_json(client, f"/departements/{code}?fields=nom,code")
        lat, lon = mean_centre(_get_json(client, f"/departements/{code}/communes?fields=centre"))
        return {
            "label": dep["nom"],
            "lat": lat,
            "lon": lon,
            "precision": "department",
            "overseas": code.startswith(OVERSEAS_PREFIXES),
        }
    code = place["region"]
    reg = _get_json(client, f"/regions/{code}?fields=nom,code")
    lat, lon = mean_centre(_get_json(client, f"/communes?codeRegion={code}&fields=centre"))
    return {
        "label": reg["nom"],
        "lat": lat,
        "lon": lon,
        "precision": "region",
        "overseas": int(code) < 10,  # overseas regions are 01-06
    }


def geocode_all(places: list[dict], client: PoliteClient | None = None) -> dict[str, dict]:
    """Fill the cache for every place not yet in it."""
    cache = load_cache()
    client = client or PoliteClient()
    for place in places:
        key = place_key(place)
        if key in cache:
            continue
        try:
            cache[key] = resolve(place, client)
        except (FetchError, GeocodeError, KeyError, ValueError) as exc:
            log.warning("could not geocode %s: %s", key, exc)  # rerun later; never fatal
            continue
        log.info("geocoded %s -> %s", key, cache[key]["label"])
    save_cache(cache)
    return cache


def lookup(place: dict, cache: dict[str, dict]) -> dict:
    """Location for a curated place, from the cache only (the build runs offline)."""
    key = place_key(place)
    if key not in cache:
        raise GeocodeError(f"{key} is not in data/geocode-cache.json; run `pci geocode`")
    location = dict(cache[key])
    if place.get("label"):
        location["label"] = place["label"]
    return location
