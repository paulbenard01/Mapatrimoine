"""Download pilot fiches (data/raw/fiches/) and extract their text (data/text/), both git-ignored.

Only `data/fiches-manifest.json` is committed: per element, fetch and text status, page count
and the unpublished marker. Facts parsed from sections I.1, I.2 and I.4 go to the git-ignored
`data/text/<id>.facts.json` for curation, because free text can carry names (photo credits)."""

import io
import json
import logging
import re
import shutil
import subprocess
from datetime import UTC, datetime
from pathlib import Path

from pci import DATA
from pci.http import FetchError, PoliteClient

PILOT_PATH = DATA / "pilot.txt"
INDEX_PATH = DATA / "index.json"
MANIFEST_PATH = DATA / "fiches-manifest.json"
RAW_DIR = DATA / "raw" / "fiches"
TEXT_DIR = DATA / "text"
UNPUBLISHED = re.compile(r"fiche\s+d[ée]publi[ée]e", re.IGNORECASE)

log = logging.getLogger(__name__)


def read_pilot(path: Path = PILOT_PATH) -> list[str]:
    ids = []
    for line in path.read_text(encoding="utf-8").splitlines():
        ident = line.split("#", 1)[0].strip()
        if ident:
            ids.append(ident)
    return ids


def load_index() -> dict[str, dict]:
    data = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    return {e["id"]: e for e in data["elements"]}


def load_manifest() -> dict[str, dict]:
    if MANIFEST_PATH.exists():
        return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    return {}


