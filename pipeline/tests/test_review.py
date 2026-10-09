from pci.review import REVIEW_PATH, collect, coverage, render


def test_review_report_is_current():
    # Regenerate with `pci review` after changing curated data, places, images or sheets.
    assert REVIEW_PATH.read_text(encoding="utf-8") == render(collect())


def test_coverage_adds_up():
    data = collect()
    numbers = dict(coverage(data))
    assert numbers["On the map"] == numbers["Published elements"]
    assert numbers["Documented (summary, timing)"] + numbers["Not documented yet"] == len(
        data["published"]
    )
    pictures = sum(numbers[f"  {k}"] for k in ("Wikimedia Commons", "fiche image via PCI Lab"))
    assert pictures + numbers["  photo from the fiche"] == numbers["With a picture"]


def test_unreviewed_low_confidence_comes_first():
    lines = [line for line in render(collect()).splitlines() if "| event |" in line]
    confidences = [line.split("|")[3].strip() for line in lines]
    order = {"low": 0, "medium": 1, "high": 2}
    assert confidences == sorted(confidences, key=order.__getitem__)
