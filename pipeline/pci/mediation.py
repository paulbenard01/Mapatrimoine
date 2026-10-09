"""Mediation sheets (milestone M6): data/mediation/<id>.yaml -> web/public/data/mediation.json.

Each sheet holds three discussion questions and five vocabulary terms in French and English,
written for this site and marked as drafts until Paul reviews them. The site combines them
with the element's summary, picture, places and timing into a printable bilingual page.
"""

import json
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

from pci import DATA, ROOT, SCHEMA

MEDIATION_DIR = DATA / "mediation"
MEDIATION_JSON = ROOT / "web" / "public" / "data" / "mediation.json"
MAX_DEFINITION_WORDS = 30


class MediationError(Exception):
    pass


def load_sheets(directory: Path = MEDIATION_DIR) -> list[dict]:
    sheets = []
    for path in sorted(directory.glob("*.yaml")):
        sheet = yaml.safe_load(path.read_text(encoding="utf-8"))
        if not isinstance(sheet, dict) or sheet.get("id") != path.stem:
            raise MediationError(f"{path.name}: id must match the file name")
        sheets.append(sheet)
    return sheets


def validator() -> Draft202012Validator:
    schema = json.loads((SCHEMA / "mediation.schema.json").read_text(encoding="utf-8"))
    return Draft202012Validator(schema)


EXTENDED_FIELDS = ("context", "unesco", "activity")


def check_sheet(
    sheet: dict,
    validator: Draft202012Validator,
    documented: set[str],
    unesco: frozenset[str] | set[str] = frozenset(),
) -> list[str]:
    """Schema errors plus rules JSON Schema cannot express.

    Standard sheets: 3 questions, 5 terms. Elements inscribed by UNESCO get an extended
    sheet: 5 questions, 8 terms, and context, UNESCO and activity sections."""
    ident = sheet.get("id")
    problems = [
        f"{ident}: {'/'.join(map(str, e.absolute_path)) or '(root)'}: {e.message}"
        for e in validator.iter_errors(sheet)
    ]
    if ident not in documented:
        problems.append(f"{ident}: a sheet needs an element with a summary to print")
    extended = ident in unesco
    want = (5, 8) if extended else (3, 5)
    questions = sheet.get("questions") or {}
    for lang in ("fr", "en"):
        if len(questions.get(lang) or []) != want[0]:
            problems.append(f"{ident}: {want[0]} questions in {lang} expected")
    if len(sheet.get("vocabulary") or []) != want[1]:
        problems.append(f"{ident}: {want[1]} vocabulary terms expected")
    for field in EXTENDED_FIELDS:
        if extended and field not in sheet:
            problems.append(f"{ident}: UNESCO sheets need a {field} section")
        if not extended and field in sheet:
            problems.append(f"{ident}: {field} is only for UNESCO (extended) sheets")
    for term in sheet.get("vocabulary") or []:
        for key in ("def_fr", "def_en"):
            words = len(str(term.get(key, "")).split())
            if words > MAX_DEFINITION_WORDS:
                problems.append(f"{ident}: {term.get('fr')} {key} has {words} words (max 30)")
    terms = [str(t.get("fr", "")).lower() for t in sheet.get("vocabulary") or []]
    if len(set(terms)) != len(terms):
        problems.append(f"{ident}: vocabulary terms repeat")
    return problems


def build_mediation(
    documented: set[str],
    output: Path = MEDIATION_JSON,
    directory: Path = MEDIATION_DIR,
    unesco: frozenset[str] | set[str] = frozenset(),
) -> int:
    """Validate every sheet and publish them. `documented` = IDs with a published summary
    (curated or short); `unesco` = IDs whose sheet must be extended."""
    sheets = load_sheets(directory)
    schema_validator = validator()
    problems = [
        p for sheet in sheets for p in check_sheet(sheet, schema_validator, documented, unesco)
    ]
    if problems:
        raise MediationError("\n".join(problems))
    payload = {
        "source": "data/mediation",
        "count": len(sheets),
        "sheets": {s["id"]: {k: v for k, v in s.items() if k != "id"} for s in sheets},
    }
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    return len(sheets)