def save_manifest(manifest: dict[str, dict]) -> None:
    ordered = dict(sorted(manifest.items()))
    MANIFEST_PATH.write_text(
        json.dumps(ordered, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )


def fetch_fiches(ids: list[str], client: PoliteClient | None = None) -> dict[str, dict]:
    """Download each fiche once (cached). Failures are logged and recorded, never fatal."""
    # Slower than the 1 req/s ceiling: the site starts answering 403 after ~10 quick downloads.
    client = client or PoliteClient(min_interval=5.0, first_backoff=30.0)
    index = load_index()
    manifest = load_manifest()
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    for ident in ids:
        element = index.get(ident)
        entry = manifest.setdefault(ident, {})
        url = element and element["fiche_url"]
        entry["fiche_url"] = url
        if not element or element["unpublished"]:
            entry["status"] = "excluded: unpublished or not in index"
            continue
        if not url:
            entry["status"] = "no fiche link on the inventory page"
            continue
        target = RAW_DIR / f"{ident}.pdf"
        try:
            body = client.get(url)
        except FetchError as exc:
            entry["status"] = f"failed: {exc}"
            log.warning("fiche %s: %s", ident, exc)
            continue
        if not body.startswith(b"%PDF"):
            entry["status"] = "failed: response is not a PDF"
            log.warning("fiche %s: response is not a PDF", ident)
            continue
        target.write_bytes(body)
        entry["status"] = "ok"
        entry.setdefault("fetched_at", datetime.now(UTC).date().isoformat())
    save_manifest(manifest)
    return manifest


def pdf_to_pages(pdf: Path) -> list[str]:
    """Text per page (poppler's pdftotext; pypdf fallback)."""
    if shutil.which("pdftotext"):
        out = subprocess.run(
            ["pdftotext", "-enc", "UTF-8", str(pdf), "-"], capture_output=True, check=True
        ).stdout.decode("utf-8", errors="replace")
        pages = out.split("\f")
        return pages[:-1] if pages and not pages[-1].strip() else pages
    from pypdf import PdfReader

    return [page.extract_text() or "" for page in PdfReader(io.BytesIO(pdf.read_bytes())).pages]


# Section headings of the UNESCO-style fiche: "I.1. Nom de l'élément", "I.4. Localisation physique".
SECTION = re.compile(r"^\s*(I{1,3}|IV|V|VI)\.(\d+)\.?\s*(.*)$", re.MULTILINE)


def sections(text: str) -> dict[str, str]:
    """Split fiche text into {"I.1": body, "I.2": body, ...}; the first occurrence wins."""
    found: dict[str, str] = {}
    matches = list(SECTION.finditer(text))
    for n, m in enumerate(matches):
        key = f"{m.group(1)}.{m.group(2)}"
        end = matches[n + 1].start() if n + 1 < len(matches) else len(text)
        heading_rest = m.group(3)
        body = text[m.end() : end]
        if key not in found:
            found[key] = (heading_rest + "\n" + body).strip()
    return found


FOOTER = re.compile(r"\s\d*\s*FICHE D.INVENTAIRE DU PATRIMOINE CULTUREL IMMAT[ÉE]RIEL.*", re.S)


def _clean(text: str | None, limit: int = 300) -> str | None:
    if not text:
        return None
    text = FOOTER.sub("", text)
    text = re.sub(r"[\x00-\x08\x0b-\x1f]", " ", text)  # bullet glyphs extracted as control chars
    text = re.sub(r"\s+", " ", text).strip(" ;:,.-–")
    return text[:limit] or None


def _strip(text: str | None, *labels: str, stop: str | None = None) -> str | None:
    """Remove leading form labels and cut the body at a following sub-heading."""
    if text is None:
        return None
    changed = True
    while changed:  # labels can repeat ("I.1. Nom" then "Nom En français")
        before = text
        for label in labels:
            text = re.sub(rf"^\s*{label}\s*:?", "", text, flags=re.IGNORECASE)
        changed = text != before
    if stop:
        text = re.split(stop, text, maxsplit=1, flags=re.IGNORECASE)[0]
    return _clean(text)


def parse_fiche(pages: list[str]) -> dict:
    """Facts from I.1 (name), I.2 (domain) and I.4 (physical location), plus the unpublished
    marker. Handles the current UNESCO-style fiche and the short 2008-2014 form
    ("Identification :", "Localisation (région, département, municipalité) :")."""
    text = "\n".join(pages)
    parts = sections(text)
    name = _strip(parts.get("I.1"), r"Nom(?: de l[’']élément)?", r"En français", stop=r"En langue")
    domain = _strip(
        parts.get("I.2"),
        r"Domaine\(?s?\)? de classification",
        r"Type d[’']élément selon la classification Unesco",
        r"selon l[’']UNESCO",
    )
    location = _strip(
        parts.get("I.4"),
        r"Localisation physique",
        r"de l[’']élément",
        r"Lieu\(?x?\)? de la pratique en France",
        stop=r"Pratiques? similaires?",
    )
    if name is None:
        # Stop before "Personne(s) rencontrée(s)": it names private individuals.
        m = re.search(
            r"Identification\s*:\s*(.+?)(?=\n\s*\n|Personne|Localisation|Indexation)", text, re.S
        )
        name = _clean(m and m.group(1))
    if location is None:
        m = re.search(
            r"Localisation\s*\([^)]*\)\s*:\s*(.+?)(?=Indexation|\(A\)|Nom et rôle|\n\s*\n)",
            text,
            re.S,
        )
        location = _clean(m and m.group(1))
    return {
        "name": name,
        "domain": domain,
        "location": location,
        "pages": len(pages),
        "unpublished_marker": bool(UNPUBLISHED.search(text)),
    }


def readable(pages: list[str]) -> bool:
    """False when the PDF's fonts have no usable text mapping (extraction yields symbols)."""
    text = "".join(pages)
    letters = sum(c.isalpha() for c in text)
    return len(text.strip()) > 200 and letters / max(1, len(text.replace(" ", ""))) > 0.6


def extract_text(ids: list[str]) -> dict[str, dict]:
    """Write data/text/<id>.txt (pages separated by form feeds) and record parsed facts."""
    manifest = load_manifest()
    TEXT_DIR.mkdir(parents=True, exist_ok=True)
    for ident in ids:
        pdf = RAW_DIR / f"{ident}.pdf"
        entry = manifest.setdefault(ident, {})
        if not pdf.exists():
            continue
        try:
            pages = pdf_to_pages(pdf)
        except (subprocess.CalledProcessError, ValueError) as exc:
            entry["status"] = f"failed: text extraction ({exc.__class__.__name__})"
            continue
        if not readable(pages):
            entry["text"] = "unreadable (no text layer usable; OCR needed)"
            entry.pop("parsed", None)
            entry.pop("unpublished_marker", None)
            log.warning("fiche %s: extracted text is unreadable", ident)
            continue
        entry["text"] = "ok"
        (TEXT_DIR / f"{ident}.txt").write_text("\f".join(pages), encoding="utf-8")
        facts = parse_fiche(pages)
        (TEXT_DIR / f"{ident}.facts.json").write_text(
            json.dumps(facts, ensure_ascii=False, indent=1), encoding="utf-8"
        )
        entry.pop("parsed", None)
        entry["pages"] = facts["pages"]
        entry["unpublished_marker"] = facts["unpublished_marker"]
        if facts["unpublished_marker"]:
            log.warning("fiche %s carries an unpublished marker: excluded", ident)
    save_manifest(manifest)
    return manifest
