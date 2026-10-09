from pci.build import inventory
from pci.summaries import check_summaries, summary_record

ID = "2008_67717_INV_PCI_FRANCE_00047"
OTHER = "2008_67717_INV_PCI_FRANCE_00048"
ENTRY = {
    "kind": "practice",
    "summary": {
        "fr": "Danse de couple de la haute Roya, alternée avec la courente dans les bals.",
        "en": "A couple dance from the upper Roya, alternating with the courente at balls.",
        "lang_review": "draft",
    },
    "read": "pcilab",
    "review_status": "unreviewed",
}
PLACES = {ID: {"places": [{"commune": "Tende", "department": "06"}], "pcilab": 10}}


def test_valid_summary_has_no_problems():
    assert check_summaries({ID: ENTRY}, {ID}, set(), PLACES) == []


def test_summary_rules():
    assert check_summaries({OTHER: ENTRY}, {ID}, set(), PLACES) == [
        f"{OTHER}: not a published inventory element"
    ]
    assert any("data/curated" in p for p in check_summaries({ID: ENTRY}, {ID}, {ID}, PLACES))
    assert any("pcilab id" in p for p in check_summaries({ID: ENTRY}, {ID}, set(), {}))
    short = {**ENTRY, "summary": {**ENTRY["summary"], "en": "Too short."}}
    assert any("summary/en" in p for p in check_summaries({ID: short}, {ID}, set(), PLACES))
    dated = {**ENTRY, "recurrence": {"type": "fixed", "month": 1, "day": 1}}
    assert any("recurrence" in p for p in check_summaries({ID: dated}, {ID}, set(), PLACES))


def test_summary_record_links_its_source():
    record = summary_record(ENTRY, PLACES[ID], "https://www.culture.gouv.fr/fiche")
    assert record["summary_source"]["url"] == "https://www.pci-lab.fr/fiche-d-inventaire/fiche/10"
    fiche = summary_record({**ENTRY, "read": "fiche"}, None, "https://www.culture.gouv.fr/fiche")
    assert fiche["summary_source"]["url"] == "https://www.culture.gouv.fr/fiche"


def test_inventory_carries_kind_and_summary():
    index = {
        ID: {
            "id": ID,
            "title": "Le balèt",
            "themes": ["performing-arts"],
            "year_included": 2008,
            "fiche_url": None,
            "unpublished": False,
        }
    }
    (entry,) = inventory(index, {}, {}, {}, {ID: {**ENTRY, "read": "fiche"}})
    assert entry["kind"] == "practice"
    assert entry["summary"]["lang_review"] == "draft"
    (bare,) = inventory(index, {}, {}, {})
    assert bare["kind"] is None and "summary" not in bare
