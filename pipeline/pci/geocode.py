"""Geocode curated places with geo.api.gouv.fr into the committed data/geocode-cache.json.

A place is one of:
  {commune: "Perpignan", department: "66"}  -> commune centre      (precision: commune)
  {insee: "66136"}                          -> commune centre      (precision: commune)
  {department: "66"}                        -> mean of commune centres (precision: department)
  {region: "76"}                            -> mean of commune centres (precision: region)
  {area: "Aquitaine"}                       -> mean of commune centres of AREAS[name] (region)
  {label: "Ouvéa", lat: -20.65, lon: 166.56, precision: "commune"}
                                            -> as given, for places outside the COG (New
                                               Caledonia, French Polynesia) or a precise site
Any place may add `label` (display name) and `approximate: true` (the pin stands for a
wider area, e.g. a pays around its main town).
The API has no département/region centre, so the mean of commune centres stands in for it.
Communes come from one cached list per département, so geocoding mostly runs locally."""

import json
import logging
import unicodedata

from pci import DATA
from pci.http import FetchError, PoliteClient

API = "https://geo.api.gouv.fr"
CACHE_PATH = DATA / "geocode-cache.json"
# Overseas départements and collectivities (INSEE codes start with 97/98).
OVERSEAS_PREFIXES = ("97", "98")
COMMUNE_FIELDS = "nom,code,centre,codeDepartement,codeRegion,population"
# Historical regions and cultural areas named by fiches, as lists of départements.
AREAS = {
    "Alsace": ["67", "68"],
    "Aquitaine": ["24", "33", "40", "47", "64"],
    "Auvergne": ["03", "15", "43", "63"],
    "Basse-Normandie": ["14", "50", "61"],
    "Bourgogne": ["21", "58", "71", "89"],
    "Champagne-Ardenne": ["08", "10", "51", "52"],
    "Franche-Comté": ["25", "39", "70", "90"],
    "Haute-Normandie": ["27", "76"],
    "Languedoc-Roussillon": ["11", "30", "34", "48", "66"],
    "Limousin": ["19", "23", "87"],
    "Lorraine": ["54", "55", "57", "88"],
    "Midi-Pyrénées": ["09", "12", "31", "32", "46", "65", "81", "82"],
    "Nord-Pas-de-Calais": ["59", "62"],
    "Picardie": ["02", "60", "80"],
    "Poitou-Charentes": ["16", "17", "79", "86"],
    "Rhône-Alpes": ["01", "07", "26", "38", "42", "69", "73", "74"],
}
# The French Basque Country (Labourd, Lower Navarre, Soule) is not an administrative unit:
# its pin is a fixed point near the middle of the three provinces.
POINT_AREAS = {
    "Pays basque": {"lat": 43.3, "lon": -1.2},
}

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
    if place.get("area"):
        return f"area:{place['area']}"
    if "lat" in place and "lon" in place:
        return f"point:{place['lat']},{place['lon']}"
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


def department_communes(code: str, client: PoliteClient) -> list[dict]:
    """Every commune of a département (one cached request)."""
    return _get_json(client, f"/departements/{code}/communes?fields={COMMUNE_FIELDS}")


def resolve(place: dict, client: PoliteClient) -> dict:
    """Query the API for one place. Returns {label, lat, lon, precision, insee?, overseas}."""
    fields = "nom,code,centre,codeDepartement,codeRegion"
    if place.get("area"):
        name = place["area"]
        if name in POINT_AREAS:
            return {"label": name, **POINT_AREAS[name], "precision": "region", "overseas": False}
        if name not in AREAS:
            raise GeocodeError(f"unknown area: {name}")
        communes = [c for code in AREAS[name] for c in department_communes(code, client)]
        lat, lon = mean_centre(communes)
        return {"label": name, "lat": lat, "lon": lon, "precision": "region", "overseas": False}
    if "lat" in place and "lon" in place:
        lat, lon = float(place["lat"]), float(place["lon"])
        return {
            "label": place["label"],
            "lat": round(lat, 4),
            "lon": round(lon, 4),
            "precision": place.get("precision", "site"),
            # Metropolitan France and Corsica fit in this box; everything else is overseas.
            "overseas": not (41.0 <= lat <= 51.5 and -5.5 <= lon <= 10.0),
        }
    if place.get("insee") or place.get("commune"):
        if place.get("insee"):
            communes = [_get_json(client, f"/communes/{place['insee']}?fields={fields}")]
        else:
            wanted = _fold(place["commune"])
            found = department_communes(place["department"], client)
            communes = [c for c in found if _fold(c["nom"]) == wanted]
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
        lat, lon = mean_centre(department_communes(code, client))
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
    if place.get("approximate"):
        location["precision"] = "approximate"
    return location
