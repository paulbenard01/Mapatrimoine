import json

import pytest
from jsonschema import Draft202012Validator

from pci import SCHEMA
from pci.build import (
    OUTPUT_PATH,
    BuildError,
    build,
    check,
    compose,
    quote_in_text,
    word_count,
)

VALIDATOR = Draft202012Validator(json.loads((SCHEMA / "element.schema.json").read_text()))
ID = "2023_67717_INV_PCI_FRANCE_00523"
INDEX = {
    ID: {
        "id": ID,
        "title": "La Sanch",
        "theme": "social-festive",
        "year_included": 2023,
        "fiche_url": "https://www.culture.gouv.fr/Media/x",
        "unpublished": False,
    }
}
MANIFEST = {ID: {"status": "ok", "fetched_at": "2026-10-08", "unpublished_marker": False}}
CACHE = {
    "commune:66:perpignan": {
        "label": "Perpignan",
        "lat": 42.699,
        "lon": 2.9045,
        "precision": "commune",
        "insee": "66136",
        "overseas": False,
    }
}
CURATED = {
    "id": ID,
    "kind": "event",
    "domain": "Pratiques sociales",
    "summary": {
        "fr": "Des processions de pénitents pendant la Semaine sainte en Roussillon.",
        "en": "Penitents' processions during Holy Week in Roussillon, in Catalan tradition.",
        "lang_review": "draft",
    },
    "places": [{"commune": "Perpignan", "department": "66"}],
    "recurrence": {"type": "easter_offset", "days": -2},
    "timing": {
        "confidence": "high",
        "evidence_quote": "le vendredi de la semaine Sainte",
        "evidence_page": 1,
        "notes": "",
    },
    "review_status": "unreviewed",
}


def test_compose_and_validate(tmp_path):
    element = compose(CURATED, INDEX, MANIFEST, CACHE)
    assert element["title_fr"] == "La Sanch"
    assert element["locations"][0]["insee"] == "66136"
    assert check(element, VALIDATOR, tmp_path) == []


def test_unpublished_elements_are_refused():
    index = {ID: {**INDEX[ID], "unpublished": True}}
    with pytest.raises(BuildError, match="unpublished"):
        compose(CURATED, index, MANIFEST, CACHE)
    manifest = {ID: {**MANIFEST[ID], "unpublished_marker": True}}
    with pytest.raises(BuildError, match="unpublished"):
        compose(CURATED, INDEX, manifest, CACHE)


def test_practice_must_not_have_a_rule(tmp_path):
    element = compose({**CURATED, "kind": "practice"}, INDEX, MANIFEST, CACHE)
    assert check(element, VALIDATOR, tmp_path)


def test_quote_limit_and_page_check(tmp_path):
    long_quote = " ".join(["mot"] * 26)
    element = compose(CURATED, INDEX, MANIFEST, CACHE)
    element["timing"]["evidence_quote"] = long_quote
    assert any("26 words" in p for p in check(element, VALIDATOR, tmp_path))

    (tmp_path / f"{ID}.txt").write_text("page un\fLe Vendredi\nsaint", encoding="utf-8")
    element["timing"]["evidence_quote"] = "le vendredi saint"
    assert any("found on [2]" in p for p in check(element, VALIDATOR, tmp_path))
    element["timing"]["evidence_page"] = 2
    assert check(element, VALIDATOR, tmp_path) == []


def test_word_count_and_quote_matching():
    assert word_count("l’après-midi du vendredi de la semaine Sainte") == 7
    assert quote_in_text("« générale », se déroule", "dite « générale »,\nse dé-\nroule")


def test_committed_curated_data_builds_to_the_committed_output(tmp_path):
    """CI check: every curated file validates and elements.json is up to date."""
    out = tmp_path / "elements.json"
    build(out)
    assert json.loads(out.read_text()) == json.loads(OUTPUT_PATH.read_text())
