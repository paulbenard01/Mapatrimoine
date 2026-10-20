"""In-depth research files (recherche/PROTOCOLE.md), validated and published for the site.

  content/elements/<key>.md         one file per UNESCO inscription (key of data/unesco.yaml)
  content/dossiers/<NN>-<slug>.md   thematic dossiers

Each file is YAML front matter + Markdown. The build checks the front matter against its
schema, the section headings, the source markers ([S3] must exist), the length of quotes
(25 words at most, hard rule 1) and the indicator ids (I1 to I26), counts the
"[À VÉRIFIER]" flags and writes web/public/data/dossiers/{index,<key>}.json.
"""

import json
import re
from datetime import date
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

from pci import DATA, ROOT, SCHEMA
from pci.index import INDEX_PATH
from pci.markdown import SOURCE, VERIFY, inline, render, slug

CONTENT = ROOT / "content"
ELEMENTS_DIR = CONTENT / "elements"
THEMES_DIR = CONTENT / "dossiers"
OUTPUT_DIR = ROOT / "web" / "public" / "data" / "dossiers"
UNESCO_PATH = DATA / "unesco.yaml"

ELEMENT_SECTIONS = [
    "Description approfondie",
    "Histoire et contexte",
    "Parcours d'inscription",
    "Sauvegarde et viabilité",
    "Enjeux et débats actuels",
    "Chiffres clés",
    "Qui est qui",
    "Lien avec le rapport périodique",
    "Comparaisons",
    "Ressources",
]
OPTIONAL_SECTIONS = {"Enjeux et débats actuels"}
QUOTE = re.compile(r"«\s*(.+?)\s*»", re.S)
INDICATOR = re.compile(r"\bI(\d{1,2})\b")
MAX_QUOTE_WORDS = 25


class DossierError(Exception):
    pass


def _validator(name: str) -> Draft202012Validator:
    return Draft202012Validator(json.loads((SCHEMA / name).read_text(encoding="utf-8")))


def _dates_to_text(value):
    """PyYAML reads 2026-10-20 as a date; the schemas and the JSON want text."""
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _dates_to_text(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_dates_to_text(v) for v in value]
    return value


def split_front_matter(text: str) -> tuple[dict, str]:
    if not text.startswith("---\n"):
        raise DossierError("missing YAML front matter (--- on the first line)")
    end = text.find("\n---\n", 4)
    if end < 0:
        raise DossierError("front matter is not closed by a --- line")
    meta = yaml.safe_load(text[4:end]) or {}
    if not isinstance(meta, dict):
        raise DossierError("front matter must be a mapping")
    return _dates_to_text(meta), text[end + 5 :]


def sections(body: str) -> list[tuple[str, str]]:
    """[(heading, markdown)] for each `## ` section; text before the first one is ignored."""
    parts = re.split(r"^## +(.+?)\s*$", body, flags=re.M)
    return [(parts[i].strip(), parts[i + 1].strip()) for i in range(1, len(parts), 2)]


def _strings(value) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return [s for v in value.values() for s in _strings(v)]
    if isinstance(value, list):
        return [s for v in value for s in _strings(v)]
    return []


def text_problems(label: str, texts: list[str], source_ids: set[str]) -> list[str]:
    problems = []
    for text in texts:
        for ref in SOURCE.findall(text):
            if ref not in source_ids:
                problems.append(f"{label}: [{ref}] is not in sources")
        for quote in QUOTE.findall(text):
            words = len(quote.split())
            if words > MAX_QUOTE_WORDS:
                problems.append(f"{label}: quote of {words} words (max {MAX_QUOTE_WORDS})")
    return problems


def check_sources(label: str, sources: list[dict]) -> list[str]:
    ids = [s.get("id") for s in sources if isinstance(s, dict)]
    return [
        f"{label}: duplicate source id {i}" for i in sorted({i for i in ids if ids.count(i) > 1})
    ]


