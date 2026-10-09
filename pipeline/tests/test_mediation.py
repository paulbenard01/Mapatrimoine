import copy
import json

import pytest
import yaml

from pci.build import CURATED_DIR
from pci.mediation import (
    MEDIATION_DIR,
    MediationError,
    build_mediation,
    check_sheet,
    load_sheets,
    validator,
)

ID = "2023_67717_INV_PCI_FRANCE_00523"
SAMPLE = yaml.safe_load((MEDIATION_DIR / f"{ID}.yaml").read_text(encoding="utf-8"))


def problems(sheet, documented=frozenset({ID})):
    return check_sheet(sheet, validator(), set(documented))


def test_sample_sheet_is_valid():
    assert problems(SAMPLE) == []


def test_every_committed_sheet_is_valid_and_documented():
    from pci.places import load_yaml
    from pci.summaries import SUMMARIES_PATH
    from pci.unesco import UNESCO_PATH

    documented = {p.stem for p in CURATED_DIR.glob("*.yaml")} | set(load_yaml(SUMMARIES_PATH))
    unesco = set(load_yaml(UNESCO_PATH)["elements"])
    sheets = load_sheets()
    assert sheets
    assert [p for s in sheets for p in check_sheet(s, validator(), documented, unesco)] == []
    # Every element inscribed by UNESCO has a sheet.
    assert unesco <= {s["id"] for s in sheets}


def test_exactly_three_questions_ending_with_a_question_mark():
    sheet = copy.deepcopy(SAMPLE)
    sheet["questions"]["fr"] = sheet["questions"]["fr"][:2]
    assert any("questions/fr" in p for p in problems(sheet))
    sheet = copy.deepcopy(SAMPLE)
    sheet["questions"]["en"][0] = "This is a statement, not a question."
    assert any("questions/en/0" in p for p in problems(sheet))


def test_exactly_five_distinct_terms_with_short_definitions():
    sheet = copy.deepcopy(SAMPLE)
    sheet["vocabulary"] = sheet["vocabulary"][:4]
    assert any("vocabulary" in p for p in problems(sheet))
    sheet = copy.deepcopy(SAMPLE)
    sheet["vocabulary"][1] = dict(sheet["vocabulary"][0])
    assert any("repeat" in p for p in problems(sheet))
    sheet = copy.deepcopy(SAMPLE)
    sheet["vocabulary"][0]["def_en"] = " ".join(["word"] * 31) + "."
    assert any("max 30" in p for p in problems(sheet))


def test_sheet_needs_a_documented_element_and_no_extra_fields():
    assert any("summary to print" in p for p in problems(SAMPLE, documented=set()))
    sheet = {**SAMPLE, "contact": "someone"}
    assert any("contact" in p for p in problems(sheet))


def test_id_must_match_file_name(tmp_path):
    (tmp_path / "other.yaml").write_text(yaml.safe_dump(SAMPLE), encoding="utf-8")
    with pytest.raises(MediationError, match="file name"):
        load_sheets(tmp_path)


def test_build_writes_sheets_without_ids(tmp_path):
    (tmp_path / f"{ID}.yaml").write_text(
        yaml.safe_dump(SAMPLE, allow_unicode=True), encoding="utf-8"
    )
    out = tmp_path / "mediation.json"
    assert build_mediation({ID}, output=out, directory=tmp_path) == 1
    payload = json.loads(out.read_text(encoding="utf-8"))
    assert payload["count"] == 1
    assert set(payload["sheets"]) == {ID}
    assert "id" not in payload["sheets"][ID]
    assert len(payload["sheets"][ID]["vocabulary"]) == 5
    with pytest.raises(MediationError):
        build_mediation(set(), output=out, directory=tmp_path)


GRANVILLE = "2013_67717_INV_PCI_FRANCE_00321"
EXTENDED = yaml.safe_load((MEDIATION_DIR / f"{GRANVILLE}.yaml").read_text(encoding="utf-8"))


def test_unesco_elements_get_extended_sheets():
    assert check_sheet(EXTENDED, validator(), {GRANVILLE}, {GRANVILLE}) == []
    # The same extended sheet is refused for an element that is not inscribed...
    assert any("only for UNESCO" in p for p in check_sheet(EXTENDED, validator(), {GRANVILLE}))
    # ...and a standard sheet is refused for an inscribed one.
    assert any(
        "UNESCO sheets need" in p
        for p in problems(SAMPLE, documented={ID}) + check_sheet(SAMPLE, validator(), {ID}, {ID})
    )
    short = {**EXTENDED, "activity": {**EXTENDED["activity"], "levels": ["kindergarten"]}}
    assert any(
        "activity/levels" in p for p in check_sheet(short, validator(), {GRANVILLE}, {GRANVILLE})
    )
