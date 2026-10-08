# Data notice / Avertissement sur les données

## Source

All heritage data comes from the **Inventaire national du patrimoine culturel immatériel**, published by the **Ministère de la Culture** (France) at
<https://www.culture.gouv.fr/thematiques/patrimoine-culturel-immateriel/le-patrimoine-culturel-immateriel/l-inventaire-national-du-patrimoine-culturel-immateriel>.
Credit: Ministère de la Culture, Inventaire national du patrimoine culturel immatériel. The inventory fiches are written with and by the communities that carry each practice.

## Licence uncertainty

The inventory fiches do not state a licence. The culture.gouv.fr site's legal notice applies the Licence Ouverte / Etalab 2.0 to its content "unless stated otherwise". We have not found an explicit statement for the fiches, so this repository treats their reuse conservatively (see below). If you are the rights holder and object to anything here, please open an issue.

## What this repository republishes

- The list of published elements as it appears on the inventory page: official name, ID, theme(s), year of inclusion and link to the fiche (`web/public/data/inventory.json`).
- For the pilot elements, structured facts: place names and coordinates of communes/départements/regions (from the French government geo API, `geo.api.gouv.fr`).
- Short summaries written in our own words (FR and EN). EN texts marked `lang_review: draft` are unreviewed drafts.
- Short quotes (at most 25 words) used as evidence for event timing, with the page number.
- Links back to the official fiche on culture.gouv.fr.
- For event dates, links to public pages of organisers, town halls and tourism boards, with a one-line summary in our own words of what each page states and the date we checked it. Contact details from those pages are not copied.

## What it does not republish

- Fiche PDFs or their full text (they are downloaded locally for curation only and git-ignored).
- Personal data found in the fiches (names, emails, phone numbers of community members). A CI test blocks email and phone patterns.
- Elements whose fiche was unpublished at the request of the bearers ("Fiche dépubliée à la demande de ..."): they are excluded entirely.

## Timing disclaimer

Event dates are typical timing derived from the official inventory, not a programme. Confirm exact dates with the organisers.

## Code licence

The source code is under the MIT licence (`LICENSE`), Paul Benard's decision to confirm. This MIT licence does not cover the data from the Ministère de la Culture described above.

---

**FR (résumé).** Les données proviennent de l'Inventaire national du PCI (Ministère de la Culture). Les fiches n'indiquent pas de licence ; le site culture.gouv.fr applique par défaut la Licence Ouverte Etalab 2.0 « sauf mention contraire ». Ce dépôt ne republie ni les PDF ni le texte intégral des fiches, ni aucune donnée personnelle, et exclut les fiches dépubliées à la demande des porteurs. Il publie des faits structurés, des résumés rédigés par nos soins, des citations de 25 mots au plus et des liens vers les fiches officielles. Dates indicatives : vérifiez auprès des organisateurs.
