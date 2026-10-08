"""Detect personal-data patterns (emails, phone numbers) in committed data files."""

import re
from pathlib import Path

EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[a-z]{2,}", re.IGNORECASE)
# French national numbers (0X XX XX XX XX) and international numbers (+33 ..., +590 ...).
PHONE = re.compile(
    r"(?<![\w.])(?:(?:\+|00)\d{2,3}[\s.\-]?\(?0?\)?[\s.\-]?[1-9]|0[1-9])(?:[\s.\-]?\d{2}){4}(?!\d)"
)

TEXT_SUFFIXES = {".json", ".yaml", ".yml", ".html", ".txt", ".csv", ".md"}


def find_personal_data(text: str) -> list[str]:
    return [m.group(0) for m in EMAIL.finditer(text)] + [m.group(0) for m in PHONE.finditer(text)]


def scan(paths: list[Path]) -> dict[Path, list[str]]:
    hits: dict[Path, list[str]] = {}
    for root in paths:
        files = [root] if root.is_file() else sorted(p for p in root.rglob("*") if p.is_file())
        for path in files:
            if path.suffix.lower() not in TEXT_SUFFIXES:
                continue
            found = find_personal_data(path.read_text(encoding="utf-8", errors="replace"))
            if found:
                hits[path] = found
    return hits