def check_element(key: str, meta: dict, body: str, inscriptions: dict) -> list[str]:
    label = f"content/elements/{key}.md"
    problems = [
        f"{label}: {'/'.join(map(str, e.absolute_path)) or '(root)'}: {e.message}"
        for e in _validator("dossier-element.schema.json").iter_errors(meta)
    ]
    if meta.get("key") != key:
        problems.append(f"{label}: key must match the file name")
    if meta.get("status") == "inscribed" and key not in inscriptions:
        problems.append(f"{label}: inscribed but not an inscription key in data/unesco.yaml")
    if meta.get("status") == "nominated":
        missing = [f for f in ("title_fr", "title_en", "list", "year") if f not in meta]
        problems += [f"{label}: a nomination needs {f}" for f in missing]
    headings = [h for h, _ in sections(body)]
    expected = [h for h in ELEMENT_SECTIONS if h in headings or h not in OPTIONAL_SECTIONS]
    if headings != expected:
        problems.append(f"{label}: sections must be {expected}, found {headings}")
    ids = {s["id"] for s in meta.get("sources") or [] if isinstance(s, dict) and "id" in s}
    problems += check_sources(label, meta.get("sources") or [])
    problems += text_problems(
        label, _strings({k: v for k, v in meta.items() if k != "sources"}), ids
    )
    problems += text_problems(label, [body], ids)
    for n in INDICATOR.findall(dict(sections(body)).get("Lien avec le rapport périodique", "")):
        if not 1 <= int(n) <= 26:
            problems.append(f"{label}: indicator I{n} is outside I1-I26")
    return problems


def check_theme(name: str, meta: dict, body: str, keys: set[str]) -> list[str]:
    label = f"content/dossiers/{name}.md"
    problems = [
        f"{label}: {'/'.join(map(str, e.absolute_path)) or '(root)'}: {e.message}"
        for e in _validator("dossier-theme.schema.json").iter_errors(meta)
    ]
    if not re.fullmatch(r"\d{2}-[a-z0-9-]+", name) or int(name[:2]) != meta.get("number"):
        problems.append(f"{label}: file name must be <NN>-<slug> with NN = number")
    problems += [f"{label}: unknown element {k}" for k in meta.get("elements", []) if k not in keys]
    if not sections(body):
        problems.append(f"{label}: needs ## sections")
    ids = {s["id"] for s in meta.get("sources") or [] if isinstance(s, dict) and "id" in s}
    problems += check_sources(label, meta.get("sources") or [])
    problems += text_problems(label, [meta.get("title", ""), body], ids)
    return problems


