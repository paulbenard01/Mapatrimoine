from pci.fiches import parse_fiche, readable, sections

NEW_FORMAT = [
    "FICHE D'INVENTAIRE DU PATRIMOINE CULTUREL IMMATÉRIEL\nDescription sommaire\nUne fête.\n",
    """I.1. Nom
Nom En français
La fête de l'exemple
En langue régionale
La hèsta
I.2 Domaine de classification
Pratiques sociales, rituels et événements festifs
I.3 Communautés, groupes associés et individus liés à la pratique
Une association.
I.4. Localisation physique
Lieu de la pratique en France
Région Occitanie, Département des Pyrénées-Orientales, ville de Perpignan.
Pratiques similaires en France et à l'étranger
En Catalogne.
I.5. Description détaillée
Le vendredi saint.
""",
]

OLD_FORMAT = [
    """« Exemple »
Présentation sommaire
Identification :
Carnaval, promenade des bœufs gras

Personne(s) rencontrée(s) :
Jean Exemple, éleveur

Localisation (région, département,
municipalité) :
Aquitaine, Gironde, Bazas

Indexation : 112417
""",
]


def test_sections_split_on_numbered_headings():
    parts = sections("\n".join(NEW_FORMAT))
    assert list(parts)[:5] == ["I.1", "I.2", "I.3", "I.4", "I.5"]


def test_parses_current_fiche_format():
    facts = parse_fiche(NEW_FORMAT)
    assert facts["name"] == "La fête de l'exemple"
    assert facts["domain"] == "Pratiques sociales, rituels et événements festifs"
    assert facts["location"] == (
        "Région Occitanie, Département des Pyrénées-Orientales, ville de Perpignan"
    )
    assert facts["pages"] == 2
    assert facts["unpublished_marker"] is False


def test_parses_old_form_without_personal_names():
    facts = parse_fiche(OLD_FORMAT)
    assert facts["name"] == "Carnaval, promenade des bœufs gras"
    assert facts["location"] == "Aquitaine, Gironde, Bazas"
    assert "Jean" not in str(facts)


def test_detects_unpublished_marker():
    assert parse_fiche(["Fiche dépubliée à la demande de la communauté"])["unpublished_marker"]


def test_readable_rejects_symbol_soup():
    assert readable(NEW_FORMAT)
    assert not readable(['  "# $ #  %&\'\' ( ) * + ) , ,  - " / $ # ! " !' * 20])
