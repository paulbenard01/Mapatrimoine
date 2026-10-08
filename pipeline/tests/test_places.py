import json

from pci import ROOT
from pci.build import BuildError, build_inventory, load_curated
from pci.index import INDEX_PATH
from pci.pcilab import fiche_url, parse_fiche, parse_map
from pci.places import (
    PLACES_PATH,
    check_images,
    check_places,
    load_yaml,
    location_sources,
    picture,
)

FIXTURES = ROOT / "pipeline" / "tests" / "fixtures"
ID = "2008_67717_INV_PCI_FRANCE_00047"


def test_parse_pcilab_map():
    points = parse_map((FIXTURES / "pcilab-map-trimmed.html").read_text(encoding="utf-8"))
    assert [p["fid"] for p in points] == [10, 11]
    assert points[0]["title"] == "Le balèt"
    assert (points[0]["lat"], points[0]["lon"]) == (44.05699, 7.58512)
    assert (
        points[0]["image"] == "https://www.pci-lab.fr/images/fiches/047_balet/047_balet-bandeau.jpg"
    )
    assert points[1]["image"] is None


def test_parse_pcilab_fiche_keeps_localisation_and_own_banner_only():
    fiche = parse_fiche((FIXTURES / "pcilab-fiche-trimmed.html").read_text(encoding="utf-8"))
    assert fiche["localisation"] == "Provence-Alpes-Côte d'Azur, Alpes-Maritimes, Tende"
    assert fiche["banner"].endswith("/047_balet/047_balet-bandeau.jpg")
    assert fiche_url(10) == "https://www.pci-lab.fr/fiche-d-inventaire/fiche/10"


def test_check_places():
    good = {ID: {"places": [{"commune": "Tende", "department": "06"}], "pcilab": 10}}
    assert check_places(good, {ID}) == []
    assert check_places(good, set()) == [f"{ID}: not a published inventory element"]
    no_source = {ID: {"places": [{"department": "06"}]}}
    assert check_places(no_source, {ID}) == [f"{ID}: needs pcilab or sources"]
    bad = {ID: {"places": [{"label": "x"}], "sources": [{"publisher": "x", "url": "http://x"}]}}
    problems = check_places(bad, {ID})
    assert any("place needs" in p for p in problems)
    assert any("https url" in p for p in problems)
    assert check_places({ID: {"places": [], "pcilab": 10}}, {ID}) == [f"{ID}: no places"]


def test_location_sources():
    assert location_sources({"places": [], "pcilab": 10}) == [
        {
            "kind": "pcilab",
            "url": "https://www.pci-lab.fr/fiche-d-inventaire/fiche/10",
            "publisher": "PCI Lab (ministère de la Culture, CIRDOC)",
        }
    ]
    web = {"places": [], "pcilab": 10, "sources": [{"publisher": "Mairie", "url": "https://x.fr"}]}
    assert location_sources(web) == [{"kind": "web", "publisher": "Mairie", "url": "https://x.fr"}]


def test_check_images_and_picture():
    image = {
        "source": "commons",
        "src": "https://upload.wikimedia.org/a.jpg",
        "page": "https://commons.wikimedia.org/wiki/File:A.jpg",
        "credit": "Someone",
        "licence": "CC BY-SA 4.0",
        "licence_url": "https://creativecommons.org/licenses/by-sa/4.0",
    }
    assert check_images({ID: image}, {ID}) == []
    assert picture(image, "Le balèt")["alt"] == "Le balèt"
    no_licence = {**image, "licence": None}
    assert check_images({ID: no_licence}, {ID}) == [f"{ID}: Commons image needs its licence"]
    fiche_image = {**no_licence, "source": "pcilab"}
    assert check_images({ID: fiche_image}, {ID}) == []
    from_pdf = {**no_licence, "source": "fiche", "src": f"img/fiches/{ID}.jpg"}
    assert check_images({ID: from_pdf}, {ID}) == [
        f"{ID}: img/fiches/{ID}.jpg is missing from web/public"
    ]
    wrong = {**from_pdf, "src": "img/fiches/other.jpg"}
    assert check_images({ID: wrong}, {ID}) == [f"{ID}: fiche image src must be img/fiches/{ID}.jpg"]
    assert check_images({ID: {**image, "src": "http://x"}}, {ID}) == [
        f"{ID}: image src must be an https url"
    ]


def test_every_published_element_is_on_the_map(tmp_path):
    """Each element is either curated (own places) or in data/places.yaml, and both
    places.yaml and images.yaml pass the build checks."""
    index = json.loads(INDEX_PATH.read_text(encoding="utf-8"))["elements"]
    published = {e["id"] for e in index if not e["unpublished"]}
    curated = {c["id"] for c in load_curated()}
    assert published - curated - set(load_yaml(PLACES_PATH)) == set()
    try:
        build_inventory(tmp_path / "inventory.json")
    except BuildError as exc:  # pragma: no cover - shows every problem at once
        raise AssertionError(str(exc)) from exc
