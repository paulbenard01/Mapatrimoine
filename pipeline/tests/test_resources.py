import csv
import io
import json

from pci.opendata import FIELDS, records, to_csv
from pci.resources import check_lessons, check_media, check_stories

ID = "2013_67717_INV_PCI_FRANCE_00321"
OTHER = "2014_67717_INV_PCI_FRANCE_00350"
BI = {
    "fr": "Texte en français assez long pour passer les minimums.",
    "en": "English text long enough.",
}


def bi(n: int) -> dict:
    return {"fr": "é" * n, "en": "e" * n}


def test_media_rules():
    link = {"title": "Carnaval", "url": "https://www.ina.fr/x", "publisher": "INA", "kind": "video"}
    assert check_media({ID: [link]}, {ID}) == []
    assert check_media({ID: [link, link]}, {ID}) == [f"media {ID}: duplicate links"]
    assert any("not a published" in p for p in check_media({ID: [link]}, set()))
    assert any("url" in p for p in check_media({ID: [{**link, "url": "http://x"}]}, {ID}))
    assert any("kind" in p for p in check_media({ID: [{**link, "kind": "photo"}]}, {ID}))


def lesson(**changes):
    step = {"minutes": 15, "title": bi(10), "teacher": bi(50), "students": bi(50)}
    data = {
        "id": "primaire-test",
        "level": "primary",
        "title": bi(10),
        "grade": bi(5),
        "duration_min": 60,
        "summary": bi(120),
        "curriculum": bi(80),
        "objectives": {"fr": ["Objectif numéro un"] * 3, "en": ["Objective number one"] * 3},
        "materials": {"fr": ["Carte", "Fiches"], "en": ["The map", "Sheets"]},
        "elements": [ID, OTHER],
        "steps": [step] * 4,
        "assessment": bi(80),
        "differentiation": bi(80),
        "going_further": bi(80),
        "lang_review": "draft",
        "review_status": "unreviewed",
    }
    return {**data, **changes}


def test_lesson_rules():
    assert check_lessons([lesson()], {ID, OTHER}) == []
    short = lesson(steps=lesson()["steps"][:3])
    assert any("45 min" in p for p in check_lessons([short], {ID, OTHER}))
    assert any("unknown element" in p for p in check_lessons([lesson()], {ID}))
    assert any("level" in p for p in check_lessons([lesson(level="nursery")], {ID, OTHER}))


def story(**changes):
    step = {"element": ID, "heading": bi(10), "text": bi(220)}
    data = {
        "id": "test-story",
        "kind": "theme",
        "title": bi(10),
        "tagline": bi(30),
        "intro": bi(220),
        "steps": [step, {**step, "element": OTHER}] * 2,
        "outro": bi(160),
        "lang_review": "draft",
        "review_status": "unreviewed",
    }
    return {**data, **changes}


def test_story_rules():
    good = story(
        steps=story()["steps"][:2] + [{**story()["steps"][0], "element": e} for e in ("a", "b")]
    )
    problems = check_stories([good], {ID, OTHER})
    assert any("unknown element a" in p for p in problems)
    assert any("appears twice" in p for p in check_stories([story()], {ID, OTHER}))


def test_open_data_rows_and_csv():
    inventory = [
        {
            "id": ID,
            "title_fr": "Le carnaval de Granville (Manche)",
            "themes": ["social-festive"],
            "year_included": 2013,
            "fiche_url": "https://www.culture.gouv.fr/x",
            "locations": [],
            "unesco": {"list": "RL", "year": 2016, "url": "https://ich.unesco.org/en/RL/x"},
        }
    ]
    elements = [
        {
            "id": ID,
            "kind": "event",
            "summary": {"fr": "Résumé", "en": "Summary"},
            "locations": [
                {"label": "Granville", "lat": 48.83, "lon": -1.59, "precision": "commune"}
            ],
            "recurrence": {"type": "easter_offset", "days": -47},
        }
    ]
    (row,) = records(inventory, elements, {ID})
    assert row["documented"] and row["worksheet"] and row["unesco_list"] == "RL"
    parsed = list(csv.DictReader(io.StringIO(to_csv([row]))))
    assert list(parsed[0]) == FIELDS
    assert parsed[0]["lat"] == "48.83" and parsed[0]["places"] == "Granville"
    assert json.loads(parsed[0]["recurrence"]) == {"type": "easter_offset", "days": -47}
