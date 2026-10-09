import csv
import json
from datetime import date

import pytest

from pci.announced import (
    AnnouncedError,
    build_announced,
    check_rules,
    first_url,
    fma_url,
    fold,
    match,
    parse_periods,
    read_fma,
)

ID = "2012_67717_INV_PCI_FRANCE_00257"
LIMOUX = {"id": ID, "kind": "event", "locations": [{"lat": 43.0537, "lon": 2.2181}]}
HEADER = [
    "Nom_du_POI",
    "Categories_de_POI",
    "Latitude",
    "Longitude",
    "Adresse_postale",
    "Code_postal_et_commune",
    "Periodes_regroupees",
    "Covid19_mesures_specifiques",
    "Createur_de_la_donnee",
    "SIT_diffuseur",
    "Date_de_mise_a_jour",
    "Contacts_du_POI",
    "Classements_du_POI",
    "Description",
    "URI_ID_du_POI",
]
EVENT = "https://www.datatourisme.fr/ontology/core#SocialEvent"


def row(title, lat, lon, periods, contacts="", categories=EVENT):
    contact_bits = {"Contacts_du_POI": contacts, "Description": "Long text naming people."}
    return {
        **dict.fromkeys(HEADER, ""),
        "Nom_du_POI": title,
        "Categories_de_POI": categories,
        "Latitude": str(lat),
        "Longitude": str(lon),
        "Code_postal_et_commune": "11300#Limoux",
        "Periodes_regroupees": periods,
        "SIT_diffuseur": "Office de tourisme",
        **contact_bits,
    }


@pytest.fixture
def fma(tmp_path):
    path = tmp_path / "fma.csv"
    # Built in the test, not as a committed fixture: the contacts carry an email pattern.
    contacts = "Comité#https://www.example.org/carnaval<>contact" + "@" + "example.org"
    rows = [
        row("CARNAVAL DE LIMOUX - Les Meuniers", 43.05, 2.22, "2027-01-03<->2027-01-03", contacts),
        row("Carnaval de Limoux (bis)", 43.05, 2.22, "2026-01-04<->2026-01-04"),  # past
        row("Carnaval de Limoux", 44.84, -0.58, "2027-01-10<->2027-01-10"),  # Bordeaux: too far
        row(
            "Exposition carnaval de Limoux",
            43.05,
            2.22,
            "2027-01-03<->2027-03-01",
            "",
            EVENT + "|https://www.datatourisme.fr/ontology/core#Exhibition",
        ),
        row("Marché de Noël", 43.05, 2.22, "2026-12-12<->2026-12-13"),  # no term
        row("Carnaval de Limoux", "", "", "2027-01-17<->2027-01-17"),  # no coordinates
    ]
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=HEADER)
        writer.writeheader()
        writer.writerows(rows)
    return path


def test_parse_periods_and_urls():
    assert parse_periods(
        "2026-08-27<->2026-08-27|2026-08-06<->2026-08-07|bad|2026-09-02<->2026-09-01"
    ) == [
        ("2026-08-06", "2026-08-07"),
        ("2026-08-27", "2026-08-27"),
    ]
    assert first_url("Comité#https://a.fr/x<>https://b.fr/|#") == "https://a.fr/x"
    assert first_url("Mairie#") is None
    assert fold("Fête du Bœuf à Mèze – l’été") == "fete du boeuf a meze – l'ete"


def test_read_fma_keeps_no_contacts_or_descriptions(fma):
    rows = list(read_fma(fma))
    assert len(rows) == 4  # exhibitions and rows without coordinates are skipped
    assert set(rows[0]) == {"title", "point", "commune", "periods", "url", "publisher", "uri"}
    assert rows[0]["url"] == "https://www.example.org/carnaval"
    assert "@" not in json.dumps(rows)


def test_match_by_term_place_and_date(fma):
    rules = {ID: {"terms": ["carnaval de limoux"]}}
    found = match(rules, [LIMOUX], read_fma(fma), since="2026-10-09")
    assert [e["title"] for e in found[ID]] == ["CARNAVAL DE LIMOUX - Les Meuniers"]
    assert found[ID][0]["periods"] == [{"start": "2027-01-03", "end": "2027-01-03"}]
    assert found[ID][0]["commune"] == "Limoux"
    assert match(rules, [LIMOUX], read_fma(fma), since="2027-02-01") == {}


def test_rules_must_target_documented_events():
    assert check_rules({ID: {"terms": ["carnaval"]}}, {ID}) == []
    assert check_rules({ID: {"terms": ["car"]}}, {ID})  # too short to be meaningful
    assert check_rules({ID: {"terms": ["carnaval"], "radius_km": 500}}, {ID})
    assert check_rules({"x": {"terms": ["carnaval"]}}, {ID}) == ["x: not a documented event"]


def test_build_writes_payload(fma, tmp_path):
    rules = tmp_path / "announced.yaml"
    rules.write_text(f"{ID}: {{terms: [carnaval de limoux]}}\n", encoding="utf-8")
    out = tmp_path / "announced.json"
    assert build_announced([LIMOUX], date(2026, 10, 9), fma, out, rules) == 1
    payload = json.loads(out.read_text(encoding="utf-8"))
    assert payload["licence"].startswith("Licence Ouverte")
    assert payload["generated_on"] == "2026-10-09"
    rules.write_text("someone_else: {terms: [carnaval]}\n", encoding="utf-8")
    with pytest.raises(AnnouncedError):
        build_announced([LIMOUX], date(2026, 10, 9), fma, out, rules)


def test_fma_url_from_dataset():
    dataset = {
        "resources": [{"title": "datatourisme-fma.csv", "url": "https://static.example/f.csv"}]
    }
    assert fma_url(dataset) == "https://static.example/f.csv"
    with pytest.raises(AnnouncedError):
        fma_url({"resources": []})


def test_committed_rules_target_documented_events():
    from pci.announced import ANNOUNCED_RULES
    from pci.build import load_curated
    from pci.places import load_yaml

    events = {c["id"] for c in load_curated() if c["kind"] == "event"}
    assert check_rules(load_yaml(ANNOUNCED_RULES), events) == []
