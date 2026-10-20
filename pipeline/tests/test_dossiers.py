"""Research files (content/): Markdown rendering, validation rules and the committed files."""

import pytest

from pci import dossiers
from pci.markdown import inline, render

SOURCES = [
    {
        "id": f"S{i}",
        "title": "Page",
        "publisher": "UNESCO",
        "url": "https://ich.unesco.org/x",
        "consulted": "2026-10-20",
        "kind": "unesco",
    }
    for i in (1, 2, 3)
]
QUESTIONS = [f"Question {i} ?" for i in range(5)]


def element_meta(**over) -> dict:
    meta = {
        "key": "fest-noz",
        "status": "inscribed",
        "decision": "7.COM 11.xx [S1]",
        "unesco_file": "00707 [S1]",
        "states": ["France"],
        "extensions": [],
        "domains": ["performing-arts", "social-practices"],
        "territories": "Bretagne historique [S2].",
        "communities": "Danseurs, chanteurs, musiciens [S2].",
        "bodies": ["Dastum : archives [S3]"],
        "summary_30s": "Le fest-noz est une fête de nuit bretonne. " * 3,
        "key_facts": [f"Fait numéro {i} [S1]" for i in range(5)],
        "conversation": {
            "vocabulary": [{"term": "inscrit", "note": "et non « classé »"}] * 3,
            "mistakes": ["Confondre inventaire et inscription"],
            "sensitive": [],
            "questions": {
                k: QUESTIONS
                for k in ("association", "local_authority", "researcher", "institution")
            },
        },
        "sources": SOURCES,
        "last_checked": "2026-10-20",
    }
    meta.update(over)
    return meta


BODY = "\n\n".join(
    f"## {h}\n\nTexte [S1]."
    for h in dossiers.ELEMENT_SECTIONS
    if h not in dossiers.OPTIONAL_SECTIONS
)
INSCRIPTIONS = {"fest-noz": {"name_fr": "Le fest-noz", "year": 2012, "list": "RL"}}


def test_inline_escapes_html_and_renders_markers():
    out = inline("<b>x</b> **gras** [S2] [À VÉRIFIER] [lien](https://example.org)")
    assert "<b>" not in out and "&lt;b&gt;" in out
    assert "<strong>gras</strong>" in out
    assert 'href="#src-S2"' in out
    assert '<mark class="verify">' in out
    assert '<a href="https://example.org"' in out


def test_inline_refuses_non_http_links():
    assert "href" not in inline("[x](javascript:alert(1))")


def test_render_blocks():
    out = render(
        "## Titre\n\nPara\nsuite.\n\n- un\n- deux\n\n1. a\n2. b\n\n| A | B |\n|---|---|\n| 1 | 2 |"
    )
    assert '<h2 id="titre">Titre</h2>' in out
    assert "<p>Para suite.</p>" in out
    assert "<ul><li>un</li><li>deux</li></ul>" in out
    assert "<ol><li>a</li><li>b</li></ol>" in out
    assert "<td>1</td>" in out


def test_valid_element_passes():
    assert dossiers.check_element("fest-noz", element_meta(), BODY, INSCRIPTIONS) == []


def test_missing_section_unknown_source_and_long_quote_fail():
    body = BODY.replace("## Comparaisons", "## Autre") + "\n\n« " + "mot " * 30 + "» [S9]"
    problems = dossiers.check_element("fest-noz", element_meta(), body, INSCRIPTIONS)
    text = "\n".join(problems)
    assert "sections must be" in text
    assert "[S9] is not in sources" in text
    assert "quote of 30 words" in text


def test_four_questions_and_bad_indicator_fail():
    meta = element_meta()
    meta["conversation"]["questions"] = {
        **meta["conversation"]["questions"],
        "researcher": QUESTIONS[:4],
    }
    body = BODY.replace(
        "## Lien avec le rapport périodique\n\nTexte [S1].",
        "## Lien avec le rapport périodique\n\nI27 [S1].",
    )
    text = "\n".join(dossiers.check_element("fest-noz", meta, body, INSCRIPTIONS))
    assert "researcher" in text
    assert "I27" in text


def test_nomination_needs_titles():
    meta = element_meta(key="biou-arbois", status="nominated")
    text = "\n".join(dossiers.check_element("biou-arbois", meta, BODY, INSCRIPTIONS))
    assert "a nomination needs title_fr" in text


def test_front_matter_dates_become_text():
    meta, body = dossiers.split_front_matter("---\nlast_checked: 2026-10-20\n---\n## A\n")
    assert meta == {"last_checked": "2026-10-20"}
    assert body.startswith("## A")


def test_stats_count_flags():
    stats = dossiers._stats(element_meta(), BODY + "\n[À VÉRIFIER] et [À VÉRIFIER]")
    assert stats["to_verify"] == 2
    assert stats["source_count"] == 3


@pytest.mark.skipif(not dossiers.ELEMENTS_DIR.exists(), reason="no research files yet")
def test_committed_research_files_are_valid(tmp_path):
    dossiers.build_dossiers(output=tmp_path)
    assert (tmp_path / "index.json").exists()


def test_verify_flags_with_a_note_are_counted_and_shown():
    out = inline("Directeur [À VÉRIFIER : direction actuelle].")
    assert '<mark class="verify">à vérifier : direction actuelle</mark>' in out
    stats = dossiers._stats(element_meta(), BODY + "\n[À VÉRIFIER] et [À VÉRIFIER : note]")
    assert stats["to_verify"] == 2
