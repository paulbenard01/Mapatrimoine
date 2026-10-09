from pci.places import load_yaml
from pci.unesco import UNESCO_PATH, check_unesco, unesco_records

ID = "2008_67717_INV_PCI_FRANCE_00036"
DATA = {
    "inscriptions": {
        "alencon-lace": {
            "name_en": "Craftsmanship of Alençon needle lace-making",
            "name_fr": "Le savoir-faire de la dentelle au point d'Alençon",
            "list": "RL",
            "year": 2010,
            "url": "https://ich.unesco.org/en/RL/craftsmanship-of-alencon-needle-lace-making-00438",
            "multinational": False,
        }
    },
    "elements": {ID: {"unesco": "alencon-lace"}},
}


def test_valid_data_and_records():
    assert check_unesco(DATA, {ID}) == []
    record = unesco_records(DATA)[ID]
    assert record["list"] == "RL" and record["year"] == 2010
    assert record["url"].startswith("https://ich.unesco.org/")


def test_rules():
    assert check_unesco(DATA, set()) == [f"unesco {ID}: not a published inventory element"]
    bad = {**DATA, "elements": {ID: {"unesco": "nope"}}}
    assert check_unesco(bad, {ID}) == [f"unesco {ID}: unknown inscription 'nope'"]
    ins = DATA["inscriptions"]["alencon-lace"]
    wrong = {
        **DATA,
        "inscriptions": {"alencon-lace": {**ins, "list": "XX", "url": "https://x.org"}},
    }
    assert len(check_unesco(wrong, {ID})) == 2


def test_committed_unesco_file():
    import json

    from pci.index import INDEX_PATH

    index = json.loads(INDEX_PATH.read_text(encoding="utf-8"))["elements"]
    published = {e["id"] for e in index if not e["unpublished"]}
    data = load_yaml(UNESCO_PATH)
    assert check_unesco(data, published) == []
    assert len(unesco_records(data)) >= 30
