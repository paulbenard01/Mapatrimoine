"""Hard rule 3: committed data must not contain emails or phone numbers."""

import subprocess

import pytest

from pci import ROOT
from pci.scrub import find_personal_data, scan

# Directories whose committed files are published or fixtures.
SCANNED = ["data", "web/public/data", "pipeline/tests/fixtures"]


@pytest.mark.parametrize(
    "text",
    [
        "Contact: jean.dupont@example.org",
        "Tel 04 68 12 34 56",
        "tél. 0468123456",
        "+33 4 68 12 34 56",
        "+590 590 12 34 56",
        "06.12.34.56.78",
    ],
)
def test_detects_personal_data(text):
    assert find_personal_data(text)


@pytest.mark.parametrize(
    "text",
    [
        "2014_67717_INV_PCI_FRANCE_00359",
        '"lat": 42.699, "lon": 2.9045',
        "Vendredi saint, 2026-04-03",
        "INSEE 66136, page 12",
        "https://www.culture.gouv.fr/Media/Fiches/x.pdf",
    ],
)
def test_ignores_ids_coordinates_and_dates(text):
    assert not find_personal_data(text)


def committed_files():
    out = subprocess.run(
        ["git", "ls-files", *SCANNED], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout
    return [ROOT / line for line in out.splitlines() if line]


def test_committed_data_has_no_personal_data():
    hits = scan(committed_files())
    assert not hits, f"personal data found: { {str(k): v[:3] for k, v in hits.items()} }"
