"""Scrape the inventory page (and the official PDF list) into data/index.json."""

import json
import logging
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit

from bs4 import BeautifulSoup, Tag

from pci import DATA
from pci.http import FetchError, PoliteClient

INVENTORY_URL = (
    "https://www.culture.gouv.fr/Thematiques/patrimoine-culturel-immateriel/"
    "Le-Patrimoine-culturel-immateriel/l-inventaire-national-du-patrimoine-culturel-immateriel"
)
HOST = "https://www.culture.gouv.fr"
INDEX_PATH = DATA / "index.json"

# The seven theme headings (h2) of the inventory page, mapped to stable slugs.
THEMES = {
    "les pratiques sociales et festives": "social-festive",
    "les traditions et expressions orales": "oral",
    "les pratiques physiques": "physical",
    "les arts du spectacle": "performing-arts",
    "les jeux": "games",
    "les rituels": "rituals",
    "les savoirs et savoir-faire": "know-how",
}

# IDs as written on the page, tolerating stray spaces ("202 3 _67717_..._005 20").
RAW_ID = re.compile(r"^\s*(\d[\d\s]{1,5}_\s*\d+\s*_INV_PCI_FRANCE_[\d\s]*\d)\s*:")
ID = re.compile(r"^\d{4}_\d+_INV_PCI_FRANCE_\d{5}$")

log = logging.getLogger(__name__)


def normalise_id(raw: str) -> str:
    """Remove stray whitespace; repair a 3-digit year typo ("010_" -> "2010_")."""
    ident = re.sub(r"\s+", "", raw)
    if re.match(r"^0\d\d_", ident):
        ident = "2" + ident
    return ident


def normalise_url(href: str | None) -> str | None:
    """Make a scraped href absolute on https://www.culture.gouv.fr, keeping its path as-is."""
    if not href or not href.strip():
        return None
    href = href.strip()
    if href.startswith("http:///") or href.startswith("https:///"):
        href = href.split("://", 1)[1].lstrip("/")
        href = "/" + href
    parts = urlsplit(urljoin(HOST + "/", href))
    if parts.netloc in ("culture.gouv.fr", "www.culture.gouv.fr"):
        parts = parts._replace(scheme="https", netloc="www.culture.gouv.fr")
    return urlunsplit(parts)


def _element_title(item: Tag) -> str:
    """Official name: the <strong> texts of the element's own <li>, outside nested lists."""
    parts = []
    for strong in item.find_all("strong"):
        if strong.find_parent("li") is not item:
            continue
        text = strong.get_text(" ", strip=True)
        if text:
            parts.append(text)
    title = " ".join(parts)
    title = re.sub(r"\s+", " ", title).strip()
    return re.sub(r"[\s/,;:]+$", "", title)


def parse_index(html: str) -> list[dict]:
    """Return one record per element ID, in page order; an ID listed under several themes
    keeps all of them in `themes`, the first being `theme`."""
    soup = BeautifulSoup(html, "html.parser")
    records: dict[str, dict] = {}
    theme = None
    for node in soup.find_all(["h2", "li"]):
        if node.name == "h2":
            key = node.get_text(" ", strip=True).lower()
            theme = THEMES.get(key, theme if key.startswith("fiches") else None)
            continue
        if theme is None:
            continue
        match = RAW_ID.match(node.get_text(" ", strip=True))
        if not match:
            continue
        raw = match.group(1)
        ident = normalise_id(raw)
        if not ID.match(ident):
            log.warning("skipping unparseable id %r", raw)
            continue
        if ident in records:
            if theme not in records[ident]["themes"]:
                records[ident]["themes"].append(theme)
            continue
        parent = node.find_parent("li")
        link = node.find("a")
        record = {
            "id": ident,
            "title": _element_title(parent) if parent else "",
            "theme": theme,
            "themes": [theme],
            "year_included": int(ident[:4]),
            "fiche_url": normalise_url(link.get("href") if link else None),
            "unpublished": False,
        }
        if not record["title"] and link:
            record["title"] = link.get_text(" ", strip=True)
        if re.sub(r"\s+", "", raw) != ident:
            record["id_as_published"] = raw
        records[ident] = record
    return list(records.values())


def find_list_pdf_url(html: str) -> str | None:
    """The official 'Liste exhaustive' PDF linked from the page (link text contains 'Liste')."""
    soup = BeautifulSoup(html, "html.parser")
    for a in soup.find_all("a", href=True):
        if re.search(r"\bliste", a.get_text(), re.IGNORECASE) and ".pdf" in a["href"].lower():
            return normalise_url(a["href"])
    return None


@dataclass
class Word:
    page: int
    x: float
    y: float
    text: str


def words_from_bbox_xml(xml: str) -> list[Word]:
    """Parse `pdftotext -bbox` output into positioned words."""
    words, page = [], -1
    for line in xml.splitlines():
        if "<page " in line:
            page += 1
        m = re.search(r'<word xMin="([\d.]+)" yMin="([\d.]+)"[^>]*>(.*)</word>', line)
        if m:
            words.append(Word(page, float(m.group(1)), float(m.group(2)), m.group(3)))
    return words


def unpublished_ids(words: list[Word], column_tolerance: float = 110.0) -> set[str]:
    """IDs followed (below, same column) by the marker 'Fiche dépubliée ...'.

    In the two-column list PDF, the marker sits under the element's ID, slightly indented."""
    ids = [w for w in words if ID.match(w.text)]
    found = set()
    for w in words:
        if not w.text.lower().startswith("dépubli"):
            continue
        above = [
            i for i in ids if i.page == w.page and i.y < w.y and abs(i.x - w.x) < column_tolerance
        ]
        if above:
            found.add(max(above, key=lambda i: i.y).text)
    return found


def pdf_words(pdf: bytes) -> list[Word]:
    """Positioned words via poppler's pdftotext; pypdf fallback when it is not installed."""
    if shutil.which("pdftotext"):
        with tempfile.NamedTemporaryFile(suffix=".pdf") as tmp:
            tmp.write(pdf)
            tmp.flush()
            out = subprocess.run(
                ["pdftotext", "-bbox", tmp.name, "-"], capture_output=True, check=True
            ).stdout.decode("utf-8")
        return words_from_bbox_xml(out)
    import io

    from pypdf import PdfReader

    words: list[Word] = []
    reader = PdfReader(io.BytesIO(pdf))
    for n, page in enumerate(reader.pages):
        height = float(page.mediabox.height)

        def visit(text, cm, tm, font, size, n=n, height=height):
            for token in text.split():
                words.append(Word(n, tm[4], height - tm[5], token))

        page.extract_text(visitor_text=visit)
    return words


def fetch_index(client: PoliteClient | None = None, out: Path = INDEX_PATH) -> list[dict]:
    client = client or PoliteClient()
    html = client.get(INVENTORY_URL).decode("utf-8")
    records = parse_index(html)
    list_url = find_list_pdf_url(html)
    unpublished: set[str] = set()
    if list_url:
        try:
            unpublished = unpublished_ids(pdf_words(client.get(list_url)))
        except (FetchError, subprocess.CalledProcessError) as exc:
            log.warning("could not read the official list PDF: %s", exc)
    else:
        log.warning("official list PDF link not found on the inventory page")
    for record in records:
        record["unpublished"] = record["id"] in unpublished
    listed = {r["id"] for r in records}
    payload = {
        "source": INVENTORY_URL,
        "list_pdf": list_url,
        "unpublished_in_list_pdf": sorted(unpublished),
        "unpublished_listed_on_page": sorted(unpublished & listed),
        "count": len(records),
        "elements": records,
    }
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return records