def _html(value):
    """Inline-render every string of a front matter value."""
    if isinstance(value, str):
        return inline(value)
    if isinstance(value, dict):
        return {k: _html(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_html(v) for v in value]
    return value


def _stats(meta: dict, body: str) -> dict:
    text = "\n".join(_strings({k: v for k, v in meta.items() if k != "sources"})) + "\n" + body
    words = len(re.findall(r"\w+", SOURCE.sub("", text)))
    return {"to_verify": text.count(VERIFY), "words": words, "source_count": len(meta["sources"])}


def _rendered_sections(body: str) -> list[dict]:
    return [{"id": slug(h), "title": h, "html": render(md)} for h, md in sections(body)]


def element_payload(key: str, meta: dict, body: str, inscriptions: dict, index: dict) -> dict:
    record = inscriptions.get(key, {})
    linked = [i for i, v in (load_unesco().get("elements") or {}).items() if v["unesco"] == key]
    inventory = []
    for ident in dict.fromkeys(linked + list(meta.get("inventory", []))):
        entry = index.get(ident, {})
        inventory.append(
            {
                "id": ident,
                "title": entry.get("title", ident),
                "year_included": entry.get("year_included"),
                "fiche_url": entry.get("fiche_url"),
            }
        )
    identity = {
        k: _html(meta[k])
        for k in (
            "decision",
            "unesco_file",
            "states",
            "extensions",
            "territories",
            "communities",
            "bodies",
        )
    }
    identity["domains"] = meta["domains"]
    return {
        "kind": "element",
        "key": key,
        "status": meta["status"],
        "title_fr": meta.get("title_fr") or record.get("name_fr"),
        "title_en": meta.get("title_en") or record.get("name_en"),
        "list": meta.get("list") or record.get("list"),
        "year": meta.get("year") or record.get("year"),
        "unesco_url": meta.get("unesco_url") or record.get("url"),
        "multinational": record.get("multinational", len(meta["states"]) > 1),
        "inventory": inventory,
        "identity": identity,
        "summary_30s": inline(meta["summary_30s"]),
        "key_facts": _html(meta["key_facts"]),
        "conversation": _html(meta["conversation"]),
        "sections": _rendered_sections(body),
        "sources": meta["sources"],
        "last_checked": meta["last_checked"],
        **_stats(meta, body),
    }


def theme_payload(name: str, meta: dict, body: str) -> dict:
    return {
        "kind": "theme",
        "key": name,
        "number": meta["number"],
        "title": meta["title"],
        "elements": meta["elements"],
        "sections": _rendered_sections(body),
        "sources": meta["sources"],
        "last_checked": meta["last_checked"],
        **_stats(meta, body),
    }


def load_unesco() -> dict:
    return yaml.safe_load(UNESCO_PATH.read_text(encoding="utf-8")) or {}


def _read(directory: Path) -> list[tuple[str, dict, str]]:
    items = []
    for path in sorted(directory.glob("*.md")) if directory.exists() else []:
        try:
            meta, body = split_front_matter(path.read_text(encoding="utf-8"))
        except (DossierError, yaml.YAMLError) as exc:
            raise DossierError(f"{path.relative_to(ROOT)}: {exc}") from exc
        items.append((path.stem, meta, body))
    return items


def build_dossiers(output: Path = OUTPUT_DIR) -> dict[str, int]:
    inscriptions = load_unesco().get("inscriptions") or {}
    index = {e["id"]: e for e in json.loads(INDEX_PATH.read_text(encoding="utf-8"))["elements"]}
    elements, themes = _read(ELEMENTS_DIR), _read(THEMES_DIR)
    keys = set(inscriptions) | {k for k, _, _ in elements}
    problems = [p for k, m, b in elements for p in check_element(k, m, b, inscriptions)]
    problems += [p for n, m, b in themes for p in check_theme(n, m, b, keys)]
    if problems:
        raise DossierError("\n".join(problems))
    output.mkdir(parents=True, exist_ok=True)
    for stale in output.glob("*.json"):
        stale.unlink()
    listing: dict[str, list] = {"elements": [], "themes": []}
    for key, meta, body in elements:
        payload = element_payload(key, meta, body, inscriptions, index)
        _write(output / f"{key}.json", payload)
        listing["elements"].append(
            {
                f: payload[f]
                for f in (
                    "key",
                    "status",
                    "title_fr",
                    "list",
                    "year",
                    "last_checked",
                    "to_verify",
                    "words",
                    "source_count",
                )
            }
            | {"inventory": [i["id"] for i in payload["inventory"]]}
        )
    for name, meta, body in themes:
        payload = theme_payload(name, meta, body)
        _write(output / f"{name}.json", payload)
        listing["themes"].append(
            {
                f: payload[f]
                for f in (
                    "key",
                    "number",
                    "title",
                    "elements",
                    "last_checked",
                    "to_verify",
                    "words",
                    "source_count",
                )
            }
        )
    listing["elements"].sort(key=lambda e: (-(e["year"] or 0), e["title_fr"] or ""))
    listing["themes"].sort(key=lambda t: t["number"])
    _write(output / "index.json", listing)
    if output == OUTPUT_DIR:
        write_tracking()
    return {"elements": len(elements), "themes": len(themes)}


def _write(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")


def source_urls() -> list[tuple[str, str]]:
    """(file, url) for every source and inline link in content/, for `pci check-links`."""
    found = []
    for directory, prefix in ((ELEMENTS_DIR, "elements"), (THEMES_DIR, "dossiers")):
        for name, meta, body in _read(directory):
            label = f"content/{prefix}/{name}.md"
            urls = [
                s["url"] for s in meta.get("sources") or [] if isinstance(s, dict) and "url" in s
            ]
            urls += re.findall(r"\]\((https?://[^\s)]+)\)", body)
            found += [(label, u) for u in dict.fromkeys(urls)]
    return found


# ---------- tracking (recherche/suivi.md, recherche/a-telecharger.md) ----------
RESEARCH = ROOT / "recherche"
NOTES_DIR = RESEARCH / "notes"
STATUS_LABELS = {
    None: "à faire",
    "in-progress": "en recherche",
    "drafted": "rédigé",
    "verified": "vérifié",
}
THEME_PLAN = {
    1: "Le système UNESCO du PCI",
    2: "La politique française du PCI",
    3: "Les savoir-faire artisanaux et les métiers d'art",
    4: "Les musiques, danses et chants",
    5: "Les fêtes, rituels et carnavals",
    6: "L'alimentation et la gastronomie",
    7: "La nature, les territoires et l'environnement",
    8: "Les outre-mer",
    9: "Le multinational et la diplomatie culturelle",
    10: "Les débats critiques sur le PCI",
}


def _row(label: str, meta: dict | None, body: str) -> str:
    if meta is None:
        return f"| {label} | à faire | | | |"
    status = STATUS_LABELS[meta.get("research_status", "drafted")]
    stats = _stats(meta, body) if meta.get("sources") else {"source_count": 0, "to_verify": 0}
    return (
        f"| {label} | {status} | {meta.get('last_checked', '')} "
        f"| {stats['source_count']} | {stats['to_verify']} |"
    )


def tracking_markdown(elements, themes, inscriptions: dict) -> str:
    by_key = {k: (m, b) for k, m, b in elements}
    by_number = {m.get("number"): (n, m, b) for n, m, b in themes}
    head = "| {} | État | Vérifié le | Sources | À vérifier |\n|---|---|---|---:|---:|"
    lines = [
        "# Suivi des fiches approfondies",
        "",
        "Généré par `pci build` à partir de `content/` ; ne pas modifier à la main. "
        "L'état vient du champ `research_status` de chaque fiche.",
        "",
        "## Éléments inscrits et candidatures",
        "",
        head.format("Élément"),
    ]
    order = sorted(inscriptions.items(), key=lambda kv: (-kv[1]["year"], kv[0]))
    keys = [k for k, _ in order] + sorted(set(by_key) - set(inscriptions))
    for key in keys:
        meta, body = by_key.get(key, (None, ""))
        name = inscriptions.get(key, {}).get("name_fr") or (meta or {}).get("title_fr") or key
        year = inscriptions.get(key, {}).get("year") or (meta or {}).get("year", "")
        lines.append(_row(f"{name} ({year}, `{key}`)", meta, body))
    lines += ["", "## Dossiers thématiques", "", head.format("Dossier")]
    for number, title in THEME_PLAN.items():
        name, meta, body = by_number.get(number, (None, None, ""))
        lines.append(_row(f"{number}. {title}" + (f" (`{name}`)" if name else ""), meta, body))
    return "\n".join(lines) + "\n"


def downloads_markdown() -> str:
    """Collect the "Documents à télécharger" section of every recherche/notes/<key>.md."""
    lines = [
        "# Documents à télécharger à la main",
        "",
        "Généré par `pci build` à partir de `recherche/notes/` ; ne pas modifier à la main. "
        "Le site de l'UNESCO bloque souvent les téléchargements automatiques : déposer chaque "
        "document dans `sources/<clé>/` (dossier non versionné).",
    ]
    for path in sorted(NOTES_DIR.glob("*.md")) if NOTES_DIR.exists() else []:
        notes = dict(sections(path.read_text(encoding="utf-8")))
        wanted = notes.get("Documents à télécharger", "").strip()
        if wanted:
            lines += ["", f"## {path.stem}", "", wanted]
    return "\n".join(lines) + "\n"


def write_tracking() -> None:
    inscriptions = load_unesco().get("inscriptions") or {}
    RESEARCH.mkdir(exist_ok=True)
    (RESEARCH / "suivi.md").write_text(
        tracking_markdown(_read(ELEMENTS_DIR), _read(THEMES_DIR), inscriptions), encoding="utf-8"
    )
    (RESEARCH / "a-telecharger.md").write_text(downloads_markdown(), encoding="utf-8")
