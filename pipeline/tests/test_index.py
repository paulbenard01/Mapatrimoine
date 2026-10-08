from pathlib import Path

import pytest

from pci.index import (
    find_list_pdf_url,
    normalise_id,
    normalise_url,
    parse_index,
    unpublished_ids,
    words_from_bbox_xml,
)

FIXTURES = Path(__file__).parent / "fixtures"
MEDIA = "https://www.culture.gouv.fr/Media/Thematiques/Patrimoine-culturel-immateriel/Files/"


@pytest.fixture(scope="module")
def records():
    html = (FIXTURES / "inventory-trimmed.html").read_text(encoding="utf-8")
    return {r["id"]: r for r in parse_index(html)}


def test_lists_each_element_once_with_its_themes(records):
    assert len(records) == 7
    granville = records["2013_67717_INV_PCI_FRANCE_00314"]
    assert granville["theme"] == "social-festive"
    assert granville["themes"] == ["social-festive", "rituals"]


def test_ignores_ids_outside_the_theme_sections(records):
    assert "2099_67717_INV_PCI_FRANCE_99999" not in records


def test_title_joins_official_name_and_regional_name(records):
    aramits = records["2010_67717_INV_PCI_FRANCE_00114"]
    assert (
        aramits["title"]
        == "La fête des Bergers à Aramits (Pyrénées-Atlantiques) / Hésta deus Aulhèrs"
    )
    assert aramits["year_included"] == 2010
    assert aramits["unpublished"] is False


def test_repairs_typos_in_published_ids(records):
    bayonne = records["2010_67717_INV_PCI_FRANCE_00116"]
    assert bayonne["id_as_published"] == "010_67717_INV_PCI_FRANCE_00116"
    assert "2023_67717_INV_PCI_FRANCE_00520" in records


def test_keeps_scraped_hrefs_normalised_to_https_host(records):
    assert records["2013_67717_INV_PCI_FRANCE_00314"]["fiche_url"] == (
        MEDIA + "Fiches-inventaire-du-PCI/le-carnaval-de-granville"
    )
    assert records["2012_67717_INV_PCI_FRANCE_00270"]["fiche_url"] == (
        MEDIA + "Fiches-inventaire-du-PCI/Fabrication-d-un-instrument-ancien-a-clavier.pdf"
    )
    assert records["2008_67717_INV_PCI_FRANCE_00019"]["fiche_url"] is None


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("2014_67717_INV_PCI_FRANCE_00359", "2014_67717_INV_PCI_FRANCE_00359"),
        ("010_67717_INV_PCI_FRANCE_00116", "2010_67717_INV_PCI_FRANCE_00116"),
        ("202 3 _67717_INV_PCI_FRANCE_005 20", "2023_67717_INV_PCI_FRANCE_00520"),
    ],
)
def test_normalise_id(raw, expected):
    assert normalise_id(raw) == expected


@pytest.mark.parametrize(
    ("href", "expected"),
    [
        ("/Media/x", "https://www.culture.gouv.fr/Media/x"),
        ("http:///Media/x.pdf", "https://www.culture.gouv.fr/Media/x.pdf"),
        ("http://www.culture.gouv.fr/Media/x", "https://www.culture.gouv.fr/Media/x"),
        ("https://culture.gouv.fr/Media/x", "https://www.culture.gouv.fr/Media/x"),
        ("", None),
        (None, None),
    ],
)
def test_normalise_url(href, expected):
    assert normalise_url(href) == expected


def test_finds_the_official_list_not_a_title_containing_liste():
    html = (FIXTURES / "inventory-trimmed.html").read_text(encoding="utf-8")
    assert "/mc/content/download/357927/" in find_list_pdf_url(html)


def test_unpublished_marker_is_attached_to_the_id_above_in_the_same_column():
    xml = (FIXTURES / "list-bbox-trimmed.xml").read_text(encoding="utf-8")
    assert unpublished_ids(words_from_bbox_xml(xml)) == {
        "2008_67717_INV_PCI_FRANCE_00004",
        "2010_67717_INV_PCI_FRANCE_00085",
    }


def test_committed_index_covers_the_inventory():
    import json

    from pci.index import INDEX_PATH, THEMES

    data = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    ids = [e["id"] for e in data["elements"]]
    assert 500 <= len(ids) == len(set(ids)) == data["count"]
    assert {e["theme"] for e in data["elements"]} == set(THEMES.values())
